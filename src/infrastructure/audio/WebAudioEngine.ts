import {
  AudioEnginePort,
  AudioEngineState,
  AudioOutputDeviceInfo,
  AudioRouteHealth,
  MasterRtaData,
  MeterFrame
} from '../../application/ports/AudioEnginePort';

/** Resolução temporal do estado emitido ao React durante o playback (playhead/relógio). */
const STATE_TIME_RESOLUTION_S = 0.1;
import { Song } from '../../domain/entities/Song';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { MixerBusService } from '../../application/services/MixerBusService';
import { QuantizedSectionService } from '../../application/services/QuantizedSectionService';
import { ProceduralClickGenerator } from './ProceduralClickGenerator';
import { VstPluginRackService } from '../../domain/services/VstPluginRackService';
import { PitchShifterDspNode } from './PitchShifterDspNode';

interface StemAudioNodes {
  source: AudioBufferSourceNode | null;
  pitchShifter: PitchShifterDspNode;
  highPassFilter: BiquadFilterNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  tubeSaturator: WaveShaperNode;
  compressor: DynamicsCompressorNode;
  gainNode: GainNode;
  leftGain: GainNode;   // Ch 1 (VS Left / FOH L)
  rightGain: GainNode;  // Ch 2 (VS Right / FOH R)
  ch3Gain: GainNode;    // Ch 3 (Click Dedicated IEM)
  ch4Gain: GainNode;    // Ch 4 (Guide Dedicated IEM)
  analyser: AnalyserNode;
  timeDomainData: Uint8Array<ArrayBuffer>;
}

export class WebAudioEngine implements AudioEnginePort {
  private ctx: AudioContext | null = null;
  private currentSong: Song | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterFreqData: Uint8Array<ArrayBuffer> | null = null;
  private vsMerger: ChannelMergerNode | null = null;
  private vsSplitter: ChannelSplitterNode | null = null;
  private finalMerger: ChannelMergerNode | null = null;
  private channelMerger: ChannelMergerNode | null = null; // backward compatibility

  // Stems audio nodes
  private stemNodes: Map<string, StemAudioNodes> = new Map();

  // Playback state
  private isPlaying: boolean = false;
  private playbackStartTime: number = 0;
  private pausedAtTime: number = 0;
  private routingMode: RoutingMode = 'SPLIT_IEM_PA';
  private queuedSectionId: string | null = null;
  private isLoopingSection: boolean = false;
  private isSoloClickActive: boolean = false;
  private isLoopClickActive: boolean = false;
  private masterVolume: number = 1.0;

  // Pre-Roll Count-In (Contagem Prévia de 1 ou 2 compassos)
  private countInBars: number = 0; // 0 = Off, 1 = 1 Bar, 2 = 2 Bars
  private isCountingIn: boolean = false;
  private countInBeat: number = 1;
  private countInTimerId: number | null = null;

  // Metronome click scheduler (used only when no real click stem file is present or during Loop Click)
  private clickTimerId: number | null = null;
  private nextClickTime: number = 0;
  private currentBeatInBar: number = 1;
  private clickBufferAccent: AudioBuffer | null = null;
  private clickBufferRegular: AudioBuffer | null = null;

  // State update listeners
  private listeners: Set<(state: AudioEngineState) => void> = new Set();
  private meterListeners: Set<(frame: MeterFrame) => void> = new Set();
  private lastStateSignature: string = '';
  private animationFrameId: number | null = null;

  // Detecção de Hardware e Canais Físicos/Virtuais
  private availableAudioDevices: AudioOutputDeviceInfo[] = [];
  private selectedAudioDeviceId: string = 'default';

  // Integridade de Rota de Áudio de Palco (ENG-02)
  private routeHealth: AudioRouteHealth = 'healthy';
  private routeLossReason: string | null = null;
  private deviceChangeDebounceTimer: number | null = null;

  constructor() {
    // Lazy AudioContext initialization on first user gesture
  }

