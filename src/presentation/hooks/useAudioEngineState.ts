import { useEffect, useState } from 'react';
import { AudioEnginePort, AudioEngineState } from '../../application/ports/AudioEnginePort';

/**
 * Estado de transporte/roteamento do motor. O motor só emite quando algo visível
 * muda (tempo quantizado em 100 ms); medidores usam useMeterListener.
 */
export function useAudioEngineState(engine: AudioEnginePort): AudioEngineState {
  const [state, setState] = useState(() => engine.getState());

  useEffect(() => engine.subscribe(setState), [engine]);

  return state;
}
