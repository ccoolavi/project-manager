import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { loadRuntimeConfig } from './config'
import './index.css'

// Resolve the API endpoint before the first render so no component can fire a
// request at a stale build-time URL.
loadRuntimeConfig().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})

// Register service worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/project-manager/sw.js')
}
