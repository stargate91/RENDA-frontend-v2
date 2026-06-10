import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught an error:", error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#fff', background: '#e91e63', height: '100vh', overflow: 'auto', zIndex: 9999, position: 'relative' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>Frontend Crash</h1>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
          </pre>
          <h2 style={{ fontSize: '18px', marginTop: '20px', marginBottom: '10px' }}>Component Stack:</h2>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>
            {this.state.info && this.state.info.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
