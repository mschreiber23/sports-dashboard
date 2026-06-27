import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

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
