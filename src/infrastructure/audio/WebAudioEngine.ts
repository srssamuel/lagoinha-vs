import { AudioEnginePort, AudioEngineState } from '../../application/ports/AudioEnginePort';
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
  leftGain: GainNode;
  rightGain: GainNode;
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
  private channelMerger: ChannelMergerNode | null = null;

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
  private animationFrameId: number | null = null;

  constructor() {
    // Lazy AudioContext initialization on first user gesture
  }

  public async init(): Promise<void> {
    if (this.ctx) return;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

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

    // Canal L e R independentes -> Master Gain -> Master Brickwall Limiter -> Master Analyser -> Saída
    this.channelMerger = this.ctx.createChannelMerger(2);
    this.channelMerger.connect(this.masterGain);
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

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
      const leftGain = this.ctx.createGain();
      const rightGain = this.ctx.createGain();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      const timeDomainData = new Uint8Array(analyser.frequencyBinCount);

      // Cadeia VST Channel Strip:
      // PitchShifter (Constant-Tempo, Bypass em Bateria/Loops/Click/Guia) -> HighPass (De-Bleed) -> EQ 3 Bandas -> Tube Saturator -> Compressor -> Gain -> Analyser & Split L/R
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

      // Conecta no mixer: leftGain no canal 0 (Left = IEM), rightGain no canal 1 (Right = PA)
      leftGain.connect(this.channelMerger, 0, 0);
      rightGain.connect(this.channelMerger, 0, 1);

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
        if (this.routingMode === 'SPLIT_IEM_PA') {
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

    const masterRta = {
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
      stemLevels,
      countInBars: this.countInBars,
      isCountingIn: this.isCountingIn,
      countInBeat: this.countInBeat,
      masterRta
    };
  }

  public subscribe(listener: (state: AudioEngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
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

      nodes.leftGain.gain.cancelScheduledValues(now);
      nodes.leftGain.gain.value = gains.leftGain;
      nodes.leftGain.gain.setValueAtTime(gains.leftGain, now);
      nodes.leftGain.gain.linearRampToValueAtTime(gains.leftGain, now + 0.015);

      nodes.rightGain.gain.cancelScheduledValues(now);
      nodes.rightGain.gain.value = gains.rightGain;
      nodes.rightGain.gain.setValueAtTime(gains.rightGain, now);
      nodes.rightGain.gain.linearRampToValueAtTime(gains.rightGain, now + 0.015);
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
    if (!this.ctx || !this.channelMerger) return;

    const buffer = isAccent ? this.clickBufferAccent : this.clickBufferRegular;
    if (!buffer) return;

    const clickSource = this.ctx.createBufferSource();
    clickSource.buffer = buffer;

    const clickGain = this.ctx.createGain();
    const clickStem = this.currentSong?.stems.find((s) => s.type === 'click');
    const vol = clickStem?.isAudible(this.currentSong?.hasSoloTrack || false) ? clickStem.volume : 0;

    clickGain.gain.setValueAtTime(vol, time);
    clickSource.connect(clickGain);

    if (this.routingMode === 'SPLIT_IEM_PA') {
      clickGain.connect(this.channelMerger, 0, 0);
    } else {
      clickGain.connect(this.channelMerger, 0, 0);
      clickGain.connect(this.channelMerger, 0, 1);
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

      this.notifyState();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private notifyState(): void {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }
}
