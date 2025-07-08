import React, { Component } from 'react';
import Scanner from '../components/Scanner';
import { supabase } from '../supabaseClient';

class ScanPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      user: null
    };
  }

  componentDidMount() {
    // Get current authenticated user
    supabase.auth.getSession().then(({ data }) => {
      if (data && data.session) {
        this.setState({ user: data.session.user });
      }
    }).catch(error => {
      console.error('Error getting session:', error);
    });

    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        this.setState({ user: session.user });
      } else if (event === 'SIGNED_OUT') {
        this.setState({ user: null });
      }
    });
  }

  render() {
    const { user } = this.state;
    
    return (
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">QR Code Scanner</h1>
          <p className="text-gray-300">Scan participant QR codes to check them in</p>
          {user && <p className="text-xs text-blue-400 mt-1">Admin: {user.email}</p>}
        </div>
        
        <Scanner supabaseAuth={{ user }} />
      </div>
    );
  }
}

export default ScanPage;