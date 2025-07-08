import React, { Component } from 'react';
import { signOut } from './supabaseClient';

class LogoutButton extends Component {
  handleLogout = async () => {
    try {
      await signOut();
      this.props.onLogout();
    } catch (error) {
      console.error('Error logging out:', error);
      // Still logout locally even if server logout fails
      this.props.onLogout();
    }
  };

  render() {
    const { isInDrawer } = this.props;

    if (isInDrawer) {
      return (
        <button
          onClick={this.handleLogout}
          className="w-full px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-900 hover:bg-opacity-20 rounded-lg transition-colors text-left"
        >
          Logout
        </button>
      );
    }

    return (
      <button
        onClick={this.handleLogout}
        className="text-red-400 hover:text-red-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 rounded px-2 py-1"
      >
        Logout
      </button>
    );
  }
}

export default LogoutButton;