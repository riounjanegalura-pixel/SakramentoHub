import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion, MotionConfig, domMax } from 'motion/react'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/globals.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax} strict>
        <App />
      </LazyMotion>
    </MotionConfig>
  </StrictMode>,
)

// A new version of the app takes over from the cached one without waiting for the next visit: reload once when it does.
// Skipped on the very first install (no earlier version was in control), so a first visit never reloads.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}
