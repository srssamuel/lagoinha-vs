import { Song } from '../../domain/entities/Song';
import { RoutingMode } from '../../domain/value-objects/AudioRouting';
import { connectClickToBus, RoutingBuses } from './AudioRoutingGraph';
import { PITCH_PATH_LATENCY_SEC } from './PitchShifterDspNode';
import { ProceduralClickGenerator } from './ProceduralClickGenerator';

/** Barramentos de destino do click procedural (criados pelo motor em init()). */
export type MetronomeBuses = RoutingBuses;

/** O que o agendador precisa do motor; o motor segue dono do AudioContext e do transporte. */
export interface MetronomeHost {
  getCtx(): AudioContext | null;
  getSong(): Song | null;
  getRoutingMode(): RoutingMode;
  getBuses(): MetronomeBuses;
  isPlaying(): boolean;
  getPlaybackTime(): number;
  /** Segundos até o início agendado dos stems (margem comum de partida); 0 se já começaram. */
  getTransportLeadSec?(): number;
  notifyState(): void;
}

/** Margem entre o comando de play/seek e o `when` comum de todos os stems (sample-accurate entre eles). */
export const TRANSPORT_START_MARGIN_S = 0.05;

interface PendingClick {
  source: AudioBufferSourceNode;
  gain: GainNode;
  at: number;
  /** Fim da reprodução do click (at + duração do buffer): até lá o destino ainda pode ser religado. */
  end: number;
}

/**
 * Latência (s) que o stem acumula no channel strip e o click procedural não tem: o DynamicsCompressorNode do strip
 * (mesmo com ratio 1) impõe 6 ms de pre-delay no Chromium. Medido no render real (render-alignment.mjs, seção 6):
 * sem esta soma o click procedural saía 6,0 ms antes do stem de bateria.
 */
export const CLICK_STRIP_LATENCY_SEC = 0.006;

/** Janela de lookahead: cliques são agendados no relógio do AudioContext até 150 ms à frente. */
const LOOKAHEAD_S = 0.15;
/** Intervalo do timer que só reabastece a janela (nunca é o relógio do áudio). */
const SCHEDULER_INTERVAL_MS = 30;

/**
 * Metrônomo procedural (usado quando a música não traz stem de click real, ou no Loop Click)
 * e contagem prévia (count-in) de 1 ou 2 compassos.
 *
 * O instante de cada click vem de AudioContext.currentTime (lookahead); setTimeout apenas
 * reabastece a janela. O roteamento do click respeita o modo: nunca chega ao FOH no
 * SPLIT_IEM_PA nem no MULTI_4CH_DISCRETE.
 */
export class MetronomeScheduler {
  private timerId: number | null = null;
  private nextClickTime = 0;
  private beatInBar = 1;
  private bufferAccent: AudioBuffer | null = null;
  private bufferRegular: AudioBuffer | null = null;

  private _countInBars = 0; // 0 = Off, 1 = 1 compasso, 2 = 2 compassos
  private _isCountingIn = false;
  private _countInBeat = 1;
  private countInTimerId: number | null = null;
  /** Clicks já agendados no AudioContext e ainda não tocados: o destino pode mudar ou eles podem ser cancelados. */
  private pending: PendingClick[] = [];

  constructor(private readonly host: MetronomeHost) {}

  public get countInBars(): number {
    return this._countInBars;
  }

  public get isCountingIn(): boolean {
    return this._isCountingIn;
  }

  public get countInBeat(): number {
    return this._countInBeat;
  }

  /** Há um laço de agendamento ativo. */
  public get isRunning(): boolean {
    return this.timerId !== null;
  }

  public setCountInBars(bars: number): void {
    this._countInBars = Math.max(0, Math.min(2, Math.round(bars)));
  }

  /** Pré-cria os buffers de click (acento e regular). */
  public prepare(ctx: AudioContext): void {
    this.bufferAccent = ProceduralClickGenerator.createClickBuffer(ctx, true);
    this.bufferRegular = ProceduralClickGenerator.createClickBuffer(ctx, false);
  }

  public start(): void {
    const ctx = this.host.getCtx();
    const song = this.host.getSong();
    if (!ctx || !song) return;

    const secondsPerBeat = 60 / song.bpm;
    const beatsPerBar = song.timeSignature.beats;

    const currentTime = this.host.getPlaybackTime();
    // Os stems começam em lead s (when comum); currentTime é a posição agora (negativa antes da partida).
    // A grade de tempos do click parte da posição que a música terá no instante de partida.
    const lead = Math.max(0, this.host.getTransportLeadSec?.() ?? 0);
    const posAtStart = lead > 0 ? Math.max(0, Math.round((currentTime + lead) * 1e6) / 1e6) : Math.max(0, currentTime);
    // Próximo tempo da grade a partir da posição (inclusive o próprio, se cair exatamente nele: na posição 0
    // o tempo 1 soa na partida). O rótulo do compasso é o desse tempo, não o do tempo já em curso.
    const nextBeatIndex = Math.ceil(posAtStart / secondsPerBeat - 1e-9);
    this.beatInBar = (nextBeatIndex % beatsPerBar) + 1;
    this.nextClickTime = ctx.currentTime + lead + (nextBeatIndex * secondsPerBeat - posAtStart);

    const scheduleWindow = () => {
      const liveCtx = this.host.getCtx();
      if (!this.host.isPlaying() || !liveCtx) return;

      while (this.nextClickTime < liveCtx.currentTime + LOOKAHEAD_S) {
        this.scheduleClick(this.nextClickTime, this.beatInBar === 1);
        this.nextClickTime += secondsPerBeat;
        this.beatInBar = (this.beatInBar % beatsPerBar) + 1;
      }

      this.timerId = window.setTimeout(scheduleWindow, SCHEDULER_INTERVAL_MS);
    };

    scheduleWindow();
  }

