import { Component, Suspense, lazy } from 'react';

// Two separate bundles: drivers open /f/<token> from an SMS on a phone, often on a weak
// connection, and should not download the office UI.
const App = lazy(() => import('./App.jsx'));
const DriverApp = lazy(() => import('./driver/DriverApp.jsx'));

/** A page left open across an app update asks for code that no longer exists: offer a reload. */
class LoadBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ padding: 32, maxWidth: 420, margin: '0 auto', fontSize: 17 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sidan behöver laddas om</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Lasskoll har uppdaterats eller så bröts anslutningen.</p>
        <button type="button" className="drv-btn" onClick={() => window.location.reload()}>Ladda om</button>
      </div>
    );
  }
}

export function Root() {
  const path = window.location.pathname;
  const isDriver = path === '/f' || path.startsWith('/f/');
  return (
    <LoadBoundary>
      <Suspense fallback={null}>{isDriver ? <DriverApp /> : <App />}</Suspense>
    </LoadBoundary>
  );
}
