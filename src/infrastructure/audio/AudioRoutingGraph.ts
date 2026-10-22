import { TrackStem } from '../../domain/entities/TrackStem';
import { ChannelAssignment, RoutingMode } from '../../domain/value-objects/AudioRouting';
import { PitchShifterDspNode } from './PitchShifterDspNode';

/**
 * Cadeia de roteamento e DSP do motor, montada a partir de um AudioContext.
 *
 * Saída física discreta de 4 canais (padrão Leandro Machado / Lagoinha):
 *   finalMerger in 0 (Out 1): VS Left  (Mesa FOH)
 *   finalMerger in 1 (Out 2): VS Right (Mesa FOH)
 *   finalMerger in 2 (Out 3): Click    (somente monitoração/IEM)
 *   finalMerger in 3 (Out 4): Guia     (somente monitoração/IEM)
 *
 * Quem decide o destino de cada stem são os ganhos de MixerBusService/AudioRouting
 * (SPLIT_IEM_PA: click/guia só no fone L, ganho R = 0; MULTI_4CH_DISCRETE: click em ch3, guia em ch4,
 * zero em ch1/2). Este módulo só liga os nós; qualquer nó novo entre stem e merger precisa de teste.
 */

export interface StemAudioNodes {
  source: AudioBufferSourceNode | null;
  pitchShifter: PitchShifterDspNode;
  highPassFilter: BiquadFilterNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  tubeSaturator: WaveShaperNode;
  compressor: DynamicsCompressorNode;
  gainNode: GainNode;
  /** Separa L/R do stem; a matriz abaixo decide quanto do estéreo chega a leftGain/rightGain. */
  stereoSplitter: ChannelSplitterNode;
  lToLeft: GainNode;
  rToLeft: GainNode;
  lToRight: GainNode;
  rToRight: GainNode;
  leftGain: GainNode; // Ch 1 (VS Left / FOH L)
  rightGain: GainNode; // Ch 2 (VS Right / FOH R)
  ch3Gain: GainNode; // Ch 3 (Click Dedicated IEM)
  ch4Gain: GainNode; // Ch 4 (Guide Dedicated IEM)
  analyser: AnalyserNode;
  timeDomainData: Uint8Array<ArrayBuffer>;
}

export interface MasterRouting {
  masterGain: GainNode;
  masterLimiter: DynamicsCompressorNode;
  masterAnalyser: AnalyserNode;
  masterFreqData: Uint8Array<ArrayBuffer>;
  vsMerger: ChannelMergerNode;
  vsSplitter: ChannelSplitterNode;
  finalMerger: ChannelMergerNode;
}

/** Barramentos aos quais stems e click procedural se ligam. */
export interface RoutingBuses {
  vsMerger: ChannelMergerNode | null;
  finalMerger: ChannelMergerNode | null;
  channelMerger: ChannelMergerNode | null;
}

/** Rampa curta que evita estalo ao mudar ganho de roteamento. */
const GAIN_RAMP_S = 0.015;

/**
 * Barramento mestre:
 * Canais 1 e 2 -> vsMerger -> Master Gain -> Limiter -> Analyser -> Splitter -> finalMerger (0 e 1) -> destination.
 * Canais 3 e 4 entram direto no finalMerger (sem limiter de FOH).
 */
export function buildMasterRouting(ctx: AudioContext, masterVolume: number): MasterRouting {
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);

  // Master Brickwall Limiter (inspirado no Limiter №6 / LoudMax da Plugin Boutique)
  // Impede clipping/distorção digital quando canais são reforçados até +6.0 dB
  const masterLimiter = ctx.createDynamicsCompressor();
  masterLimiter.threshold.setValueAtTime(-1.0, ctx.currentTime);
  masterLimiter.knee.setValueAtTime(0.0, ctx.currentTime);
  masterLimiter.ratio.setValueAtTime(20.0, ctx.currentTime);
  masterLimiter.attack.setValueAtTime(0.001, ctx.currentTime);
  masterLimiter.release.setValueAtTime(0.08, ctx.currentTime);

  // Master FFT Analyser (RTA Spectrum Analyzer 64 bins)
  const masterAnalyser = ctx.createAnalyser();
  masterAnalyser.fftSize = 128;
  masterAnalyser.smoothingTimeConstant = 0.72;
  const masterFreqData = new Uint8Array(masterAnalyser.frequencyBinCount);

  // VS Master Bus (Canais 1 e 2 -> Master Gain -> Limiter -> Analyser -> Splitter)
  const vsMerger = ctx.createChannelMerger(2);
  const vsSplitter = ctx.createChannelSplitter(2);
  vsMerger.connect(masterGain);
  masterGain.connect(masterLimiter);
  masterLimiter.connect(masterAnalyser);
  masterAnalyser.connect(vsSplitter);

  // Final Discrete 4-Channel Merger
  const finalMerger = ctx.createChannelMerger(4);
  vsSplitter.connect(finalMerger, 0, 0); // Out 1 (FOH L)
  vsSplitter.connect(finalMerger, 1, 1); // Out 2 (FOH R)
  finalMerger.connect(ctx.destination);

  return { masterGain, masterLimiter, masterAnalyser, masterFreqData, vsMerger, vsSplitter, finalMerger };
}

