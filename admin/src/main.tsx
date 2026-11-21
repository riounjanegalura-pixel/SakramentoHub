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
