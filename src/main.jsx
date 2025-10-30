import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { SDKProvider } from '@tma.js/sdk-react'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SDKProvider>
      <App />
    </SDKProvider>
  </React.StrictMode>
)