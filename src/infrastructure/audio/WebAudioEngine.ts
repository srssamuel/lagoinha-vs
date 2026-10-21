import {
  AudioEnginePort,
  AudioEngineState,
  AudioOutputDeviceInfo,
  MasterRtaData,
  MeterFrame
} from '../../application/ports/AudioEnginePort';

/** Resolução temporal do estado emitido ao React durante o playback (playhead/relógio). */
const STATE_TIME_RESOLUTION_S = 0.1;
import { Song } from '../../domain/entities/Song';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { MixerBusService } from '../../application/services/MixerBusService';
import { QuantizedSectionService } from '../../application/services/QuantizedSectionService';
import {
  applyStemRoutingGains,
  buildMasterRouting,
  connectTestTone,
  createStemChannelStrip,
  StemAudioNodes
} from './AudioRoutingGraph';
import { MetronomeScheduler, TRANSPORT_START_MARGIN_S } from './MetronomeScheduler';
import { VstPluginRackService } from '../../domain/services/VstPluginRackService';
import { RouteHealthMonitor } from './RouteHealthMonitor';

export class WebAudioEngine implements AudioEnginePort {
  private ctx: AudioContext | null = null;
  private currentSong: Song | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterFreqData: Uint8Array<ArrayBuffer> | null = null;
  private vsMerger: ChannelMergerNode | null = null;
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

  // Metrônomo procedural (só sem stem de click real ou no Loop Click) e contagem prévia (1 ou 2 compassos)
  private readonly metronome = new MetronomeScheduler({
    getCtx: () => this.ctx,
    getSong: () => this.currentSong,
    getRoutingMode: () => this.routingMode,
    getBuses: () => ({
      vsMerger: this.vsMerger,
      finalMerger: this.finalMerger,
      channelMerger: this.channelMerger
    }),
    isPlaying: () => this.isPlaying,
    // Posição sem piso: negativa durante a margem de partida, para a grade do click partir da posição certa
    getPlaybackTime: () => this.getTransportTime(),
    getTransportLeadSec: () => this.getTransportLeadSec(),
    notifyState: () => this.notifyState()
  });

  // State update listeners
  private listeners: Set<(state: AudioEngineState) => void> = new Set();
  private meterListeners: Set<(frame: MeterFrame) => void> = new Set();
  private lastStateSignature: string = '';
  private animationFrameId: number | null = null;

  // Dispositivo de saída selecionado (a saúde da rota e a lista de dispositivos vivem no monitor)
  private selectedAudioDeviceId: string = 'default';

  // Integridade de Rota de Áudio de Palco (ENG-02)
  private readonly routeMonitor = new RouteHealthMonitor({
    getMaxChannelCount: () => this.ctx?.destination?.maxChannelCount || 2,
    getSelectedDeviceId: () => this.selectedAudioDeviceId,
    isPlaying: () => this.isPlaying,
    pause: () => this.pause(),
    setAudioOutputDevice: (deviceId) => this.setAudioOutputDevice(deviceId),
    notifyState: () => this.notifyState()
  });

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
    this.routeMonitor.listen();

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

    const master = buildMasterRouting(this.ctx, this.masterVolume);
    this.masterGain = master.masterGain;
    this.masterLimiter = master.masterLimiter;
    this.masterAnalyser = master.masterAnalyser;
    this.masterFreqData = master.masterFreqData;
    this.vsMerger = master.vsMerger;
    this.finalMerger = master.finalMerger;
    this.channelMerger = this.finalMerger; // backward compatibility
    // Pré-cria buffers de click de reserva para Loop Click
    this.metronome.prepare(this.ctx);
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

