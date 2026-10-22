import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './presentation/App';
import { BackendProvider } from './presentation/BackendContext';
import { createBackend } from './presentation/composition';
import { initServiceWorker } from './infrastructure/pwa/registerServiceWorker';
import './index.css';

const AdminAcervoPage = lazy(() => import('./presentation/pages/AdminAcervoPage'));
const PublicLibraryPage = lazy(() => import('./presentation/pages/PublicLibraryPage'));

// App disponível offline (precache). Atualização nunca é aplicada sozinha: ver PwaStatus.
initServiceWorker();

/** Sem router: três telas por caminho. O Hosting reescreve tudo para o index.html. */
function screenFor(pathname: string): React.ReactNode {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/admin/acervo') return <AdminAcervoPage />;
  const lib = /^\/biblioteca(?:\/([^/]+))?$/.exec(path);
  if (lib) return <PublicLibraryPage songId={lib[1] ? decodeURIComponent(lib[1]) : null} />;
  return <App />;
}

const loading = <div style={{ minHeight: '100vh', background: '#0c0c0e' }} />;

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  createBackend()
    .then((backend) =>
      root.render(
        <React.StrictMode>
          <BackendProvider backend={backend}>
            <Suspense fallback={loading}>{screenFor(window.location.pathname)}</Suspense>
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
