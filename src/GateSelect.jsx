import React, { Component } from 'react';
import { getGates } from './supabaseClient';

class GateSelect extends Component {
  constructor(props) {
    super(props);
    this.state = {
      gates: [],
      selectedGate: sessionStorage.getItem('gate_id') || '',
      loading: true
    };
  }

  async componentDidMount() {
    try {
      const { data, error } = await getGates();
      if (error) {
        console.error('Error fetching gates:', error);
        return;
      }
      
      this.setState({ gates: data || [], loading: false });
      
      // If no gate selected, select the first one
      if (!this.state.selectedGate && data && data.length > 0) {
        this.handleGateChange({ target: { value: `${data[0].id}|${data[0].type}` } });
      }
    } catch (error) {
      console.error('Error loading gates:', error);
      this.setState({ loading: false });
    }
  }

  handleGateChange = (e) => {
    const value = e.target.value;
    if (!value) return;
    
    const [gateId, gateType] = value.split('|');
    this.setState({ selectedGate: value });
    
    // Store in sessionStorage
    sessionStorage.setItem('gate_id', gateId);
    sessionStorage.setItem('gate_type', gateType);
    
    // If we're on the participant list page, trigger a refresh
    if (window.location.hash === '#list' || window.participantListRef) {
      // Dispatch a custom event to trigger list refresh
      window.dispatchEvent(new CustomEvent('gateChanged', { detail: { gateId, gateType } }));
    }
  };

  render() {
    const { gates, selectedGate, loading } = this.state;

    if (loading) {
      return (
        <select className="w-full px-3 py-2 bg-gray-700 text-white rounded-md text-sm" disabled>
          <option>Loading gates...</option>
        </select>
      );
    }

    return (
      <select
        value={selectedGate}
        onChange={this.handleGateChange}
        className="w-full px-3 py-2 bg-gray-700 text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select Gate</option>
        {gates.map(gate => (
          <option key={`${gate.id}-${gate.type}`} value={`${gate.id}|${gate.type}`}>
            {gate.name} ({gate.type === 'workshop' ? 'Workshop' : 'Symposium'})
          </option>
        ))}
      </select>
    );
  }
}

export default GateSelect;