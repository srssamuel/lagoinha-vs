import React, { createContext, useContext } from 'react';
import type { Backend } from './composition';

const BackendContext = createContext<Backend | null>(null);

export function BackendProvider({ backend, children }: { backend: Backend; children: React.ReactNode }) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}

/** Portas montadas pelo composition root; componentes não dão `new` em adaptador. */
export function useBackend(): Backend {
  const backend = useContext(BackendContext);
  if (!backend) throw new Error('useBackend fora do BackendProvider.');
  return backend;
}
