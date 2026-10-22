import { vi } from 'vitest';
import { Song } from '../../../../src/domain/entities/Song';
import { TrackStem, StemType } from '../../../../src/domain/entities/TrackStem';

/**
 * AudioContext falso que GRAVA o grafo (connect com índices de saída/entrada) e os ganhos,
 * para provar destinos de roteamento sem hardware. Mesmo padrão do mock de
 * WebAudioEngineRouteHealth.test.ts, com arestas registradas.
 */

export interface FakeParam {
  value: number;
  setValueAtTime(v: number, t?: number): FakeParam;
  linearRampToValueAtTime(v: number, t?: number): FakeParam;
  exponentialRampToValueAtTime(v: number, t?: number): FakeParam;
  cancelScheduledValues(t?: number): FakeParam;
}

export interface Edge {
  dest: FakeNode;
  output: number;
  input: number;
}

export interface FakeNode {
  kind: string;
  edges: Edge[];
  [key: string]: unknown;
}

const param = (initial = 0): FakeParam => {
  const p: FakeParam = {
    value: initial,
    setValueAtTime(v) {
      p.value = v;
      return p;
    },
    linearRampToValueAtTime(v) {
      p.value = v;
      return p;
    },
    exponentialRampToValueAtTime(v) {
      p.value = v;
      return p;
    },
    cancelScheduledValues() {
      return p;
    }
  };
  return p;
};

export interface GraphAudioContext {
  ctx: AudioContext;
  nodes: FakeNode[];
  /** Nós criados depois do índice dado (útil para isolar o que um agendamento criou). */
  nodesSince(index: number): FakeNode[];
  destination: FakeNode;
  setTime(seconds: number): void;
}

export function createGraphAudioContext(maxChannelCount = 4): GraphAudioContext {
  const nodes: FakeNode[] = [];
  let currentTime = 0;

  const make = (kind: string, extra: Record<string, unknown> = {}): FakeNode => {
    const node: FakeNode = {
      kind,
      edges: [],
      connect(dest: unknown, output = 0, input = 0) {
        // Conexões em AudioParam (modulação do pitch shifter) não são rotas de áudio.
        if (dest && typeof dest === 'object' && 'kind' in dest && 'edges' in dest) {
          node.edges.push({ dest: dest as FakeNode, output, input });
        }
      },
      // Sem argumento remove todas as arestas de saída; com destino, só as que vão para ele (como o AudioNode real).
      disconnect(dest?: unknown, output?: number, input?: number) {
        node.edges = node.edges.filter((e) => {
          if (dest === undefined) return false;
          if (e.dest !== dest) return true;
          if (output !== undefined && e.output !== output) return true;
          if (input !== undefined && e.input !== input) return true;
          return false;
        });
      },
      ...extra
    };
    nodes.push(node);
    return node;
  };

  const destination = make('destination', {
    maxChannelCount,
    channelCount: 2,
    channelCountMode: 'max',
    channelInterpretation: 'speakers'
  });

  const ctx = {
    destination,
    sampleRate: 44100,
    state: 'running',
    resume: async () => {},
    decodeAudioData: async () => ({ duration: 1, length: 44100 }),
    createGain: () => make('gain', { gain: param(1) }),
    createDynamicsCompressor: () =>
      make('compressor', {
        threshold: param(-24),
        knee: param(30),
        ratio: param(12),
        attack: param(0.003),
        release: param(0.25),
        reduction: 0
      }),
    createAnalyser: () =>
      make('analyser', {
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        get frequencyBinCount() {
          return 64;
        },
        getByteFrequencyData: () => {},
        getByteTimeDomainData: () => {}
      }),
    createChannelMerger: (n: number) => make('merger', { inputs: n }),
    createChannelSplitter: (n: number) => make('splitter', { outputs: n }),
    createBufferSource: () => make('bufferSource', { buffer: null, start: vi.fn(), stop: vi.fn() }),
    createDelay: () => make('delay', { delayTime: param(0) }),
    createConstantSource: () => make('constantSource', { offset: param(0), start: () => {}, stop: () => {} }),
    createOscillator: () =>
      make('oscillator', { type: 'sine', frequency: param(440), start: () => {}, stop: () => {} }),
    createWaveShaper: () => make('waveShaper', { curve: null, oversample: 'none' }),
    createBiquadFilter: () =>
      make('biquad', { type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
    createBuffer: (_channels: number, length: number, sampleRate: number) => ({
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length)
    }),
    get currentTime() {
      return currentTime;
    }
  };

  return {
    ctx: ctx as unknown as AudioContext,
    nodes,
    nodesSince: (index: number) => nodes.slice(index),
    destination,
    setTime: (s: number) => {
      currentTime = s;
    }
  };
}

export const gainOf = (node: FakeNode): number => (node.gain as FakeParam).value;

/**
 * Quais entradas do `finalMerger` (saída física 0..3) recebem sinal de `start`.
 * Considera ganho zero como corte (um GainNode em 0 não passa nada) e o canal: um splitter só
 * entrega no seu índice de saída, e a entrada de um merger fixa o canal do sinal.
 */
export function finalInputsReachedFrom(start: FakeNode, finalMerger: FakeNode): Set<number> {
  const reached = new Set<number>();
  const seen = new Set<string>();
  const nodeIds = new Map<FakeNode, number>();
  const idOf = (n: FakeNode) => {
    if (!nodeIds.has(n)) nodeIds.set(n, nodeIds.size);
    return nodeIds.get(n)!;
  };

  const walk = (node: FakeNode, channel: number): void => {
    const key = `${idOf(node)}:${channel}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (node.kind === 'gain' && gainOf(node) === 0) return;

    for (const edge of node.edges) {
      if (node.kind === 'splitter' && edge.output !== channel) continue;
      if (edge.dest === finalMerger) {
        reached.add(edge.input);
        continue;
      }
      const nextChannel = edge.dest.kind === 'merger' ? edge.input : channel;
      walk(edge.dest, nextChannel);
    }
  };

  // A partir de um stem estéreo os dois canais podem levar sinal: percorre ambos (mais conservador).
  walk(start, 0);
  walk(start, 1);
  return reached;
}

export function makeSong(types: StemType[], overrides: { bpm?: number; beats?: number } = {}): Song {
  return new Song({
    id: 'song-test',
    title: 'Teste',
    artist: 'Teste',
    originalKey: 'C',
    currentKey: 'C',
    bpm: overrides.bpm ?? 120,
    timeSignature: { beats: overrides.beats ?? 4, value: 4 },
    duration: 60,
    sections: [],
    stems: types.map(
      (type, i) =>
        new TrackStem({
          id: `stem-${type}-${i}`,
          name: type,
          type,
          volume: 1,
          pan: 0,
          isMuted: false,
          isSolo: false
        })
    )
  });
}
