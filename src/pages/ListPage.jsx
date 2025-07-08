import React, { Component } from 'react';
import ParticipantTable from '../components/ParticipantTable';

class ListPage extends Component {
  render() {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Participant List</h1>
          <p className="text-gray-300">View and manage gate participants</p>
        </div>
        
        <ParticipantTable />
      </div>
    );
  }
}

export default ListPage;