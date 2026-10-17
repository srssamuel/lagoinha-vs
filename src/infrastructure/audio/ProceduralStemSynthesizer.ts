import { StemType } from '../../domain/entities/TrackStem';

const ROOT_FREQS: Record<string, number> = {
  C: 130.81,
  'C#': 138.59,
  Db: 138.59,
  D: 146.83,
  'D#': 155.56,
  Eb: 155.56,
  E: 164.81,
  Em: 164.81,
  F: 174.61,
  'F#': 185.0,
  Gb: 185.0,
  G: 196.0,
  'G#': 207.65,
  Ab: 207.65,
  A: 220.0,
  Am: 220.0,
  Bb: 233.08,
  B: 246.94
};

export class ProceduralStemSynthesizer {
  /**
   * Gera um AudioBuffer musical de 4 compassos (em loop) específico para cada stem
   * (Bateria, Baixo, Guitarras, Teclado, Pad, Guia) sincronizado ao BPM e Tom da música.
   */
  public static createStemLoopBuffer(
    ctx: AudioContext,
    stemType: StemType,
    bpm: number,
    beatsPerBar: number,
    key: string
  ): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * beatsPerBar;
    const loopBars = 4; // 4-bar chord progression (vi - IV - I - V)
    const totalDuration = secondsPerBar * loopBars;
    const numSamples = Math.max(1, Math.floor(sampleRate * totalDuration));
    const buffer = ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    const rootFreq = ROOT_FREQS[key] ?? 196.0;
    // Progressão clássica Worship (I - V - vi - IV) em multiplicadores de frequência
    const chordRoots = [1.0, 1.498, 1.681, 1.334];