/**
 * Channel strip de um stem:
 * PitchShifter (Constant-Tempo, bypass em Bateria/Loops/Click/Guia) -> HighPass (De-Bleed) -> EQ 3 bandas
 * -> Tube Saturator -> Compressor -> Gain -> Analyser & distribuição nos 4 canais.
 */
export function createStemChannelStrip(
  ctx: AudioContext,
  stem: TrackStem,
  pitchShiftSemitones: number,
  buses: Pick<RoutingBuses, 'vsMerger' | 'finalMerger'>
): StemAudioNodes {
  const pitchShifter = new PitchShifterDspNode(ctx, stem.isPitchShiftable);
  pitchShifter.setSemitones(pitchShiftSemitones);

  const highPassFilter = ctx.createBiquadFilter();
  highPassFilter.type = 'highpass';

  const eqLow = ctx.createBiquadFilter();
  eqLow.type = 'lowshelf';
  eqLow.frequency.value = 100;

  const eqMid = ctx.createBiquadFilter();
  eqMid.type = 'peaking';
  eqMid.frequency.value = 1400;
  eqMid.Q.value = 1.1;

  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = 'highshelf';
  eqHigh.frequency.value = 8500;

  const tubeSaturator = ctx.createWaveShaper();
  tubeSaturator.oversample = '2x';

  const compressor = ctx.createDynamicsCompressor();

  const gainNode = ctx.createGain();
  const leftGain = ctx.createGain(); // Ch 1 (VS L)
  const rightGain = ctx.createGain(); // Ch 2 (VS R)
  const ch3Gain = ctx.createGain(); // Ch 3 (Click Dedicated IEM)
  const ch4Gain = ctx.createGain(); // Ch 4 (Guide Dedicated IEM)
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.65;
  const timeDomainData = new Uint8Array(analyser.frequencyBinCount);

  pitchShifter.output.connect(highPassFilter);
  highPassFilter.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(tubeSaturator);
  tubeSaturator.connect(compressor);
  compressor.connect(gainNode);

  // Estéreo por stem: o gainNode sai sempre em 2 canais (stem mono vira L=R) e a matriz de largura
  // alimenta leftGain/rightGain. Largura 0 = soma mono 0,5*(L+R), igual ao downmix que a entrada do merger
  // fazia antes; largura 1 = L só na esquerda, R só na direita. Os destinos continuam decididos só pelos
  // ganhos leftGain/rightGain/ch3/ch4.
  gainNode.channelCount = 2;
  gainNode.channelCountMode = 'explicit';
  gainNode.channelInterpretation = 'speakers';
  const stereoSplitter = ctx.createChannelSplitter(2);
  const lToLeft = ctx.createGain();
  const rToLeft = ctx.createGain();
  const lToRight = ctx.createGain();
  const rToRight = ctx.createGain();
  for (const g of [lToLeft, rToLeft, lToRight, rToRight]) g.gain.value = 0.5;
  gainNode.connect(stereoSplitter);
  stereoSplitter.connect(lToLeft, 0);
  stereoSplitter.connect(rToLeft, 1);
  stereoSplitter.connect(lToRight, 0);
  stereoSplitter.connect(rToRight, 1);
  lToLeft.connect(leftGain);
  rToLeft.connect(leftGain);
  lToRight.connect(rightGain);
  rToRight.connect(rightGain);

  gainNode.connect(analyser);
  gainNode.connect(ch3Gain);
  gainNode.connect(ch4Gain);

  // Canais 1 e 2 passam pelo VS Master Bus (Master Gain + Limiter №6 + Analyser)
  if (buses.vsMerger) {
    leftGain.connect(buses.vsMerger, 0, 0);
    rightGain.connect(buses.vsMerger, 0, 1);
  }

  // Canais 3 e 4 vão DIRETOS para as saídas físicas discretas (Line-Level puro sem limiter de FOH)
  if (buses.finalMerger) {
    ch3Gain.connect(buses.finalMerger, 0, 2); // Out 3: Click Track
    ch4Gain.connect(buses.finalMerger, 0, 3); // Out 4: Guide Track
  }

  return {
    source: null,
    pitchShifter,
    highPassFilter,
    eqLow,
    eqMid,
    eqHigh,
    tubeSaturator,
    compressor,
    gainNode,
    stereoSplitter,
    lToLeft,
    rToLeft,
    lToRight,
    rToRight,
    leftGain,
    rightGain,
    ch3Gain,
    ch4Gain,
    analyser,
    timeDomainData
  };
}

