import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { outboundCounter } from './intelligence/outbound';
import { loadAgentContext } from './intelligence/agent-context-files';

// Count outbound requests from the first moment the app runs — the
// "0 outbound requests" claim is only true if it is counted.
outboundCounter.install();

// Load the agent's soul + memory (.sol / .memory) once at startup, so
// the intelligence pipeline has its context from the first run. The
// texts are bundled at build time (Vite `?raw`); the singleton is
// populated synchronously before this returns.
loadAgentContext();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