  public async init(): Promise<void> {
    if (this.ctx) return;

    const AudioContextClass =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        : (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext;
    if (!AudioContextClass) {
      console.warn('AudioContext is not available in this environment');
      return;
    }
    this.ctx = new AudioContextClass();

    void this.detectAudioDevices();
    this.setupDeviceChangeListener();

    // Detecção e configuração de saídas físicas multicanal (ex: XR18, UMC404HD, Focusrite Scarlett 4i4/18i20)
    const maxChannels = this.ctx.destination.maxChannelCount;
    if (maxChannels >= 4) {
      try {
        this.ctx.destination.channelCount = 4;
        this.ctx.destination.channelCountMode = 'explicit';
        this.ctx.destination.channelInterpretation = 'discrete';
      } catch (err) {
        console.warn('Multichannel destination initialization fallback:', err);
      }
    } else {
      try {
        this.ctx.destination.channelCount = Math.min(2, maxChannels || 2);
      } catch {
        // Fallback para dispositivos estéreo padrão
      }
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

    // Master Brickwall Limiter (inspirado no Limiter №6 / LoudMax da Plugin Boutique)
    // Impede clipping/distorção digital quando canais são reforçados até +6.0 dB
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(0.0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(20.0, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.001, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.08, this.ctx.currentTime);

    // Master FFT Analyser (RTA Spectrum Analyzer 64 bins)
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 128;
    this.masterAnalyser.smoothingTimeConstant = 0.72;
    this.masterFreqData = new Uint8Array(this.masterAnalyser.frequencyBinCount);

    // VS Master Bus (Canais 1 e 2 -> Master Gain -> Limiter -> Analyser -> Splitter)
    this.vsMerger = this.ctx.createChannelMerger(2);
    this.vsSplitter = this.ctx.createChannelSplitter(2);
    this.vsMerger.connect(this.masterGain);
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.vsSplitter);

    // Final Discrete 4-Channel Merger (Padrão Leandro Machado Lagoinha):
    // Ch 0 (Out 1): VS Left (Mesa FOH)
    // Ch 1 (Out 2): VS Right (Mesa FOH)
    // Ch 2 (Out 3): Click Track (somente monitoração/IEM)
    // Ch 3 (Out 4): Guide Track (somente monitoração/IEM)
    this.finalMerger = this.ctx.createChannelMerger(4);
    this.channelMerger = this.finalMerger; // backward compatibility
    this.vsSplitter.connect(this.finalMerger, 0, 0); // Out 1 (FOH L)
    this.vsSplitter.connect(this.finalMerger, 1, 1); // Out 2 (FOH R)
    this.finalMerger.connect(this.ctx.destination);

    // Pré-cria buffers de click de reserva para Loop Click
    this.clickBufferAccent = ProceduralClickGenerator.createClickBuffer(this.ctx, true);
    this.clickBufferRegular = ProceduralClickGenerator.createClickBuffer(this.ctx, false);
  }

  public async loadSong(song: Song): Promise<void> {
    await this.init();
    this.stop();
    this.currentSong = song;
    this.pausedAtTime = 0;
    this.queuedSectionId = null;

    if (!this.ctx || !this.channelMerger) return;

    // Limpa nós anteriores e libera osciladores LFO do PitchShifter
    this.stemNodes.forEach((n) => n.pitchShifter.dispose());
    this.stemNodes.clear();

    const ctxRef = this.ctx;

    // Cria cadeia DSP completa (PitchShifter Constant-Tempo + Channel Strip) para cada stem real da música
    song.stems.forEach((stem) => {
      if (!this.ctx || !this.channelMerger) return;

      const pitchShifter = new PitchShifterDspNode(this.ctx, stem.isPitchShiftable);
      pitchShifter.setSemitones(song.pitchShiftSemitones);

      const highPassFilter = this.ctx.createBiquadFilter();
      highPassFilter.type = 'highpass';

      const eqLow = this.ctx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 100;

      const eqMid = this.ctx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 1400;
      eqMid.Q.value = 1.1;

      const eqHigh = this.ctx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 8500;

      const tubeSaturator = this.ctx.createWaveShaper();
      tubeSaturator.oversample = '2x';

      const compressor = this.ctx.createDynamicsCompressor();

      const gainNode = this.ctx.createGain();
      const leftGain = this.ctx.createGain();   // Ch 1 (VS L)
      const rightGain = this.ctx.createGain();  // Ch 2 (VS R)
      const ch3Gain = this.ctx.createGain();    // Ch 3 (Click Dedicated IEM)
      const ch4Gain = this.ctx.createGain();    // Ch 4 (Guide Dedicated IEM)
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      const timeDomainData = new Uint8Array(analyser.frequencyBinCount);

      // Cadeia VST Channel Strip:
      // PitchShifter (Constant-Tempo, Bypass em Bateria/Loops/Click/Guia) -> HighPass (De-Bleed) -> EQ 3 Bandas -> Tube Saturator -> Compressor -> Gain -> Analyser & 4-Channel Distribution
      pitchShifter.output.connect(highPassFilter);
      highPassFilter.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      eqHigh.connect(tubeSaturator);
      tubeSaturator.connect(compressor);
      compressor.connect(gainNode);

      gainNode.connect(analyser);
      gainNode.connect(leftGain);
      gainNode.connect(rightGain);
      gainNode.connect(ch3Gain);
      gainNode.connect(ch4Gain);

      // Conexões de Barramento:
      // Canais 1 e 2 passam pelo VS Master Bus (Master Gain + Limiter №6 + Analyser)
      if (this.vsMerger) {
        leftGain.connect(this.vsMerger, 0, 0);
        rightGain.connect(this.vsMerger, 0, 1);
      }

      // Canais 3 e 4 vão DIRETOS para as saídas físicas discretas (Line-Level puro sem limiter de FOH)
      if (this.finalMerger) {
        ch3Gain.connect(this.finalMerger, 0, 2); // Out 3: Click Track
        ch4Gain.connect(this.finalMerger, 0, 3); // Out 4: Guide Track
      }

      this.stemNodes.set(stem.id, {
        source: null,
        pitchShifter,
        highPassFilter,
        eqLow,
        eqMid,
        eqHigh,
        tubeSaturator,
        compressor,
        gainNode,
        leftGain,
        rightGain,
        ch3Gain,
        ch4Gain,
        analyser,
        timeDomainData
      });

      if (stem.audioUrl && !stem.audioBuffer) {
        void fetch(stem.audioUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.arrayBuffer();
          })
          .then((ab) => ctxRef.decodeAudioData(ab))
          .then((decoded) => {
            stem.audioBuffer = decoded;
            // Se o usuário já deu Play enquanto o stem terminava de decodificar, sincroniza imediatamente
            if (this.isPlaying && this.currentSong?.id === song.id) {
              const currentNodes = this.stemNodes.get(stem.id);
              if (currentNodes && !currentNodes.source) {
                const src = ctxRef.createBufferSource();
                src.buffer = decoded;
                src.connect(currentNodes.pitchShifter.input);
                const nowOffset = Math.min(this.getCurrentPlaybackTime(), decoded.duration);
                src.start(0, nowOffset);
                currentNodes.source = src;
              }
            }
          })
          .catch((err) => {
            console.warn(`Falha ao decodificar stem real ${stem.name}:`, err);
          });
      }
    });

    this.refreshDspChain();
    this.applyMixerSettings();
    this.notifyState();
  }

  public play(): void {
    if (!this.ctx || !this.currentSong || this.isPlaying) return;

    // Proteção de segurança de palco (ENG-02): se a rota foi perdida ou desconectada, bloqueia play
    if (this.routeHealth === 'lost' || this.routeHealth === 'reconnected') {
      console.warn(
        `[WebAudioEngine] Reprodução bloqueada: Rota de áudio em estado '${this.routeHealth}'. ` +
        `Revalide a rota na interface de palco antes de iniciar o playback.`
      );
      return;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    // Se houver contagem prévia configurada (1 ou 2 compassos) e a música estiver no início (tempo 0)
    if (this.countInBars > 0 && this.pausedAtTime === 0 && !this.isCountingIn) {
      this.startPreRollCountIn();
      return;
    }

    this.isPlaying = true;
    this.playbackStartTime = this.ctx.currentTime - this.pausedAtTime;

    // Só usa metrônomo procedural se a música não tiver um arquivo real de click
    const clickStem = this.currentSong.stems.find((s) => s.type === 'click');
    if (!clickStem?.audioUrl) {
      this.setupMetronomeSchedule();
    }

    this.applyMixerSettings();

    // Inicia reprodução sincronizada de todos os stems reais
    this.startAudioSources(this.pausedAtTime);

    // Inicia loop de telemetria
    this.startStateLoop();
    this.notifyState();
  }

  private startPreRollCountIn(): void {
    if (!this.ctx || !this.currentSong) return;

    this.isPlaying = true;
    this.isCountingIn = true;
    this.countInBeat = 1;

    const bpm = this.currentSong.bpm;
    const secondsPerBeat = 60 / bpm;
    const beatsPerBar = this.currentSong.timeSignature.beats;
    const totalBeats = this.countInBars * beatsPerBar;
    let beatsRemaining = totalBeats;

    const tick = () => {
      if (!this.isPlaying || !this.isCountingIn || !this.ctx) return;

      const currentCount = totalBeats - beatsRemaining + 1;
      const beatInCurrentBar = ((currentCount - 1) % beatsPerBar) + 1;
      this.countInBeat = currentCount;
      this.scheduleClick(this.ctx.currentTime, beatInCurrentBar === 1);
      this.notifyState();

      beatsRemaining--;

      if (beatsRemaining > 0) {
        this.countInTimerId = window.setTimeout(tick, secondsPerBeat * 1000);
      } else {
        this.countInTimerId = window.setTimeout(() => {
          if (!this.isPlaying || !this.ctx) return;
          this.isCountingIn = false;
          this.playbackStartTime = this.ctx.currentTime;
          this.pausedAtTime = 0;

          const clickStem = this.currentSong?.stems.find((s) => s.type === 'click');
          if (!clickStem?.audioUrl) {
            this.setupMetronomeSchedule();
          }

          this.applyMixerSettings();
          this.startAudioSources(0);
          this.startStateLoop();
          this.notifyState();
        }, secondsPerBeat * 1000);
      }
    };

    tick();
  }

  public pause(): void {
    if (!this.isPlaying || !this.ctx) return;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.countInTimerId !== null) {
      clearTimeout(this.countInTimerId);
      this.countInTimerId = null;
    }
    this.isCountingIn = false;
    this.pausedAtTime = this.getCurrentPlaybackTime();
    this.stopAudioSources();
    this.stopMetronome();
    this.isPlaying = false;
    this.notifyState();
  }

  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.countInTimerId !== null) {
      clearTimeout(this.countInTimerId);
      this.countInTimerId = null;
    }
    this.isCountingIn = false;
    this.stopAudioSources();
    this.stopMetronome();
    this.isPlaying = false;
    this.pausedAtTime = 0;
    this.queuedSectionId = null;
    this.notifyState();
  }

  public seek(timeInSeconds: number): void {
    if (this.countInTimerId !== null) {
      clearTimeout(this.countInTimerId);
      this.countInTimerId = null;
    }
    this.isCountingIn = false;
    const target = Math.max(0, Math.min(this.currentSong?.duration || 0, timeInSeconds));
    const wasPlaying = this.isPlaying;

    if (wasPlaying) {
      this.stopAudioSources();
      this.stopMetronome();
    }

    this.pausedAtTime = target;

    if (wasPlaying && this.ctx) {
      this.playbackStartTime = this.ctx.currentTime - this.pausedAtTime;
      const clickStem = this.currentSong?.stems.find((s) => s.type === 'click');
      if (!clickStem?.audioUrl) {
        this.setupMetronomeSchedule();
      }
      this.applyMixerSettings();
      this.startAudioSources(this.pausedAtTime);
      this.isPlaying = true;
    }

    this.notifyState();
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1.5, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
    this.notifyState();
  }

  public setRoutingMode(mode: RoutingMode): void {
    this.routingMode = mode;
    this.applyMixerSettings();
    this.notifyState();
  }

  public setStemVolume(stemId: string, volume: number): void {
    const stem = this.currentSong?.stems.find((s) => s.id === stemId);
    if (stem) {
      stem.setVolume(volume);
      this.applyMixerSettings();
      this.notifyState();
    }
  }

  public setStemPan(stemId: string, pan: number): void {
    const stem = this.currentSong?.stems.find((s) => s.id === stemId);
    if (stem) {
      stem.setPan(pan);
      this.applyMixerSettings();
      this.notifyState();
    }
  }

  public toggleStemMute(stemId: string): void {
    const stem = this.currentSong?.stems.find((s) => s.id === stemId);
    if (stem) {
      stem.toggleMute();
      this.applyMixerSettings();
      this.notifyState();
    }
  }

  public toggleStemSolo(stemId: string): void {
    const stem = this.currentSong?.stems.find((s) => s.id === stemId);
    if (stem) {
      stem.toggleSolo();
      this.applyMixerSettings();
      this.notifyState();
    }
  }

  public clearAllSolos(): void {
    if (!this.currentSong) return;
    this.currentSong.stems.forEach((stem) => {
      stem.isSolo = false;
    });
    this.applyMixerSettings();
    this.notifyState();
  }

  public resetMixer(): void {
    if (!this.currentSong) return;
    this.currentSong.stems.forEach((stem) => {
      stem.resetVolume();
      stem.resetDsp();
      stem.isMuted = false;
      stem.isSolo = false;
    });
    this.isSoloClickActive = false;
    this.refreshDspChain();
    this.applyMixerSettings();
    this.notifyState();
  }

  public refreshDspChain(): void {
    if (!this.currentSong || !this.ctx) return;
    const song = this.currentSong;
    const now = this.ctx.currentTime;

    song.stems.forEach((stem) => {
      const nodes = this.stemNodes.get(stem.id);
      if (!nodes) return;

      const dsp = stem.dsp;
      nodes.pitchShifter.setPitchShiftable(stem.isPitchShiftable);
      nodes.pitchShifter.setSemitones(song.pitchShiftSemitones);

      nodes.highPassFilter.frequency.value = dsp.highPassHz;
      nodes.highPassFilter.frequency.setValueAtTime(dsp.highPassHz, now);

      nodes.eqLow.gain.value = dsp.eqLowDb;
      nodes.eqLow.gain.setValueAtTime(dsp.eqLowDb, now);

      nodes.eqMid.gain.value = dsp.eqMidDb;
      nodes.eqMid.gain.setValueAtTime(dsp.eqMidDb, now);

      nodes.eqHigh.gain.value = dsp.eqHighDb;
      nodes.eqHigh.gain.setValueAtTime(dsp.eqHighDb, now);

      nodes.tubeSaturator.curve = VstPluginRackService.createTubeSaturationCurve(
        dsp.driveAmount,
        512
      );

      if (dsp.compressorEnabled) {
        nodes.compressor.threshold.setValueAtTime(-18, now);
        nodes.compressor.knee.setValueAtTime(8, now);
        nodes.compressor.ratio.setValueAtTime(4.0, now);
        nodes.compressor.attack.setValueAtTime(0.008, now);
        nodes.compressor.release.setValueAtTime(0.18, now);
      } else {
        nodes.compressor.threshold.setValueAtTime(0, now);
        nodes.compressor.ratio.setValueAtTime(1.0, now);
      }
    });

    this.notifyState();
  }

  public setPitchShift(semitones: number): void {
    if (!this.currentSong) return;
    this.currentSong.setPitchShift(semitones);
    if (this.ctx) {
      this.currentSong.stems.forEach((stem) => {
        const nodes = this.stemNodes.get(stem.id);
        if (!nodes) return;
        // Aplica mudança de tom em tempo constante APENAS nos instrumentos tonais (stem.isPitchShiftable === true).
        // Bateria (drums), Loops (loop), Click (click) e Guia (guide) permanecem em PITCH LOCK (100% Dry).
        nodes.pitchShifter.setPitchShiftable(stem.isPitchShiftable);
        nodes.pitchShifter.setSemitones(this.currentSong?.pitchShiftSemitones ?? 0);
      });
    }
    this.notifyState();
  }

  public queueSectionJump(sectionId: string): void {
    if (!this.currentSong) return;
    this.queuedSectionId = sectionId;
    this.notifyState();
  }

  public toggleSectionLoop(): void {
    this.isLoopingSection = !this.isLoopingSection;
    this.notifyState();
  }

  public toggleSoloClick(): void {
    this.isSoloClickActive = !this.isSoloClickActive;
    this.applyMixerSettings();
    this.notifyState();
  }

  public toggleLoopClick(): void {
    this.isLoopClickActive = !this.isLoopClickActive;
    this.notifyState();
  }

  public setCountInBars(bars: number): void {
    this.countInBars = Math.max(0, Math.min(2, Math.round(bars)));
    this.notifyState();
  }

  public panic(): void {
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      setTimeout(() => {
        this.stop();
        if (this.masterGain && this.ctx) {
          this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        }
      }, 350);
    } else {
      this.stop();
    }
  }

  public getState(): AudioEngineState {
    const currentTime = this.getCurrentPlaybackTime();
    const duration = this.currentSong?.duration || 0;
    const bpm = this.currentSong?.bpm || 120;
    const beatsPerBar = this.currentSong?.timeSignature.beats || 4;
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * beatsPerBar;

    const currentBar = Math.floor(currentTime / secondsPerBar) + 1;
    const beatInBar = Math.floor((currentTime % secondsPerBar) / secondsPerBeat) + 1;
    const activeSection = this.currentSong?.getActiveSection(currentTime);
    const audioHardwareChannels = this.ctx ? (this.ctx.destination.maxChannelCount || 2) : 2;

    return {
      isPlaying: this.isPlaying,
      currentTime,
      duration,
      currentBar,
      currentBeat: beatInBar,
      routingMode: this.routingMode,
      queuedSectionId: this.queuedSectionId,
      activeSectionId: activeSection?.id || null,
      isLoopingSection: this.isLoopingSection,
      isSoloClickActive: this.isSoloClickActive,
      isLoopClickActive: this.isLoopClickActive,
      masterVolume: this.masterVolume,
      countInBars: this.countInBars,
      isCountingIn: this.isCountingIn,
      countInBeat: this.countInBeat,
      audioHardwareChannels,
      availableAudioDevices: this.availableAudioDevices,
      selectedAudioDeviceId: this.selectedAudioDeviceId,
      routeHealth: this.routeHealth,
      routeLossReason: this.routeLossReason
    };
  }

  public getMeterFrame(): MeterFrame {
    const stemLevels: Record<string, number> = {};
    if (this.currentSong) {
      const hasAnySolo = this.currentSong.hasSoloTrack;
      this.currentSong.stems.forEach((stem) => {
        const nodes = this.stemNodes.get(stem.id);
        const isAudible =
          this.isPlaying &&
          stem.isAudible(hasAnySolo) &&
          (!this.isSoloClickActive || stem.type === 'click') &&
          stem.volume > 0;

        if (!nodes || !isAudible) {
          stemLevels[stem.id] = 0;
          return;
        }

        try {
          nodes.analyser.getByteTimeDomainData(nodes.timeDomainData);
          let sumSquares = 0;
          const len = nodes.timeDomainData.length;
          for (let i = 0; i < len; i++) {
            const normalized = ((nodes.timeDomainData[i] ?? 128) - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / len);
          // Escala visual proporcional ao RMS real do stem e ao ganho (até 2.0)
          const level = Math.min(1, rms * 3.2 * Math.min(1.5, stem.volume));
          stemLevels[stem.id] = Number(level.toFixed(3));
        } catch {
          stemLevels[stem.id] = Math.min(1, stem.volume * 0.65);
        }
      });
    }

    let sub = 0;
    let low = 0;
    let mid = 0;
    let high = 0;
    let air = 0;

    if (this.masterAnalyser && this.masterFreqData && this.isPlaying) {
      try {
        this.masterAnalyser.getByteFrequencyData(this.masterFreqData);
        const data = this.masterFreqData;
        sub = Number(((data[0] ?? 0) / 255).toFixed(2));
        low = Number((((data[1] ?? 0) + (data[2] ?? 0)) / 510).toFixed(2));
        let midSum = 0;
        for (let i = 3; i <= 8; i++) midSum += data[i] ?? 0;
        mid = Number((midSum / (6 * 255)).toFixed(2));
        let highSum = 0;
        for (let i = 9; i <= 20; i++) highSum += data[i] ?? 0;
        high = Number((highSum / (12 * 255)).toFixed(2));
        let airSum = 0;
        for (let i = 21; i < data.length; i++) airSum += data[i] ?? 0;
        air = Number((airSum / ((data.length - 21) * 255)).toFixed(2));
      } catch {
        // Fallback
      }
    }

    const gainReductionDb = this.masterLimiter
      ? Number((this.masterLimiter.reduction || 0).toFixed(1))
      : 0;
    const isLimiting = gainReductionDb < -0.2;

    let maxLeft = 0;
    let maxRight = 0;
    if (this.currentSong && this.isPlaying) {
      const hasAnySolo = this.currentSong.hasSoloTrack;
      this.currentSong.stems.forEach((stem) => {
        const isAudible =
          stem.isAudible(hasAnySolo) &&
          (!this.isSoloClickActive || stem.type === 'click') &&
          stem.volume > 0;
        if (!isAudible) return;

        const level = stemLevels[stem.id] ?? stem.volume * 0.5;
        if (this.routingMode === 'MULTI_4CH_DISCRETE') {
          // No modo 4CH discreto, apenas os stems de playback/VS alimentam o VU Master do PA (Canais 1 e 2).
          // Click (Canal 3) e Guia (Canal 4) não aparecem no VU de PA da congregação.
          if (stem.type !== 'click' && stem.type !== 'guide') {
            const normPan = (stem.pan + 1) / 2;
            maxLeft = Math.max(maxLeft, level * Math.cos(normPan * (Math.PI / 2)));
            maxRight = Math.max(maxRight, level * Math.sin(normPan * (Math.PI / 2)));
          }
        } else if (this.routingMode === 'SPLIT_IEM_PA') {
          if (stem.type === 'click' || stem.type === 'guide') {
            maxLeft = Math.max(maxLeft, level);
          } else {
            maxLeft = Math.max(maxLeft, level * 0.85);
            maxRight = Math.max(maxRight, level);
          }
        } else {
          const normPan = (stem.pan + 1) / 2;
          maxLeft = Math.max(maxLeft, level * Math.cos(normPan * (Math.PI / 2)));
          maxRight = Math.max(maxRight, level * Math.sin(normPan * (Math.PI / 2)));
        }
      });
    }
    const peakL = Number(Math.min(1.5, maxLeft * this.masterVolume).toFixed(2));
    const peakR = Number(Math.min(1.5, maxRight * this.masterVolume).toFixed(2));

    const masterRta: MasterRtaData = {
      sub,
      low,
      mid,
      high,
      air,
      gainReductionDb,
      isLimiting,
      peakL,
      peakR
    };

    return { stemLevels, masterRta };
  }

  public subscribe(listener: (state: AudioEngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public subscribeMeters(listener: (frame: MeterFrame) => void): () => void {
    this.meterListeners.add(listener);
    listener(this.getMeterFrame());
    return () => this.meterListeners.delete(listener);
  }

  private getCurrentPlaybackTime(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.pausedAtTime;
    }
    const elapsed = this.ctx.currentTime - this.playbackStartTime;
    return Math.min(elapsed, this.currentSong?.duration || 0);
  }

  private applyMixerSettings(): void {
    if (!this.currentSong || !this.ctx) return;

    const stemEvals = MixerBusService.evaluateAllStems(
      this.currentSong.stems,
      this.routingMode,
      this.isSoloClickActive
    );
    const now = this.ctx.currentTime;

    stemEvals.forEach(({ stemId, gains }) => {
      const nodes = this.stemNodes.get(stemId);
      if (!nodes) return;

      // Canal 1: VS Left (Mesa FOH / Split L)
      nodes.leftGain.gain.cancelScheduledValues(now);
      nodes.leftGain.gain.setValueAtTime(gains.ch1_vsL, now);
      nodes.leftGain.gain.linearRampToValueAtTime(gains.ch1_vsL, now + 0.015);

      // Canal 2: VS Right (Mesa FOH / Split R)
      nodes.rightGain.gain.cancelScheduledValues(now);
      nodes.rightGain.gain.setValueAtTime(gains.ch2_vsR, now);
      nodes.rightGain.gain.linearRampToValueAtTime(gains.ch2_vsR, now + 0.015);

      // Canal 3: Click Track dedicado (somente monitoração/IEM)
      nodes.ch3Gain.gain.cancelScheduledValues(now);
      nodes.ch3Gain.gain.setValueAtTime(gains.ch3_click, now);
      nodes.ch3Gain.gain.linearRampToValueAtTime(gains.ch3_click, now + 0.015);

      // Canal 4: Guide Track dedicado (somente monitoração/IEM)
      nodes.ch4Gain.gain.cancelScheduledValues(now);
      nodes.ch4Gain.gain.setValueAtTime(gains.ch4_guide, now);
      nodes.ch4Gain.gain.linearRampToValueAtTime(gains.ch4_guide, now + 0.015);
    });
  }

  private setupMetronomeSchedule(): void {
    if (!this.ctx || !this.currentSong) return;

    const bpm = this.currentSong.bpm;
    const secondsPerBeat = 60 / bpm;
    const beatsPerBar = this.currentSong.timeSignature.beats;

    const currentTime = this.getCurrentPlaybackTime();
    const totalBeatsElapsed = Math.floor(currentTime / secondsPerBeat);

    this.currentBeatInBar = (totalBeatsElapsed % beatsPerBar) + 1;
    this.nextClickTime = this.ctx.currentTime + (secondsPerBeat - (currentTime % secondsPerBeat));

    const scheduleWindow = () => {
      if (!this.isPlaying || !this.ctx) return;

      while (this.nextClickTime < this.ctx.currentTime + 0.15) {
        this.scheduleClick(this.nextClickTime, this.currentBeatInBar === 1);
        this.nextClickTime += secondsPerBeat;
        this.currentBeatInBar = (this.currentBeatInBar % beatsPerBar) + 1;
      }

      this.clickTimerId = window.setTimeout(scheduleWindow, 30);
    };

    scheduleWindow();
  }

  private scheduleClick(time: number, isAccent: boolean): void {
    if (!this.ctx || (!this.finalMerger && !this.channelMerger)) return;

    const buffer = isAccent ? this.clickBufferAccent : this.clickBufferRegular;
    if (!buffer) return;

    const clickSource = this.ctx.createBufferSource();
    clickSource.buffer = buffer;

    const clickGain = this.ctx.createGain();
    const clickStem = this.currentSong?.stems.find((s) => s.type === 'click');
    const vol = clickStem?.isAudible(this.currentSong?.hasSoloTrack || false) ? clickStem.volume : 0;

    clickGain.gain.setValueAtTime(vol, time);
    clickSource.connect(clickGain);

    if (this.routingMode === 'MULTI_4CH_DISCRETE') {
      // Output 3 exclusivo: Click dedicado para monitoração dos músicos (IEM), zero PA FOH
      if (this.finalMerger) {
        clickGain.connect(this.finalMerger, 0, 2);
      }
    } else if (this.routingMode === 'SPLIT_IEM_PA') {
      // Canal 1 (Left IEM fones dos músicos)
      if (this.vsMerger) {
        clickGain.connect(this.vsMerger, 0, 0);
      } else if (this.channelMerger) {
        clickGain.connect(this.channelMerger, 0, 0);
      }
    } else {
      // Stereo Full: L e R
      if (this.vsMerger) {
        clickGain.connect(this.vsMerger, 0, 0);
        clickGain.connect(this.vsMerger, 0, 1);
      } else if (this.channelMerger) {
        clickGain.connect(this.channelMerger, 0, 0);
        clickGain.connect(this.channelMerger, 0, 1);
      }
    }

    clickSource.start(time);
  }

  private stopMetronome(): void {
    if (this.clickTimerId !== null) {
      clearTimeout(this.clickTimerId);
      this.clickTimerId = null;
    }
  }

  private startAudioSources(offset: number): void {
    if (!this.ctx || !this.currentSong) return;

    const song = this.currentSong;
    const ctxRef = this.ctx;

    song.stems.forEach((stem) => {
      const nodes = this.stemNodes.get(stem.id);
      if (!nodes) return;

      nodes.pitchShifter.setPitchShiftable(stem.isPitchShiftable);
      nodes.pitchShifter.setSemitones(song.pitchShiftSemitones);

      // Se o buffer já foi decodificado, inicia reprodução sincronizada a playbackRate = 1.0 (BPM constante)
      if (stem.audioBuffer) {
        const source = ctxRef.createBufferSource();
        source.buffer = stem.audioBuffer;
        source.connect(nodes.pitchShifter.input);

        const startOffset = Math.min(offset, stem.audioBuffer.duration);
        try {
          source.start(0, startOffset);
          nodes.source = source;
        } catch {
          // Ignora caso já iniciado
        }
        return;
      }

      // Se ainda não foi decodificado, busca o arquivo real e inicia na posição atual
      if (stem.audioUrl) {
        void fetch(stem.audioUrl)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.arrayBuffer();
          })
          .then((ab) => ctxRef.decodeAudioData(ab))
          .then((decoded) => {
            stem.audioBuffer = decoded;
            if (this.isPlaying && this.currentSong?.id === song.id && !nodes.source) {
              const src = ctxRef.createBufferSource();
              src.buffer = decoded;
              src.connect(nodes.pitchShifter.input);
              src.start(0, Math.min(this.getCurrentPlaybackTime(), decoded.duration));
              nodes.source = src;
            }
          })
          .catch((err) => {
            console.warn(`Erro ao carregar stem real (${stem.name}):`, err);
          });
      }
    });
  }

  private stopAudioSources(): void {
    this.stemNodes.forEach((nodes) => {
      if (nodes.source) {
        try {
          nodes.source.stop();
        } catch {
          // Já parado
        }
        nodes.source = null;
      }
    });
  }

  private startStateLoop(): void {
    const loop = () => {
      if (!this.isPlaying) return;

      const currentTime = this.getCurrentPlaybackTime();

      if (this.currentSong && currentTime >= this.currentSong.duration) {
        if (this.isLoopClickActive) {
          this.stopAudioSources();
          if (this.clickTimerId === null) {
            this.setupMetronomeSchedule();
          }
        } else {
          this.stop();
          return;
        }
      }

      if (this.queuedSectionId && this.currentSong) {
        const { nextDownbeatTime } = QuantizedSectionService.calculateNextDownbeatTime(
          currentTime,
          this.currentSong
        );

        if (QuantizedSectionService.isTimeToExecuteJump(currentTime, nextDownbeatTime, 0.04)) {
          const targetSection = this.currentSong.getSectionById(this.queuedSectionId);
          if (targetSection) {
            this.seek(targetSection.startTime);
            this.queuedSectionId = null;
          }
        }
      }

      if (this.isLoopingSection && this.currentSong && !this.queuedSectionId) {
        const activeSection = this.currentSong.getActiveSection(currentTime);
        if (activeSection && currentTime >= activeSection.endTime - 0.05) {
          this.seek(activeSection.startTime);
        }
      }

      this.notifyMeters();
      this.notifyStateIfChanged();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  public async detectAudioDevices(): Promise<AudioOutputDeviceInfo[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      this.availableAudioDevices = [
        {
          deviceId: 'default',
          label: 'Dispositivo Padrão do Sistema (WASAPI)',
          groupId: 'default-group',
          isVirtual: false,
          isUsb: false,
          channelCountEstimate: this.ctx?.destination?.maxChannelCount || 2
        }
      ];
      return this.availableAudioDevices;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === 'audiooutput');

      if (outputs.length === 0) {
        this.availableAudioDevices = [
          {
            deviceId: 'default',
            label: 'Dispositivo Padrão do Sistema (WASAPI)',
            groupId: 'default-group',
            isVirtual: false,
            isUsb: false,
            channelCountEstimate: this.ctx?.destination?.maxChannelCount || 2
          }
        ];
        return this.availableAudioDevices;
      }

      this.availableAudioDevices = outputs.map((d, idx) => {
        const rawLabel = d.label || `Saída de Áudio ${idx + 1}`;
        const isVirtual = /(cable|voicemeeter|virtual|vac|loopback|blackhole|dante)/i.test(rawLabel);
        const isUsb = /(usb|umc|xr18|x32|scarlett|focusrite|behringer|presonus|motu|quad|audiobox|line-level)/i.test(rawLabel);

        return {
          deviceId: d.deviceId,
          label: rawLabel,
          groupId: d.groupId,
          isVirtual,
          isUsb,
          channelCountEstimate: isUsb ? 4 : isVirtual ? 4 : (this.ctx?.destination?.maxChannelCount || 2)
        };
      });

      return this.availableAudioDevices;
    } catch {
      return this.availableAudioDevices;
    }
  }

  public async requestDevicePermissions(): Promise<AudioOutputDeviceInfo[]> {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn('Permissão de áudio não concedida ou cancelada:', err);
      }
    }
    const detected = await this.detectAudioDevices();
    this.notifyState();
    return detected;
  }

  public async setAudioOutputDevice(deviceId: string): Promise<boolean> {
    this.selectedAudioDeviceId = deviceId;
    if (this.ctx && 'setSinkId' in this.ctx) {
      try {
        // setSinkId ainda não está no lib.dom do TypeScript para AudioContext.
        await (this.ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId);
        const maxCh = this.ctx.destination.maxChannelCount;
        if (maxCh >= 4) {
          this.ctx.destination.channelCount = 4;
          this.ctx.destination.channelCountMode = 'explicit';
          this.ctx.destination.channelInterpretation = 'discrete';
        }
        this.notifyState();
        return true;
      } catch (err) {
        console.warn('Falha ao definir saída de áudio via setSinkId:', err);
      }
    } else {
      // Fallback para navegadores/ambientes sem AudioContext.setSinkId nativo
      this.notifyState();
      return true;
    }
    this.notifyState();
    return false;
  }

  public testChannelTone(channelIndex: number, durationMs: number = 1200): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const freqs = [440, 554.37, 1000, 880];
    osc.frequency.value = freqs[channelIndex] || 440;
    osc.type = channelIndex === 2 ? 'square' : 'sine';

    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gain.gain.setValueAtTime(0.3, now + (durationMs / 1000) - 0.08);
    gain.gain.linearRampToValueAtTime(0.0001, now + (durationMs / 1000));

    osc.connect(gain);

    if (this.finalMerger) {
      if (this.routingMode === 'MULTI_4CH_DISCRETE') {
        gain.connect(this.finalMerger, 0, channelIndex);
      } else if (this.routingMode === 'SPLIT_IEM_PA') {
        if (channelIndex === 2 || channelIndex === 3) {
          gain.connect(this.finalMerger, 0, 0); // Fones (L)
        } else {
          gain.connect(this.finalMerger, 0, 1); // PA (R)
        }
      } else {
        if (channelIndex === 0 || channelIndex === 2) {
          gain.connect(this.finalMerger, 0, 0);
        } else {
          gain.connect(this.finalMerger, 0, 1);
        }
      }
    } else {
      gain.connect(this.ctx.destination);
    }

    osc.start(now);
    osc.stop(now + (durationMs / 1000));
  }

  private setupDeviceChangeListener(): void {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.handleDeviceChangeEvent();
      });
    }
  }

  public handleDeviceChangeEvent(): void {
    // 1. Resposta imediata (0 ms) para conter vazamento do metrônomo no palco em desconexão
    void this.checkImmediateLossAndInterrupt();

    // 2. Debounce de 150 ms para aguardar estabilização de enumeração do SO e detectar reconexão
    if (this.deviceChangeDebounceTimer !== null) {
      clearTimeout(this.deviceChangeDebounceTimer);
    }
    this.deviceChangeDebounceTimer = window.setTimeout(() => {
      void this.evaluateDeviceChange();
    }, 150);
  }

  public async checkImmediateLossAndInterrupt(): Promise<void> {
    if (this.selectedAudioDeviceId && this.selectedAudioDeviceId !== 'default') {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
          const isStillAvailable = audioOutputs.some((d) => d.deviceId === this.selectedAudioDeviceId);
          if (!isStillAvailable) {
            if (this.isPlaying) {
              this.pause();
            }
            this.routeHealth = 'lost';
            this.routeLossReason =
              'A interface de áudio selecionada foi desconectada fisicamente ou desativada no sistema operacional. ' +
              'A reprodução foi interrompida imediatamente (0 ms) para evitar vazamento do metrônomo para os alto-falantes padrão.';
            this.notifyState();
          }
        }
      } catch (err) {
        console.warn('Erro na verificação imediata de devicechange:', err);
      }
    }
  }

  public async evaluateDeviceChange(): Promise<void> {
    const previousSelectedId = this.selectedAudioDeviceId;
    const previousHealth = this.routeHealth;
    await this.detectAudioDevices();

    // Se uma interface específica estava ativa (diferente de 'default' ou vazia)
    if (previousSelectedId && previousSelectedId !== 'default') {
      const isStillAvailable = this.availableAudioDevices.some((d) => d.deviceId === previousSelectedId);

      if (!isStillAvailable) {
        // Dispositivo perdido!
        if (this.isPlaying) {
          this.pause();
        }
        this.routeHealth = 'lost';
        this.routeLossReason =
          'A interface de áudio selecionada foi desconectada fisicamente ou desativada no sistema operacional. ' +
          'A reprodução foi pausada por segurança para evitar direcionamento do metrônomo para os alto-falantes padrão.';
        this.notifyState();
        return;
      }

      // Se estava perdido e agora retornou na enumeração
      if (previousHealth === 'lost' && isStillAvailable) {
        this.routeHealth = 'reconnected';
        this.routeLossReason =
          'Interface de áudio detectada novamente. Por segurança litúrgica, clique em "Revalidar Rota de Palco" antes de retomar.';
        this.notifyState();
        return;
      }
    }

    // Mudança irrelevante (ex: webcam ou microfone plugado/desplugado enquanto a saída selecionada permanece intacta)
    if (this.routeHealth === 'lost' || this.routeHealth === 'reconnected') {
      // Mantém o estado de alerta até confirmação explícita do operador
    } else {
      this.routeHealth = 'healthy';
      this.routeLossReason = null;
    }
    this.notifyState();
  }

  public async confirmRouteRecovery(): Promise<boolean> {
    if (!this.selectedAudioDeviceId) return false;
    const ok = await this.setAudioOutputDevice(this.selectedAudioDeviceId);
    if (ok || this.selectedAudioDeviceId === 'default') {
      this.routeHealth = 'healthy';
      this.routeLossReason = null;
      this.notifyState();
      return true;
    }
    return false;
  }

  /** Emissão forçada: comandos do operador e eventos de rota sempre chegam à UI. */
  private notifyState(): void {
    const state = this.getState();
    this.lastStateSignature = WebAudioEngine.stateSignature(state);
    WebAudioEngine.emit(this.listeners, state);
    // Ao parar/pausar o loop rAF não roda mais: um quadro final zera os medidores.
    if (!this.isPlaying) this.notifyMeters();
  }

  /** Emissão do loop rAF: só quando algo visível mudou (tempo arredondado em 100 ms). */
  private notifyStateIfChanged(): void {
    if (this.listeners.size === 0) return;
    const state = this.getState();
    const signature = WebAudioEngine.stateSignature(state);
    if (signature === this.lastStateSignature) return;
    this.lastStateSignature = signature;
    WebAudioEngine.emit(this.listeners, state);
  }

  private notifyMeters(): void {
    if (this.meterListeners.size === 0) return;
    const frame = this.getMeterFrame();
    WebAudioEngine.emit(this.meterListeners, frame);
  }

  /** Um listener da UI que lança exceção não pode matar o loop rAF (pulo quantizado, fim da música). */
  private static emit<T>(listeners: Set<(value: T) => void>, value: T): void {
    listeners.forEach((listener) => {
      try {
        listener(value);
      } catch (err) {
        console.error('[WebAudioEngine] listener falhou:', err);
      }
    });
  }

  private static stateSignature(state: AudioEngineState): string {
    return [
      state.isPlaying,
      Math.floor(state.currentTime / STATE_TIME_RESOLUTION_S),
      state.currentBar,
      state.currentBeat,
      state.activeSectionId,
      state.queuedSectionId,
      state.isCountingIn,
      state.countInBeat
    ].join('|');
  }
}
