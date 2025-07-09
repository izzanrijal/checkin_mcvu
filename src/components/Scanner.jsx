import React, { Component } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { getParticipantByQrCode, performCheckIn } from '../supabaseClient';
import { Check } from 'lucide-react';
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
      isProcessing: false
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

  onScanSuccess = async (qrCode) => {
    // Cek apakah scanner aktif dan modal tidak sedang ditampilkan
    if (this.state.scanning && !this.state.showParticipantModal) {
      try {
        // Matikan pemindaian dan set status memproses
        this.setState({ scanning: false, isProcessing: true });
        console.log(`QR Code detected: ${qrCode}`);
        
        // Get participant data from QR code
        const { data, error } = await getParticipantByQrCode(qrCode);
        
        if (error) {
          console.error('QR code lookup error:', error);
          this.setState({ 
            error: error.message || "QR code tidak valid", 
            isProcessing: false 
          });
          
          // Re-enable scanning after error dengan delay
          setTimeout(() => {
            if (!this.state.showParticipantModal) {
              this.setState({ scanning: true });
            }
          }, 2000);
          return;
        }
        
        if (!data) {
          this.setState({ 
            error: "Tidak ada data peserta untuk QR code ini", 
            isProcessing: false 
          });
          
          // Re-enable scanning after error dengan delay
          setTimeout(() => {
            if (!this.state.showParticipantModal) {
              this.setState({ scanning: true });
            }
          }, 2000);
          return;
        }
        
        console.log('Participant data:', data);
        
        // Tampilkan modal data peserta dan hentikan pemindaian
        // Scanner tidak akan aktif lagi sampai modal ditutup
        this.setState({ 
          participantData: data, 
          showParticipantModal: true,
          isProcessing: false,
          isScanning: false // Matikan scanner selama modal terbuka
        });
        
        // Scanner akan tetap nonaktif sampai modal ditutup
        // Lihat di closeParticipantModal untuk restart scanner
        
      } catch (error) {
        console.error('Scan error:', error);
        this.setState({ 
          error: error.message || "Terjadi kesalahan saat memproses QR code", 
          isProcessing: false 
        });
        
        // Re-enable scanning after error dengan delay
        setTimeout(() => {
          if (!this.state.showParticipantModal) {
            this.setState({ scanning: true });
          }
        }, 2000);
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
      checkInError: null
    }, () => {
      // Restart scanner dengan metode startScanning setelah modal ditutup
      setTimeout(() => {
        this.startScanning();
      }, 500);
    });
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
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden w-full max-w-3xl">
              <div className="border-b border-gray-700 p-4 flex justify-between items-center">
                <h3 className="text-lg font-medium text-white">Data Peserta</h3>
                <button 
                  onClick={this.closeParticipantModal}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
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
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md"
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