import React, { Component } from 'react';
import { RefreshCw, Search, Check, X } from 'lucide-react';
import { getGateParticipants } from '../supabaseClient';

class ParticipantTable extends Component {
  constructor(props) {
    super(props);
    this.state = {
      participants: [],
      filteredParticipants: [],
      loading: false,
      error: null,
      searchTerm: ''
    };
  }

  componentDidMount() {
    // Set reference for gate change events
    window.participantListRef = this;
    
    // Listen for gate changes
    window.addEventListener('gateChanged', this.handleGateChange);
    
    // Initial load
    this.loadParticipants();
  }

  componentWillUnmount() {
    window.participantListRef = null;
    window.removeEventListener('gateChanged', this.handleGateChange);
  }

  handleGateChange = (event) => {
    this.loadParticipants();
  };

  loadParticipants = async () => {
    const gateId = sessionStorage.getItem('gate_id');
    const gateType = sessionStorage.getItem('gate_type');
    
    if (!gateId || !gateType) {
      this.setState({ error: 'Please select a gate first' });
      return;
    }

    this.setState({ loading: true, error: null });
    console.log('Loading participants for gate:', gateId, 'type:', gateType);

    try {
      const { data, error } = await getGateParticipants(gateId, gateType);
      
      if (error) {
        console.error('Failed to load participants:', error);
        this.setState({ error: error.message || 'Failed to load participants', loading: false });
        return;
      }

      if (!data || !data.participants) {
        console.warn('No participants data returned');
        this.setState({ 
          participants: [], 
          filteredParticipants: [],
          loading: false,
          gateName: 'Unknown Gate' 
        });
        return;
      }
      
      console.log(`Loaded ${data.participants.length} participants for ${data.gate?.name}`);
      
      this.setState({ 
        participants: data.participants, 
        filteredParticipants: data.participants,
        gateName: data.gate?.name || 'Unknown Gate',
        loading: false 
      });
    } catch (error) {
      console.error('Error loading participants:', error);
      this.setState({ 
        error: 'Failed to load participants. Please try again.',
        loading: false 
      });
    }
  };


  handleSearch = (e) => {
    const searchTerm = e.target.value.toLowerCase();
    this.setState({ searchTerm });
    
    const filtered = this.state.participants.filter(participant => 
      participant.name?.toLowerCase().includes(searchTerm) ||
      (participant.nik && participant.nik.toLowerCase().includes(searchTerm)) ||
      (participant.qr_code && participant.qr_code.toLowerCase().includes(searchTerm)) ||
      (participant.institution && participant.institution.toLowerCase().includes(searchTerm)) ||
      (participant.email && participant.email.toLowerCase().includes(searchTerm)) ||
      (participant.phone && participant.phone.toLowerCase().includes(searchTerm))
    );
    
    this.setState({ filteredParticipants: filtered });
  };

  renderStatusIcon = (status) => {
    if (status) {
      return <Check className="w-4 h-4 text-green-400" />;
    }
    return <X className="w-4 h-4 text-red-400" />;
  };

  formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  renderMobileCard = (participant, index) => (
    <div key={index} className="bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-medium text-white">{participant.name}</h3>
          <p className="text-sm text-gray-400">{participant.institution || 'N/A'}</p>
          <p className="text-xs text-gray-500">QR: {participant.qr_code || 'N/A'}</p>
          <p className="text-xs text-gray-500">NIK: {participant.nik || 'N/A'}</p>
        </div>
        <div className="flex space-x-2">
          {this.renderStatusIcon(participant.payment_status === 'verified')}
          {this.renderStatusIcon(participant.checked_in)}
        </div>
      </div>
      
      <div className="text-xs text-gray-400 space-y-1">
        <div className="flex justify-between">
          <span>Phone:</span>
          <span>{participant.phone || 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid:</span>
          <span className={participant.payment_status === 'verified' ? 'text-green-400' : 'text-red-400'}>
            {participant.payment_status === 'verified' ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Checked In:</span>
          <span className={participant.checked_in ? 'text-green-400' : 'text-red-400'}>
            {participant.checked_in ? 'Yes' : 'No'}
          </span>
        </div>
        {participant.checked_in && (
          <>
            <div className="flex justify-between">
              <span>Check-in Time:</span>
              <span>{this.formatDateTime(participant.checked_in_at)}</span>
            </div>
            <div className="flex justify-between">
              <span>Admin:</span>
              <span>-</span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  renderDesktopRow = (participant, index) => (
    <tr key={index} className={index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-750'}>
      <td className="px-3 py-2 text-xs text-gray-300">{participant.qr_code || 'N/A'}</td>
      <td className="px-3 py-2 text-xs text-gray-300">{participant.nik || 'N/A'}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="font-medium text-white">{participant.name}</div>
        <div className="text-xs text-gray-400">{participant.type}</div>
      </td>
      <td className="px-3 py-2 text-xs text-gray-300">{participant.institution || 'N/A'}</td>
      <td className="px-3 py-2 text-xs text-gray-300">{participant.phone || 'N/A'}</td>
      <td className="px-3 py-2 text-center">
        {this.renderStatusIcon(participant.checked_in)}
      </td>
      <td className="px-3 py-2 text-xs text-gray-300">
        {this.formatDateTime(participant.checked_in_at) || '-'}
      </td>
      <td className="px-3 py-2 text-xs text-gray-300">-</td>
    </tr>
  );

  render() {
    const { filteredParticipants, loading, error, searchTerm } = this.state;

    return (
      <div className="space-y-4">
        {/* Header with Refresh Button */}
        <div className="flex items-center justify-between">
          <button
            onClick={this.loadParticipants}
            disabled={loading}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          
          <div className="text-sm text-gray-400">
            {filteredParticipants.length} participants
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by name, QR code, registration, or institution..."
            value={searchTerm}
            onChange={this.handleSearch}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-900 border border-red-700 text-red-200 rounded-lg">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="text-white">Loading participants...</div>
          </div>
        )}

        {/* Participants List */}
        {!loading && !error && (
          <>
            {/* Mobile View (< 768px) */}
            <div className="block md:hidden space-y-3">
              {filteredParticipants.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  No participants found
                </div>
              ) : (
                filteredParticipants.map((participant, index) => 
                  this.renderMobileCard(participant, index)
                )
              )}
            </div>

            {/* Desktop View (>= 768px) */}
            <div className="hidden md:block bg-gray-800 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full min-w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      QR Code
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Reg Number
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Institution
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Checked In
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Check-in Time
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Admin
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-8 text-gray-400">
                        No participants found
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.map((participant, index) => 
                      this.renderDesktopRow(participant, index)
                    )
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }
}

export default ParticipantTable;