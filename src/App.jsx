import React, { Component } from 'react';
import LoginPage from './LoginPage';
import Layout from './Layout';
import ScanPage from './pages/ScanPage';
import ListPage from './pages/ListPage';
import { getCurrentUser } from './supabaseClient';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isAuthenticated: false,
      user: null,
      currentPage: 'scan',
      loading: true
    };
  }

  async componentDidMount() {
    try {
      const user = await getCurrentUser();
      if (user) {
        this.setState({
          isAuthenticated: true,
          user,
          loading: false
        });
      } else {
        this.setState({ loading: false });
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      this.setState({ loading: false });
    }
  }

  handleLoginSuccess = (user) => {
    this.setState({
      isAuthenticated: true,
      user,
      currentPage: 'scan'
    });
  };

  handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    this.setState({
      isAuthenticated: false,
      user: null,
      currentPage: 'scan'
    });
  };

  handleNavigate = (page) => {
    this.setState({ currentPage: page });
  };

  renderCurrentPage() {
    const { currentPage } = this.state;
    
    switch (currentPage) {
      case 'scan':
        return <ScanPage />;
      case 'list':
        return <ListPage />;
      default:
        return <ScanPage />;
    }
  }

  render() {
    const { isAuthenticated, loading } = this.state;

    if (loading) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="text-white text-lg">Loading...</div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return <LoginPage onLoginSuccess={this.handleLoginSuccess} />;
    }

    return (
      <Layout 
        onLogout={this.handleLogout}
        onNavigate={this.handleNavigate}
        currentPage={this.state.currentPage}
      >
        {this.renderCurrentPage()}
      </Layout>
    );
  }
}

export default App;