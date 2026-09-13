import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// Auto-reload when a new service worker activates so changes are instant
if ('serviceWorker' in navigator) {
  // Reload page the moment a new SW takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
  // Check for SW updates every time the user returns to the app
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then(reg => reg?.update());
    }
  });
}

const root = document.getElementById('root')
root.innerHTML = '<div style="color:white;padding:20px">JS executing...</div>'

window.addEventListener('unhandledrejection', (e) => {
  root.innerHTML = '<div style="color:#f87171;padding:20px;font-family:monospace;white-space:pre-wrap">Promise error:\n' + (e.reason?.stack || e.reason) + '</div>'
})

try {
  createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
} catch(e) {
  root.innerHTML = '<div style="color:#f87171;padding:20px;font-family:monospace;white-space:pre-wrap">Render error:\n' + (e.stack || e.message) + '</div>'
}
