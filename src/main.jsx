import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { installPwaResume } from './pwaResume.js'

installPwaResume(window)

const root = document.getElementById('root')

window.addEventListener('unhandledrejection', (e) => {
  root.innerHTML = '<div style="color:#f87171;background:#0f0f13;padding:20px;font-family:monospace;white-space:pre-wrap">Promise error:\n' + (e.reason?.stack || e.reason) + '</div>'
})

try {
  createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
} catch(e) {
  root.innerHTML = '<div style="color:#f87171;background:#0f0f13;padding:20px;font-family:monospace;white-space:pre-wrap">Render error:\n' + (e.stack || e.message) + '</div>'
}
