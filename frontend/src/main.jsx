import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { SSEProvider } from './context/SSEContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <SSEProvider>
        <App />
      </SSEProvider>
    </AuthProvider>
  </StrictMode>,
)
