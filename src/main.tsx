import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootAppearance } from './db/appearance.ts'

// Before the first render, not inside it: a chosen theme or paper colour has
// to be on the document already, or every launch starts with a frame of the
// built-in palette and then snaps to the real one.
bootAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
