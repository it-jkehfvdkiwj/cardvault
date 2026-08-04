import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// eslint-disable-next-line no-undef
export const BUILD_STAMP = typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev'
console.info(`[Cardeva] Frontend-Stand: ${BUILD_STAMP}`)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              // Match the app surface. On a light UI the toast needs a real
              // shadow to separate from the page — a border alone disappears.
              style: {
                background: '#FFFFFF',
                color: '#1A1A17',
                border: '1px solid #E4E1D9',
                borderRadius: '12px',
                fontSize: '14px',
                boxShadow: '0 2px 4px rgba(26,26,23,.05), 0 12px 32px -16px rgba(26,26,23,.25)',
              },
              error: { duration: 5000 },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
