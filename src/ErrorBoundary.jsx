import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'monospace', padding: 20, color: '#f87171', background: '#0f0f13', minHeight: '100vh', whiteSpace: 'pre-wrap' }}>
          <h2 style={{ marginBottom: 12 }}>App Error</h2>
          <div>{this.state.error.message}</div>
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>{this.state.error.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
