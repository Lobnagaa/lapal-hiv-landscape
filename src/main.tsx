import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Manrope, self-hosted via @fontsource so the bundle has no external font
// request. meta.typeface names Manrope; the CSS stack falls back to a
// geometric sans if the font fails to load.
import '@fontsource-variable/manrope'

import './index.css'
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('No #root element in index.html.')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
