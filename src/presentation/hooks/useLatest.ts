import { useLayoutEffect, useRef } from 'react';

/**
 * Ref sempre apontando para o valor mais recente. Permite registrar listeners
 * (teclado, MIDI) uma única vez sem closures velhas nem re-bind a cada render.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
