import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { outboundCounter } from './intelligence/outbound';

// Count outbound requests from the first moment the app runs — the
// "0 outbound requests" claim is only true if it is counted.
outboundCounter.install();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
