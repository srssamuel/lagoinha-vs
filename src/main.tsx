import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './presentation/App';
import { BackendProvider } from './presentation/BackendContext';
import { createBackend } from './presentation/composition';
import './index.css';

const rootElement = document.getElementById('root');
const backend = createBackend();

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BackendProvider backend={backend}>
        <App />
      </BackendProvider>
    </React.StrictMode>
  );
}