    if (stemType === 'drums') {
      // Bateria: Bumbo (Kick), Caixa (Snare) e Chimbal (Hi-Hat)
      const totalSubBeats = loopBars * beatsPerBar * 2; // colcheias
      for (let sub = 0; sub < totalSubBeats; sub++) {
        const subTime = sub * (secondsPerBeat / 2);
        const startSample = Math.floor(subTime * sampleRate);
        const isQuarter = sub % 2 === 0;
        const beatIndex = Math.floor(sub / 2) % beatsPerBar;

        // Kick no tempo 1 e 3 (ou 1 em 6/8)
        if (isQuarter && (beatIndex === 0 || beatIndex === 2)) {
          const kickLen = Math.min(Math.floor(sampleRate * 0.18), numSamples - startSample);
          for (let i = 0; i < kickLen; i++) {
            const t = i / sampleRate;
            const freq = 110 * Math.exp(-t * 28) + 45;
            const env = Math.exp(-t * 16);
            data[startSample + i] = (data[startSample + i] ?? 0) + Math.sin(2 * Math.PI * freq * t) * env * 0.85;
          }
        }

        // Snare no tempo 2 e 4
        if (isQuarter && (beatIndex === 1 || beatIndex === 3)) {
          const snareLen = Math.min(Math.floor(sampleRate * 0.14), numSamples - startSample);
          for (let i = 0; i < snareLen; i++) {
            const t = i / sampleRate;
            const noise = (Math.random() * 2 - 1) * Math.exp(-t * 25);
            const body = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 35);
            data[startSample + i] = (data[startSample + i] ?? 0) + (noise * 0.55 + body * 0.45) * 0.7;
          }
        }

        // Hi-Hat em todas as colcheias
        const hatLen = Math.min(Math.floor(sampleRate * 0.04), numSamples - startSample);
        for (let i = 0; i < hatLen; i++) {
          const t = i / sampleRate;
          const metallic = (Math.random() * 2 - 1) * Math.exp(-t * 70);
          data[startSample + i] = (data[startSample + i] ?? 0) + metallic * (isQuarter ? 0.25 : 0.15);
        }
      }
    } else if (stemType === 'bass') {
      // Baixo pulsante em colcheias seguindo os acordes
      const totalEighths = loopBars * beatsPerBar * 2;
      for (let e = 0; e < totalEighths; e++) {
        const barIdx = Math.floor(e / (beatsPerBar * 2)) % 4;
        const noteFreq = (rootFreq / 2) * (chordRoots[barIdx] ?? 1.0);
        const startTime = e * (secondsPerBeat / 2);
        const startSample = Math.floor(startTime * sampleRate);
        const noteLen = Math.min(Math.floor((secondsPerBeat / 2) * 0.9 * sampleRate), numSamples - startSample);

        for (let i = 0; i < noteLen; i++) {
          const t = i / sampleRate;
          const env = Math.min(1, t / 0.01) * Math.exp(-t * 4.5);
          const wave = Math.sin(2 * Math.PI * noteFreq * t) * 0.75 + Math.sin(4 * Math.PI * noteFreq * t) * 0.25;
          data[startSample + i] = wave * env * 0.65;
        }
      }
    } else if (stemType === 'keys' || stemType === 'pad') {
      // Acordes cheios (Fundamental + Terça + Quinta + Oitava)
      for (let bar = 0; bar < loopBars; bar++) {
        const chordRoot = rootFreq * (chordRoots[bar] ?? 1.0);
        const startSample = Math.floor(bar * secondsPerBar * sampleRate);
        const barSamples = Math.min(Math.floor(secondsPerBar * sampleRate), numSamples - startSample);

        for (let i = 0; i < barSamples; i++) {
          const t = i / sampleRate;
          const attack = Math.min(1, t / (stemType === 'pad' ? 0.25 : 0.02));
          const decay = stemType === 'pad' ? 0.85 : Math.exp(-t * 1.4);
          const n1 = Math.sin(2 * Math.PI * chordRoot * t);
          const n2 = Math.sin(2 * Math.PI * chordRoot * 1.2599 * t);
          const n3 = Math.sin(2 * Math.PI * chordRoot * 1.4983 * t);
          const n4 = Math.sin(2 * Math.PI * chordRoot * 2.0 * t);
          data[startSample + i] = ((n1 + n2 + n3 + n4 * 0.6) / 3.6) * attack * decay * 0.55;
        }
      }
    } else if (stemType === 'guitars' || stemType === 'fx' || stemType === 'vocals') {
      // Dedilhado / Arpejo rítmico de guitarra worship com delay pontuado
      const notesPerBar = beatsPerBar * 2;
      const arpeggioIntervals = [1.0, 1.4983, 2.0, 1.2599];
      for (let bar = 0; bar < loopBars; bar++) {
        const chordRoot = rootFreq * 2 * (chordRoots[bar] ?? 1.0);
        for (let n = 0; n < notesPerBar; n++) {
          const freq = chordRoot * (arpeggioIntervals[n % arpeggioIntervals.length] ?? 1.0);
          const noteStart = (bar * secondsPerBar) + n * (secondsPerBeat / 2);
          const startSample = Math.floor(noteStart * sampleRate);
          const noteSamples = Math.min(Math.floor((secondsPerBeat / 2) * sampleRate), numSamples - startSample);

          for (let i = 0; i < noteSamples; i++) {
            const t = i / sampleRate;
            const env = Math.min(1, t / 0.008) * Math.exp(-t * 5.5);
            const pluck = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(6 * Math.PI * freq * t) * Math.exp(-t * 15);
            data[startSample + i] = (data[startSample + i] ?? 0) + pluck * env * 0.4;
          }
        }
      }
    } else if (stemType === 'guide') {
      // Guia de Contagem no último compasso antes da virada ("1, 2, 3, 4")
      const cueBarStart = (loopBars - 1) * secondsPerBar;
      for (let b = 0; b < beatsPerBar; b++) {
        const beatStart = cueBarStart + b * secondsPerBeat;
        const startSample = Math.floor(beatStart * sampleRate);
        const len = Math.min(Math.floor(0.09 * sampleRate), numSamples - startSample);
        const cueFreq = b === beatsPerBar - 1 ? 660 : 523.25;
        for (let i = 0; i < len; i++) {
          const t = i / sampleRate;
          const env = Math.sin((Math.PI * i) / len);
          data[startSample + i] = Math.sin(2 * Math.PI * cueFreq * t) * env * 0.55;
        }
      }
    }

    return buffer;
  }
}