  public stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    // Clicks já entregues ao AudioContext (até ~170 ms à frente) não podem tocar depois de parar/pausar/pular.
    this.cancelPending();
  }

  /** Para e desconecta os clicks já agendados e ainda não terminados. */
  public cancelPending(): void {
    for (const p of this.pending) {
      try {
        p.source.stop();
      } catch {
        // Já parado
      }
      try {
        p.source.disconnect();
      } catch {
        // Já desconectado
      }
      try {
        p.gain.disconnect();
      } catch {
        // Já desconectado
      }
    }
    this.pending = [];
  }

  /**
   * Religa os clicks já agendados ao destino do modo de roteamento vigente. O destino é escolhido ao agendar
   * (até ~170 ms antes do click); sem isto, Stereo -> Split com música tocando soltaria um click no PA.
   */
  public rerouteScheduled(): void {
    const ctx = this.host.getCtx();
    if (!ctx) return;
    this.prunePending(ctx.currentTime);
    const mode = this.host.getRoutingMode();
    const buses = this.host.getBuses();
    for (const p of this.pending) {
      try {
        p.gain.disconnect();
      } catch {
        // Já desconectado
      }
      connectClickToBus(p.gain, mode, buses);
    }
  }

  private prunePending(now: number): void {
    this.pending = this.pending.filter((p) => p.end > now);
  }

  /**
   * Contagem prévia. O motor já marcou isPlaying; ao fim da contagem chama `onComplete`
   * (que inicia stems e metrônomo) se ainda estiver tocando.
   */
  public startCountIn(onComplete: () => void): void {
    const song = this.host.getSong();
    if (!this.host.getCtx() || !song) return;

    this._isCountingIn = true;
    this._countInBeat = 1;

    const secondsPerBeat = 60 / song.bpm;
    const beatsPerBar = song.timeSignature.beats;
    const totalBeats = this._countInBars * beatsPerBar;
    let beatsRemaining = totalBeats;

    const tick = () => {
      const ctx = this.host.getCtx();
      if (!this.host.isPlaying() || !this._isCountingIn || !ctx) return;

      const currentCount = totalBeats - beatsRemaining + 1;
      const beatInCurrentBar = ((currentCount - 1) % beatsPerBar) + 1;
      this._countInBeat = currentCount;
      this.scheduleClick(ctx.currentTime, beatInCurrentBar === 1);
      this.host.notifyState();

      beatsRemaining--;

      if (beatsRemaining > 0) {
        this.countInTimerId = window.setTimeout(tick, secondsPerBeat * 1000);
      } else {
        this.countInTimerId = window.setTimeout(() => {
          if (!this.host.isPlaying() || !this.host.getCtx()) return;
          this._isCountingIn = false;
          onComplete();
        }, secondsPerBeat * 1000);
      }
    };

    tick();
  }

  public cancelCountIn(): void {
    if (this.countInTimerId !== null) {
      clearTimeout(this.countInTimerId);
      this.countInTimerId = null;
    }
    this._isCountingIn = false;
    this.cancelPending();
  }

  public scheduleClick(time: number, isAccent: boolean): void {
    const ctx = this.host.getCtx();
    const buses = this.host.getBuses();
    if (!ctx || (!buses.finalMerger && !buses.channelMerger)) return;

    const buffer = isAccent ? this.bufferAccent : this.bufferRegular;
    if (!buffer) return;

    // Os stems passam pelo PitchShifterDspNode, que impõe PITCH_PATH_LATENCY_SEC a todos (transpostos ou não). O
    // click procedural não passa por ali nem pelo strip: soma as duas latências para continuar no tempo da banda.
    const at = time + PITCH_PATH_LATENCY_SEC + CLICK_STRIP_LATENCY_SEC;

    const clickSource = ctx.createBufferSource();
    clickSource.buffer = buffer;

    const clickGain = ctx.createGain();
    const song = this.host.getSong();
    const clickStem = song?.stems.find((s) => s.type === 'click');
    const vol = clickStem?.isAudible(song?.hasSoloTrack || false) ? clickStem.volume : 0;

    clickGain.gain.setValueAtTime(vol, at);
    clickSource.connect(clickGain);

    connectClickToBus(clickGain, this.host.getRoutingMode(), buses);

    clickSource.start(at);
    this.prunePending(ctx.currentTime);
    this.pending.push({ source: clickSource, gain: clickGain, at, end: at + (buffer.duration || 0.05) });
  }
}