      this.stemNodes.set(
        stem.id,
        createStemChannelStrip(this.ctx, stem, song.pitchShiftSemitones, {
          vsMerger: this.vsMerger,
          finalMerger: this.finalMerger
        })
      );
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
            // (durante a contagem prévia nada começou: startAudioSources pega o buffer pronto ao fim dela)
            if (this.isPlaying && !this.metronome.isCountingIn && this.currentSong?.id === song.id) {
              const currentNodes = this.stemNodes.get(stem.id);
              if (currentNodes && !currentNodes.source) {
                const src = ctxRef.createBufferSource();
                src.buffer = decoded;
                src.connect(currentNodes.pitchShifter.input);
                this.startSourceInSync(src, decoded, currentNodes);
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
    if (this.routeMonitor.blocksPlayback) {
      console.warn(
        `[WebAudioEngine] Reprodução bloqueada: Rota de áudio em estado '${this.routeMonitor.health}'. ` +
        `Revalide a rota na interface de palco antes de iniciar o playback.`
      );
      return;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    // Se houver contagem prévia configurada (1 ou 2 compassos) e a música estiver no início (tempo 0)
    if (this.metronome.countInBars > 0 && this.pausedAtTime === 0 && !this.metronome.isCountingIn) {
      this.startPreRollCountIn();
      return;
    }

    this.isPlaying = true;
    // when comum de todos os stems: agora + margem, para que nenhum start() caia no passado do thread de áudio
    this.playbackStartTime = this.ctx.currentTime + TRANSPORT_START_MARGIN_S - this.pausedAtTime;

    // Só usa metrônomo procedural se a música não tiver um arquivo real de click
    const clickStem = this.currentSong.stems.find((s) => s.type === 'click');
    if (!clickStem?.audioUrl) {
      this.metronome.start();
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

    this.metronome.startCountIn(() => {
      if (!this.ctx) return;
      this.playbackStartTime = this.ctx.currentTime + TRANSPORT_START_MARGIN_S;
      this.pausedAtTime = 0;

      const clickStem = this.currentSong?.stems.find((s) => s.type === 'click');
      if (!clickStem?.audioUrl) {
        this.metronome.start();
      }

      this.applyMixerSettings();
      this.startAudioSources(0);
      this.startStateLoop();
      this.notifyState();
    });
  }
  public pause(): void {
    if (!this.isPlaying || !this.ctx) return;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.metronome.cancelCountIn();
    this.pausedAtTime = this.getCurrentPlaybackTime();
    this.stopAudioSources();
    this.metronome.stop();
    this.isPlaying = false;
    this.notifyState();
  }

  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.metronome.cancelCountIn();
    this.stopAudioSources();
    this.metronome.stop();
    this.isPlaying = false;
    this.pausedAtTime = 0;
    this.queuedSectionId = null;
    this.notifyState();
  }

  public seek(timeInSeconds: number): void {
    this.metronome.cancelCountIn();
    const target = Math.max(0, Math.min(this.currentSong?.duration || 0, timeInSeconds));
    const wasPlaying = this.isPlaying;

    if (wasPlaying) {
      this.stopAudioSources();
      this.metronome.stop();
    }

    this.pausedAtTime = target;

    if (wasPlaying && this.ctx) {
      this.playbackStartTime = this.ctx.currentTime + TRANSPORT_START_MARGIN_S - this.pausedAtTime;
      const clickStem = this.currentSong?.stems.find((s) => s.type === 'click');
      if (!clickStem?.audioUrl) {
        this.metronome.start();
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
    // Clicks procedurais já agendados (até ~170 ms à frente) foram ligados ao destino do modo antigo
    this.metronome.rerouteScheduled();
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
    this.metronome.setCountInBars(bars);
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
      countInBars: this.metronome.countInBars,
      isCountingIn: this.metronome.isCountingIn,
      countInBeat: this.metronome.countInBeat,
      audioHardwareChannels,
      availableAudioDevices: this.routeMonitor.availableDevices,
      selectedAudioDeviceId: this.selectedAudioDeviceId,
      routeHealth: this.routeMonitor.health,
      routeLossReason: this.routeMonitor.lossReason
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

  /** Posição da música agora em relação ao when comum; negativa (ou menor que a de partida) antes da partida. */
  private getTransportTime(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.pausedAtTime;
    }
    const elapsed = this.ctx.currentTime - this.playbackStartTime;
    return Math.min(elapsed, this.currentSong?.duration || 0);
  }

  private getCurrentPlaybackTime(): number {
    return Math.max(0, this.getTransportTime());
  }

  /** Segundos até o when comum dos stems (0 se já começaram ou se não há transporte). */
  private getTransportLeadSec(): number {
    if (!this.ctx || !this.isPlaying) return 0;
    return Math.max(0, this.playbackStartTime + this.pausedAtTime - this.ctx.currentTime);
  }

  /**
   * Inicia um stem decodificado depois da partida, no mesmo relógio do transporte: toca em
   * max(agora, when comum) e a posição no buffer é a que a música tem naquele instante.
   */
  private startSourceInSync(source: AudioBufferSourceNode, buffer: AudioBuffer, nodes: StemAudioNodes): void {
    if (!this.ctx) return;
    const startAt = this.playbackStartTime + this.pausedAtTime;
    const when = Math.max(this.ctx.currentTime, startAt);
    const position = Math.min(this.pausedAtTime + (when - startAt), buffer.duration);
    try {
      source.start(when, position);
      nodes.source = source;
    } catch {
      // Ignora caso já iniciado
    }
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

      applyStemRoutingGains(nodes, gains, now);
    });
  }

  private startAudioSources(offset: number): void {
    if (!this.ctx || !this.currentSong) return;

    const song = this.currentSong;
    const ctxRef = this.ctx;
    // when comum calculado UMA vez: todos os stems recebem o mesmo instante e a posição que lhe corresponde
    const nominalStart = this.playbackStartTime + offset;
    const when = Math.max(ctxRef.currentTime, nominalStart);
    const bufferPosition = offset + (when - nominalStart);

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

        const startOffset = Math.min(bufferPosition, stem.audioBuffer.duration);
        try {
          source.start(when, startOffset);
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
            if (this.isPlaying && !this.metronome.isCountingIn && this.currentSong?.id === song.id && !nodes.source) {
              const src = ctxRef.createBufferSource();
              src.buffer = decoded;
              src.connect(nodes.pitchShifter.input);
              this.startSourceInSync(src, decoded, nodes);
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
          if (!this.metronome.isRunning) {
            this.metronome.start();
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

  public detectAudioDevices(): Promise<AudioOutputDeviceInfo[]> {
    return this.routeMonitor.detectAudioDevices();
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
      connectTestTone(gain, this.routingMode, channelIndex, this.finalMerger);
    } else {
      gain.connect(this.ctx.destination);
    }
    osc.start(now);
    osc.stop(now + (durationMs / 1000));
  }

  public handleDeviceChangeEvent(): void {
    this.routeMonitor.handleDeviceChangeEvent();
  }

  public checkImmediateLossAndInterrupt(): Promise<void> {
    return this.routeMonitor.checkImmediateLossAndInterrupt();
  }

  public evaluateDeviceChange(): Promise<void> {
    return this.routeMonitor.evaluateDeviceChange();
  }

  public confirmRouteRecovery(): Promise<boolean> {
    return this.routeMonitor.confirmRouteRecovery();
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
