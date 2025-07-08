import React, { Component } from 'react';
import Scanner from '../components/Scanner';

class ScanPage extends Component {
  render() {
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">QR Code Scanner</h1>
          <p className="text-gray-300">Scan participant QR codes to check them in</p>
        </div>
        
        <Scanner />
      </div>
    );
  }
}

export default ScanPage;