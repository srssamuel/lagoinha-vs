import { useEffect, useLayoutEffect, useRef } from 'react';
import { MeterFrame, MeterSource } from '../../application/ports/AudioEnginePort';

/**
 * Assina os medidores do motor sem passar pelo estado do React.
 * O handler escreve direto no DOM (refs), então VU/RTA andam a 60 fps
 * enquanto a árvore de componentes só re-renderiza quando o transporte muda.
 */
export function useMeterListener(
  source: MeterSource | undefined,
  onFrame: (frame: MeterFrame) => void
): void {
  const handlerRef = useRef(onFrame);

  useLayoutEffect(() => {
    handlerRef.current = onFrame;
  });

  useEffect(() => {
    if (!source) return;
    return source.subscribeMeters((frame) => handlerRef.current(frame));
  }, [source]);
}
