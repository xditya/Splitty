import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initPwaInstall } from './lib/pwa'
import './index.css'

initPwaInstall() // must run before the browser fires beforeinstallprompt

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA offline shell. `updateViaCache: 'none'` makes the browser check for a
// new sw.js on every visit, and when a new version takes control this open
// tab reloads itself once — stale phone tabs self-heal after deploys.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return // first-ever install isn't an update
      reloaded = true
      location.reload()
    })
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
  })
}
