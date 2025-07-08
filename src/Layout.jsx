import React, { Component } from 'react';
import { Menu, X } from 'lucide-react';
import GateSelect from './GateSelect';
import LogoutButton from './LogoutButton';

class Layout extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isDrawerOpen: false
    };
  }

  toggleDrawer = () => {
    this.setState({ isDrawerOpen: !this.state.isDrawerOpen });
  };

  closeDrawer = () => {
    this.setState({ isDrawerOpen: false });
  };

  handleNavigate = (page) => {
    this.props.onNavigate(page);
    this.closeDrawer();
  };

  render() {
    const { isDrawerOpen } = this.state;
    const { currentPage, onLogout } = this.props;

    return (
      <div className="min-h-screen bg-gray-900">
        {/* Fixed Top Bar */}
        <div className="fixed top-0 left-0 right-0 bg-gray-800 shadow-lg z-40">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Hamburger Menu */}
            <button
              onClick={this.toggleDrawer}
              className="text-white hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1"
            >
              <Menu size={24} />
            </button>

            {/* Gate Picker */}
            <div className="flex-1 max-w-xs mx-4">
              <GateSelect />
            </div>

            {/* Logout Link */}
            <LogoutButton onLogout={onLogout} />
          </div>
        </div>

        {/* Off-canvas Drawer */}
        <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={this.closeDrawer}
          />
          
          {/* Drawer */}
          <div className={`absolute top-0 left-0 h-full w-80 max-w-full bg-gray-800 shadow-xl transform transition-transform duration-300 ${isDrawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold text-white">Menu</h2>
              <button
                onClick={this.closeDrawer}
                className="text-white hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1"
              >
                <X size={24} />
              </button>
            </div>
            
            <nav className="p-4">
              <ul className="space-y-2">
                <li>
                  <button
                    onClick={() => this.handleNavigate('scan')}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      currentPage === 'scan' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    Scan
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => this.handleNavigate('list')}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      currentPage === 'list' 
                        ? 'bg-blue-600 text-white' 
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    Participant List
                  </button>
                </li>
              </ul>
            </nav>
            
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
              <LogoutButton onLogout={onLogout} isInDrawer={true} />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="pt-16 pb-4 px-4">
          {this.props.children}
        </div>
      </div>
    );
  }
}

export default Layout;