import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './presentation/App';
import { BackendProvider } from './presentation/BackendContext';
import { createBackend } from './presentation/composition';
import './index.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  createBackend()
    .then((backend) =>
      root.render(
        <React.StrictMode>
          <BackendProvider backend={backend}>
            <App />
          </BackendProvider>
        </React.StrictMode>
      )
    )
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      root.render(
        <div role="alert" style={{ padding: 24, color: '#fff', background: '#07090e', minHeight: '100vh', fontFamily: 'system-ui' }}>
          <h1 style={{ fontSize: 20 }}>Não foi possível iniciar o Lagoinha VS</h1>
          <p>{message}</p>
        </div>
      );
    });
}
