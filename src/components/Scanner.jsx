import React, { Component } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { getParticipantByQrCode, performCheckIn } from '../supabaseClient';
import { Check, X } from 'lucide-react';
import '../styles/scanner-custom.css';

class Scanner extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isScanning: false,
      scanning: false, // Explicit state for scan callback
      banner: null,
      error: null,
      cameraPermission: null,
      participantData: null,
      showParticipantModal: false,
      isProcessingCheckIn: false,
      checkInSuccess: false,
      checkInError: null,
      isProcessing: false,
      manualQrCode: '',
      isSubmittingManual: false,
      modalStartY: 0,
      modalCurrentY: 0,
      isDragging: false
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

    // Set both scanning flags to true and initialize the scanner in the callback
    this.setState({ 
      isScanning: true, 
      scanning: true,  // Important: Set scanning state for QR callback
      error: null,
      showParticipantModal: false, // Reset any previous modal
      participantData: null,
      checkInSuccess: false,
      checkInError: null
    }, () => {
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
    
    // Make sure both flags are set to false
    this.setState({ 
      isScanning: false, 
      scanning: false,
      isProcessing: false
    });
  };

  onScanSuccess = async (qrCodeMessage) => {
    try {
      if (!this.state.scanning) {
        console.log('Ignoring scan callback when scan is disabled');
        return;
      }
      
      console.log('QR code detected:', qrCodeMessage);
      
      // Stop scanning temporarily
      this.setState({ scanning: false, isProcessing: true });
      
      // Process the QR code
      await this.processQrCode(qrCodeMessage);
      
    } catch (error) {
      console.error('Error in scan success handler:', error);
      this.setState({
        error: 'Failed to process QR code: ' + (error.message || 'Unknown error'),
        isProcessing: false
      });
      
      // Re-enable scanning after error
      setTimeout(() => {
        if (this.state.isScanning) { // Only if still supposed to be scanning
          this.setState({ scanning: true });
        }
      }, 2000);
    }
  };
  
  // Handle manual QR code input change
  handleManualQrCodeChange = (e) => {
    this.setState({ manualQrCode: e.target.value });
  };
  
  // Submit manual QR code
  handleManualQrCodeSubmit = async (e) => {
    e.preventDefault();
    const { manualQrCode, isSubmittingManual } = this.state;
    
    if (!manualQrCode.trim() || isSubmittingManual) return;
    
    try {
      this.setState({ isSubmittingManual: true, error: null });
      console.log('Processing manual QR code:', manualQrCode);
      
      // Use the same processQrCode function to handle manual input
      await this.processQrCode(manualQrCode);
      
      // Clear the input field after successful processing
      this.setState({ manualQrCode: '', isSubmittingManual: false });
    } catch (error) {
      console.error('Error processing manual QR code:', error);
      this.setState({ 
        error: 'Failed to process manual QR code: ' + (error.message || 'Unknown error'),
        isSubmittingManual: false
      });
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

  processQrCode = async (qrCodeMessage) => {
    try {
      // Check if gate is selected
      const gateId = sessionStorage.getItem('gate_id');
      const gateType = sessionStorage.getItem('gate_type');
      
      if (!gateId || !gateType) {
        this.setState({ 
          error: 'Silakan pilih gate terlebih dahulu',
          isProcessing: false 
        });
        return;
      }

      // Standardize QR code: trim whitespace and convert to uppercase
      const standardizedQrCode = qrCodeMessage.trim().toUpperCase();
      console.log(`Standardized QR code: ${standardizedQrCode}`);

      // Get participant data
      console.log(`Fetching participant data for QR: ${standardizedQrCode}`);
      const participantResult = await getParticipantByQrCode(standardizedQrCode, gateId, gateType);
      console.log('Participant result:', participantResult);
      
      if (participantResult.error) {
        this.setState({ 
          error: participantResult.error.message || 'Failed to fetch participant data',
          isProcessing: false 
        });
        return;
      }
      
      if (!participantResult.data) {
        this.setState({ 
          error: 'Peserta tidak ditemukan',
          isProcessing: false 
        });
        return;
      }

      // Show participant data
      this.setState({ 
        participantData: participantResult.data,
        showParticipantModal: true,
        isProcessing: false,
        checkInSuccess: false,
        checkInError: null
      });
      
    } catch (error) {
      console.error('Error processing QR code:', error);
      this.setState({ 
        error: 'Failed to process QR code: ' + error.message,
        isProcessing: false 
      });
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

  handleCheckIn = async (gateId, gateType) => {
    try {
      this.setState({ isProcessingCheckIn: true });
      
      // Get current user ID for checked_in_by
      const auth = this.props.supabaseAuth;
      const checkedInBy = auth?.user?.id || null; // Use null instead of 'unknown' for UUID field
      
      const { participantData } = this.state;
      
      // Call the updated check-in function
      const result = await performCheckIn(participantData.id, gateId, gateType, checkedInBy);
      console.log('Check-in result:', result);
      
      if (result.success) {
        // Update UI to show success and close modal after delay
        this.setState({ 
          checkInSuccess: true,
          checkInError: null,
          successMessage: "Check-in berhasil!", 
          showSuccessBanner: true,
          isProcessingCheckIn: false
        });
        
        // Close modal after success
        setTimeout(() => {
          this.setState({
            showParticipantModal: false,
            participantData: null
          });
          
          // Re-enable scanning
          setTimeout(() => {
            this.setState({ scanning: true });
          }, 500);
          
          // Refresh participants list if available
          if (this.props.refreshParticipants) {
            this.props.refreshParticipants();
          }
        }, 1500);
      } else {
        this.setState({ 
          checkInSuccess: false, 
          checkInError: result.error?.message || "Check-in gagal",
          isProcessingCheckIn: false 
        });
      }
    } catch (error) {
      console.error('Check-in error:', error);
      this.setState({ 
        checkInError: error.message || "Terjadi kesalahan saat proses check-in", 
        isProcessingCheckIn: false 
      });
    }
  };

  formatParticipantType = (type) => {
    const types = {
      general: 'Dokter Umum',
      specialist: 'Dokter Spesialis',
      nurse: 'Perawat',
      student: 'Mahasiswa',
      other: 'Lainnya'
    };
    
    return types[type?.toLowerCase()] || type || 'Peserta';
  };
  
  closeParticipantModal = () => {
    console.log('Menutup modal dan me-restart scanner...');
    this.setState({
      showParticipantModal: false,
      participantData: null,
      checkInSuccess: false,
      checkInError: null,
      modalStartY: 0,
      modalCurrentY: 0,
      isDragging: false
    }, () => {
      // Restart scanning when modal is closed if we were scanning before
      if (this.state.isScanning) {
        // Need a small delay to ensure DOM is updated
        setTimeout(() => this.initializeScanner(), 300);
      }
    });
  };

  // Modal touch handlers for swipe-to-close functionality
  handleTouchStart = (e) => {
    this.setState({
      modalStartY: e.touches[0].clientY,
      isDragging: true
    });
  };

  handleTouchMove = (e) => {
    if (!this.state.isDragging) return;
    
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - this.state.modalStartY;
    
    // Only allow dragging downward
    if (deltaY > 0) {
      this.setState({ modalCurrentY: deltaY });
    }
  };

  handleTouchEnd = () => {
    if (this.state.modalCurrentY > 100) {
      // If dragged down more than threshold, close modal
      this.closeParticipantModal();
    } else {
      // Reset position
      this.setState({
        modalCurrentY: 0,
        isDragging: false
      });
    }
  };

  render() {
    const { 
      isScanning, error, cameraPermission, showSuccessBanner, 
      successMessage, participantData, showParticipantModal,
      isProcessingCheckIn, checkInSuccess, checkInError 
    } = this.state;

    // Get current gate from session storage for display
    const currentGateId = sessionStorage.getItem('gate_id');
    const currentGateType = sessionStorage.getItem('gate_type');
    const currentGateName = sessionStorage.getItem('gate_name');

    return (
      <div className="scanner-component max-w-lg mx-auto">
        <h2 className="text-xl font-semibold text-white mb-4">QR Code Scanner</h2>
        
        {/* Current gate info */}
        {currentGateId && currentGateType && (
          <div className="mb-4 text-center">
            <span className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium">
              {currentGateName || "Kegiatan tidak teridentifikasi"}
            </span>
          </div>
        )}

        {/* Permission denied error */}
        {cameraPermission === 'denied' && (
          <div className="p-4 bg-red-900 border border-red-700 text-red-200 rounded-lg mb-4">
            Camera access denied. Please check your browser settings and allow camera access.
          </div>
        )}

        {/* Error message banner */}
        {error && (
          <div className="p-4 bg-red-900 border border-red-700 text-red-200 rounded-lg mb-4 relative">
            {error}
            <button
              onClick={() => this.setState({ error: null })}
              className="absolute right-2 top-2 text-red-200 hover:text-white bg-transparent border-none cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Success message */}
        {showSuccessBanner && (
          <div className="p-4 bg-green-900 border border-green-700 text-green-200 rounded-lg mb-4 relative">
            {successMessage}
            <button
              onClick={() => this.setState({ showSuccessBanner: false })}
              className="absolute right-2 top-2 text-green-200 hover:text-white bg-transparent border-none cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Manual QR code input */}
        <div className="mb-4 p-4 bg-gray-800 border border-gray-700 rounded-lg shadow-md">
          <form onSubmit={this.handleManualQrCodeSubmit} className="flex flex-col md:flex-row gap-2">
            <div className="flex-1">
              <label htmlFor="manualQrCode" className="block text-sm font-medium text-gray-300 mb-1">
                Input QR Code Manual
              </label>
              <input
                id="manualQrCode"
                type="text"
                value={this.state.manualQrCode}
                onChange={this.handleManualQrCodeChange}
                placeholder="Masukkan kode QR secara manual"
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={this.state.isSubmittingManual || !this.state.manualQrCode.trim()}
              className={`px-4 py-2 font-medium rounded-md self-end ${this.state.isSubmittingManual || !this.state.manualQrCode.trim() ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
            >
              {this.state.isSubmittingManual ? 'Processing...' : 'Proses'}
            </button>
          </form>
        </div>
        
        {/* Scanner container */}
        <div id={this.scannerElementId}></div>

        {/* Control buttons */}
        <div className="mt-4 flex justify-center">
          {!isScanning && (
            <button 
              onClick={this.startScanning} 
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Start Scanning
            </button>
          )}

          {isScanning && (
            <button 
              onClick={this.stopScanning} 
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Stop Scanning
            </button>
          )}
        </div>
        
        {/* Participant Modal */}
        {showParticipantModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-start justify-center z-50 p-0 md:p-4 md:items-center">
            <div 
              className="bg-gray-800 rounded-t-lg md:rounded-lg shadow-lg overflow-hidden w-full max-w-3xl"
              style={{ 
                transform: `translateY(${this.state.modalCurrentY}px)`,
                transition: this.state.isDragging ? 'none' : 'transform 0.3s ease-out'
              }}
              onTouchStart={this.handleTouchStart}
              onTouchMove={this.handleTouchMove}
              onTouchEnd={this.handleTouchEnd}
            >
              {/* Grab handle for mobile - visual indicator that modal can be swiped down */}
              <div className="md:hidden w-full flex justify-center pt-2 pb-1">
                <div className="w-16 h-1 bg-gray-600 rounded-full"></div>
              </div>
              
              {/* Fixed header for better mobile UX */}
              <div className="sticky top-0 z-10 border-b border-gray-700 p-4 flex justify-between items-center bg-gray-800">
                <h3 className="text-lg font-medium text-white">Data Peserta</h3>
                <button 
                  onClick={this.closeParticipantModal}
                  className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-4">
                {participantData && (
                  <div className="bg-gray-800 rounded border border-gray-700">
                    <div className="p-4">
                      <h2 className="text-xl font-semibold text-white mb-1">{participantData.name}</h2>
                      <p className="text-gray-400 mb-4">{this.formatParticipantType(participantData.type)}</p>
                      
                      <div className="space-y-2 mb-4 divide-y divide-gray-700">
                        <div className="grid grid-cols-3 py-2">
                          <span className="text-gray-400">NIK:</span>
                          <span className="text-white col-span-2">{participantData.nik}</span>
                        </div>
                        <div className="grid grid-cols-3 py-2">
                          <span className="text-gray-400">Email:</span>
                          <span className="text-white col-span-2">{participantData.email}</span>
                        </div>
                        <div className="grid grid-cols-3 py-2">
                          <span className="text-gray-400">Phone:</span>
                          <span className="text-white col-span-2">{participantData.phone}</span>
                        </div>
                        <div className="grid grid-cols-3 py-2">
                          <span className="text-gray-400">Institution:</span>
                          <span className="text-white col-span-2">{participantData.institution}</span>
                        </div>
                      </div>
                      
                      <h4 className="text-lg font-medium text-white mt-6 mb-2">Kegiatan Terdaftar</h4>
                      
                      {participantData.gates && participantData.gates.length > 0 ? (
                        <div className="space-y-2">
                          {participantData.gates.map((gate, index) => {
                            const isCurrentGate = gate.gate_id === currentGateId && gate.gate_type === (currentGateType === 'ticket' ? 'symposium' : currentGateType);
                            const alreadyCheckedIn = gate.checked_in;
                            
                            return (
                              <div 
                                key={index} 
                                className={`p-3 rounded-lg flex justify-between items-center border ${isCurrentGate ? 'border-blue-500 bg-blue-900 bg-opacity-30' : 'border-gray-700'}`}
                              >
                                <div>
                                  <div className="font-medium text-white">{gate.gate_name}</div>
                                  <div className="text-sm text-gray-400">{gate.gate_type}</div>
                                  
                                  {alreadyCheckedIn && (
                                    <div className="mt-1 bg-yellow-900 text-yellow-200 px-2 py-1 rounded-md text-xs flex items-center">
                                      <Check className="w-3 h-3 mr-1" /> 
                                      Sudah Check-in: {new Date(gate.checked_in_at).toLocaleString()}
                                    </div>
                                  )}
                                </div>
                                
                                {isCurrentGate && !alreadyCheckedIn && (
                                  <div>
                                    {participantData.payment_status === 'paid' ? (
                                      <button 
                                        className={`px-3 py-2 rounded-md text-sm font-medium ${isProcessingCheckIn || checkInSuccess ? 'bg-green-800 text-green-200 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                                        onClick={() => this.handleCheckIn(gate.gate_id, gate.gate_type)}
                                        disabled={isProcessingCheckIn || checkInSuccess}
                                      >
                                        {isProcessingCheckIn ? 'Processing...' : 'Check-in Now'}
                                      </button>
                                    ) : (
                                      <div className="bg-red-900 text-red-200 px-3 py-2 rounded-md text-sm">
                                        Pembayaran Belum Terverifikasi
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-gray-400">Tidak ada kegiatan terdaftar</div>
                      )}
                      
                      {checkInSuccess && (
                        <div className="mt-4 bg-green-900 text-green-200 p-3 rounded-md">
                          Check-in berhasil!
                        </div>
                      )}
                      
                      {checkInError && (
                        <div className="mt-4 bg-red-900 text-red-200 p-3 rounded-md">
                          {checkInError}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="border-t border-gray-700 p-4 flex justify-end">
                <button 
                  className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-base w-full md:w-auto"
                  onClick={this.closeParticipantModal}
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}

export default Scanner;