/**
 * Largura estéreo do stem (0..1). Modos split usam L e R como barramentos diferentes (fone x PA): soma mono.
 * Click e guia são mono. Nos modos estéreo o stem centrado mantém o estéreo e, ao panoramizar, a largura
 * fecha até a soma mono no extremo (onde o pan de potência constante já manda tudo para um lado).
 */
export function stereoWidthFor(mode: RoutingMode, stemType: string, pan: number): number {
  if (mode === 'SPLIT_IEM_PA' || stemType === 'click' || stemType === 'guide') return 0;
  return Math.max(0, Math.min(1, 1 - Math.abs(pan)));
}

/** Aplica os ganhos por canal (calculados por modo em AudioRouting) e a largura estéreo, com rampa curta. */
export function applyStemRoutingGains(
  nodes: StemAudioNodes,
  gains: ChannelAssignment,
  now: number,
  stereoWidth = 0
): void {
  const w = Math.max(0, Math.min(1, stereoWidth));
  const direct = (1 + w) / 2;
  const cross = (1 - w) / 2;
  const targets: Array<[GainNode, number]> = [
    [nodes.leftGain, gains.ch1_vsL], // Canal 1: VS Left (Mesa FOH / Split L)
    [nodes.rightGain, gains.ch2_vsR], // Canal 2: VS Right (Mesa FOH / Split R)
    [nodes.ch3Gain, gains.ch3_click], // Canal 3: Click dedicado (somente IEM)
    [nodes.ch4Gain, gains.ch4_guide], // Canal 4: Guia dedicado (somente IEM)
    [nodes.lToLeft, direct],
    [nodes.rToRight, direct],
    [nodes.rToLeft, cross],
    [nodes.lToRight, cross]
  ];
  for (const [node, value] of targets) {
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(value, now);
    node.gain.linearRampToValueAtTime(value, now + GAIN_RAMP_S);
  }
}

/** Liga o click procedural ao destino do modo de roteamento. Nunca ao FOH em SPLIT_IEM_PA / MULTI_4CH_DISCRETE. */
export function connectClickToBus(clickGain: GainNode, mode: RoutingMode, buses: RoutingBuses): void {
  if (mode === 'MULTI_4CH_DISCRETE') {
    // Output 3 exclusivo: Click dedicado para monitoração dos músicos (IEM), zero PA FOH
    if (buses.finalMerger) {
      clickGain.connect(buses.finalMerger, 0, 2);
    }
  } else if (mode === 'SPLIT_IEM_PA') {
    // Canal 1 (Left IEM fones dos músicos)
    if (buses.vsMerger) {
      clickGain.connect(buses.vsMerger, 0, 0);
    } else if (buses.channelMerger) {
      clickGain.connect(buses.channelMerger, 0, 0);
    }
  } else {
    // Stereo Full: L e R
    if (buses.vsMerger) {
      clickGain.connect(buses.vsMerger, 0, 0);
      clickGain.connect(buses.vsMerger, 0, 1);
    } else if (buses.channelMerger) {
      clickGain.connect(buses.channelMerger, 0, 0);
      clickGain.connect(buses.channelMerger, 0, 1);
    }
  }
}

/** Liga o tom de teste de canal conforme o modo. */
export function connectTestTone(
  gain: GainNode,
  mode: RoutingMode,
  channelIndex: number,
  finalMerger: ChannelMergerNode
): void {
  if (mode === 'MULTI_4CH_DISCRETE') {
    gain.connect(finalMerger, 0, channelIndex);
  } else if (mode === 'SPLIT_IEM_PA') {
    if (channelIndex === 2 || channelIndex === 3) {
      gain.connect(finalMerger, 0, 0); // Fones (L)
    } else {
      gain.connect(finalMerger, 0, 1); // PA (R)
    }
  } else if (channelIndex === 0 || channelIndex === 2) {
    gain.connect(finalMerger, 0, 0);
  } else {
    gain.connect(finalMerger, 0, 1);
  }
}
