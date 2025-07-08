import React, { Component } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { performCheckIn } from '../supabaseClient';

class Scanner extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isScanning: false,
      banner: null,
      error: null,
      cameraPermission: null
    };
    this.scanner = null;
    this.scannerElementId = 'qr-reader';
  }

  componentWillUnmount() {
    this.stopScanning();
  }

  qrbox = (viewfinderWidth, viewfinderHeight) => {
    const minEdgePercentage = 0.7;
    const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
    const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
    return {
      width: qrboxSize,
      height: qrboxSize,
    };
  };

  requestCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment' // Use back camera by default
        } 
      });
      
      // Stop the stream immediately, we just needed to check permission
      stream.getTracks().forEach(track => track.stop());
      
      this.setState({ cameraPermission: 'granted' });
      return true;
    } catch (error) {
      console.error('Camera permission error:', error);
      this.setState({ 
        cameraPermission: 'denied',
        error: 'Camera access denied. Please allow camera access and try again.'
      });
      return false;
    }
  };

  startScanning = async () => {
    const gateId = sessionStorage.getItem('gate_id');
    const gateType = sessionStorage.getItem('gate_type');

    if (!gateId || !gateType) {
      this.setState({ error: 'Please select a gate first' });
      return;
    }

    const hasPermission = await this.requestCameraPermission();
    if (!hasPermission) {
      return;
    }

    // Set isScanning to true and initialize the scanner in the callback
    this.setState({ isScanning: true, error: null }, () => {
      this.initializeScanner();
    });
  };

  initializeScanner = async () => {
    try {
      // Clear any existing scanner to avoid conflicts
      if (this.scanner) {
        await this.scanner.clear();
        this.scanner = null;
      }

      // The element should exist now since this is called after render
      const scannerElement = document.getElementById(this.scannerElementId);
      if (!scannerElement) {
        console.error('Scanner element not found. This should not happen.');
        this.setState({
          error: 'Scanner UI element failed to load. Please refresh and try again.',
          isScanning: false,
        });
        return;
      }

      this.scanner = new Html5QrcodeScanner(
        this.scannerElementId,
        {
          fps: 10,
          qrbox: this.qrbox,
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
          supportedScanTypes: [Html5QrcodeSupportedFormats.QR_CODE],
          rememberLastUsedCamera: true,
          verbose: false,
        },
        false // verbose logging
      );

      this.scanner.render(this.onScanSuccess, this.onScanError);
    } catch (error) {
      console.error('Scanner initialization error:', error);
      this.setState({
        error: 'Failed to initialize scanner. Please try again.',
        isScanning: false,
      });
    }
  };

  stopScanning = async () => {
    if (this.scanner) {
      try {
        await this.scanner.clear();
        this.scanner = null;
      } catch (error) {
        console.error('Error stopping scanner:', error);
      }
    }
    this.setState({ isScanning: false, scanning: false });
  };

  onScanSuccess = async (text) => {
    if (this.state.scanning) {
      try {
        this.setState({ scanning: false, isProcessing: true });
        console.log(`QR Code detected: ${text}`);
        
        // Get current gate from session storage
        const gateId = sessionStorage.getItem('gate_id');
        const gateType = sessionStorage.getItem('gate_type');
        
        if (!gateId || !gateType) {
          this.setState({ error: "Gate not selected. Please select a gate before scanning.", isProcessing: false });
          return;
        }
        
        // Get current user ID for checked_in_by
        const auth = this.props.supabaseAuth;
        const checkedInBy = auth?.user?.id || 'unknown';
        
        // Call the updated check-in function with the QR code value and all required params
        const result = await performCheckIn(text, gateId, gateType, checkedInBy);
        console.log('Check-in result:', result);
        
        if (!result.success) {
          // If already checked in, show a success banner with info
          if (result.alreadyCheckedIn) {
            this.setState({ successMessage: result.message || "Participant already checked in!", showSuccessBanner: true, isProcessing: false });
          } else {
            this.setState({ error: result.message || "Check-in failed", isProcessing: false });
          }
        } else {
          this.setState({ successMessage: "Check-in successful!", showSuccessBanner: true, isProcessing: false });
          
          // If the refreshParticipants function is available, call it
          if (this.props.refreshParticipants) {
            this.props.refreshParticipants();
          }
        }
      } catch (error) {
        console.error('Scan error:', error);
        this.setState({ error: error.message || "An error occurred during check-in", isProcessing: false });
      } finally {
        // Re-enable scanning after a delay
        setTimeout(() => {
          this.setState({ scanning: true });
        }, 3000);
      }
    }
  };

  onScanError = (error) => {
    // Only log actual errors, not scanning attempts
    if (!error.includes('NotFoundException') && 
        !error.includes('NotFoundError') && 
        !error.includes('No MultiFormat Readers')) {
      console.warn('QR scan error:', error);
    }
  };

  showBanner = (type, message) => {
    this.setState({ banner: { type, message } });
    
    // Hide banner after 1 second and restart scanning
    setTimeout(() => {
      this.setState({ banner: null });
      // Auto restart scanning after banner disappears
      if (!this.state.isScanning) {
        this.startScanning();
      }
    }, 1000);
  };

  render() {
    const { isScanning, banner, error, cameraPermission } = this.state;

    return (
      <div className="space-y-6">
        {/* Banner */}
        {banner && (
          <div className={`p-4 rounded-lg text-white font-medium text-center ${
            banner.type === 'success' ? 'bg-green-600' :
            banner.type === 'warning' ? 'bg-yellow-600' :
            'bg-red-600'
          }`}>
            {banner.message}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-900 border border-red-700 text-red-200 rounded-lg">
            {error}
            {cameraPermission === 'denied' && (
              <div className="mt-2 text-sm">
                <p>To enable camera access:</p>
                <ul className="list-disc list-inside mt-1">
                  <li>Click the camera icon in your browser's address bar</li>
                  <li>Select "Allow" for camera access</li>
                  <li>Refresh the page and try again</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Scanner Interface */}
        <div className="bg-gray-800 rounded-lg p-6">
          {!isScanning ? (
            <div className="text-center space-y-4">
              <div className="w-32 h-32 mx-auto bg-gray-700 rounded-lg flex items-center justify-center">
                <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <button
                onClick={this.startScanning}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Start Scan
              </button>
              <p className="text-gray-400 text-sm">
                Point camera at QR code to begin scanning
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div 
                id={this.scannerElementId}
                className="max-w-full rounded-lg overflow-hidden"
                style={{ width: '100%' }}
              />
              <button
                onClick={this.stopScanning}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Stop Scan
              </button>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-2">Scanning Instructions:</h3>
          <ul className="text-gray-300 text-sm space-y-1">
            <li>• Allow camera access when prompted</li>
            <li>• Ensure good lighting</li>
            <li>• Hold QR code steady within the frame</li>
            <li>• Wait for automatic detection</li>
            <li>• Scanner will restart automatically after each scan</li>
          </ul>
        </div>
      </div>
    );
  }
}

export default Scanner;