import { AudioOutputDeviceInfo, AudioRouteHealth } from '../../application/ports/AudioEnginePort';

/**
 * O que o monitor precisa do motor. O motor continua dono do AudioContext, do dispositivo
 * selecionado e do transporte; o monitor só decide a saúde da rota (ENG-02).
 */
export interface RouteHealthHost {
  /** Canais físicos da saída atual (ctx.destination.maxChannelCount) ou 2 sem contexto. */
  getMaxChannelCount(): number;
  getSelectedDeviceId(): string;
  isPlaying(): boolean;
  pause(): void;
  setAudioOutputDevice(deviceId: string): Promise<boolean>;
  notifyState(): void;
}

/** Atraso para a enumeração do SO estabilizar antes de reavaliar o devicechange. */
const DEVICE_CHANGE_DEBOUNCE_MS = 150;

/**
 * Monitor de integridade de rota de áudio de palco (ENG-02).
 * Desconexão física interrompe a reprodução na hora; 'lost'/'reconnected' só voltam a
 * 'healthy' por confirmRouteRecovery() do operador. O bloqueio do play() fica no motor,
 * que consulta `health`.
 */
export class RouteHealthMonitor {
  private devices: AudioOutputDeviceInfo[] = [];
  private _health: AudioRouteHealth = 'healthy';
  private _lossReason: string | null = null;
  private debounceTimer: number | null = null;

  constructor(private readonly host: RouteHealthHost) {}

  public get health(): AudioRouteHealth {
    return this._health;
  }

  public get lossReason(): string | null {
    return this._lossReason;
  }

  public get availableDevices(): AudioOutputDeviceInfo[] {
    return this.devices;
  }

  /** True quando o play() precisa ser bloqueado até o operador revalidar a rota. */
  public get blocksPlayback(): boolean {
    return this._health === 'lost' || this._health === 'reconnected';
  }

  public listen(): void {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.handleDeviceChangeEvent();
      });
    }
  }

  public handleDeviceChangeEvent(): void {
    // 1. Resposta imediata (0 ms) para conter vazamento do metrônomo no palco em desconexão
    void this.checkImmediateLossAndInterrupt();

    // 2. Debounce para aguardar estabilização de enumeração do SO e detectar reconexão
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      void this.evaluateDeviceChange();
    }, DEVICE_CHANGE_DEBOUNCE_MS);
  }

  public async detectAudioDevices(): Promise<AudioOutputDeviceInfo[]> {
    const maxChannels = this.host.getMaxChannelCount();

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      this.devices = [RouteHealthMonitor.defaultDevice(maxChannels)];
      return this.devices;
    }

    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const outputs = all.filter((d) => d.kind === 'audiooutput');

      if (outputs.length === 0) {
        this.devices = [RouteHealthMonitor.defaultDevice(maxChannels)];
        return this.devices;
      }

      this.devices = outputs.map((d, idx) => {
        const rawLabel = d.label || `Saída de Áudio ${idx + 1}`;
        const isVirtual = /(cable|voicemeeter|virtual|vac|loopback|blackhole|dante)/i.test(rawLabel);
        const isUsb = /(usb|umc|xr18|x32|scarlett|focusrite|behringer|presonus|motu|quad|audiobox|line-level)/i.test(rawLabel);

        return {
          deviceId: d.deviceId,
          label: rawLabel,
          groupId: d.groupId,
          isVirtual,
          isUsb,
          channelCountEstimate: isUsb ? 4 : isVirtual ? 4 : maxChannels
        };
      });

      return this.devices;
    } catch {
      return this.devices;
    }
  }

  public async checkImmediateLossAndInterrupt(): Promise<void> {
    const selected = this.host.getSelectedDeviceId();
    if (selected && selected !== 'default') {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
          const all = await navigator.mediaDevices.enumerateDevices();
          const audioOutputs = all.filter((d) => d.kind === 'audiooutput');
          const isStillAvailable = audioOutputs.some((d) => d.deviceId === selected);
          if (!isStillAvailable) {
            if (this.host.isPlaying()) {
              this.host.pause();
            }
            this._health = 'lost';
            this._lossReason =
              'A interface de áudio selecionada foi desconectada fisicamente ou desativada no sistema operacional. ' +
              'A reprodução foi interrompida imediatamente (0 ms) para evitar vazamento do metrônomo para os alto-falantes padrão.';
            this.host.notifyState();
          }
        }
      } catch (err) {
        console.warn('Erro na verificação imediata de devicechange:', err);
      }
    }
  }

  public async evaluateDeviceChange(): Promise<void> {
    const previousSelectedId = this.host.getSelectedDeviceId();
    const previousHealth = this._health;
    await this.detectAudioDevices();

    // Se uma interface específica estava ativa (diferente de 'default' ou vazia)
    if (previousSelectedId && previousSelectedId !== 'default') {
      const isStillAvailable = this.devices.some((d) => d.deviceId === previousSelectedId);

      if (!isStillAvailable) {
        // Dispositivo perdido!
        if (this.host.isPlaying()) {
          this.host.pause();
        }
        this._health = 'lost';
        this._lossReason =
          'A interface de áudio selecionada foi desconectada fisicamente ou desativada no sistema operacional. ' +
          'A reprodução foi pausada por segurança para evitar direcionamento do metrônomo para os alto-falantes padrão.';
        this.host.notifyState();
        return;
      }

      // Se estava perdido e agora retornou na enumeração
      if (previousHealth === 'lost' && isStillAvailable) {
        this._health = 'reconnected';
        this._lossReason =
          'Interface de áudio detectada novamente. Por segurança litúrgica, clique em "Revalidar Rota de Palco" antes de retomar.';
        this.host.notifyState();
        return;
      }
    }

    // Mudança irrelevante (ex: webcam ou microfone plugado/desplugado enquanto a saída selecionada permanece intacta)
    if (!this.blocksPlayback) {
      this._health = 'healthy';
      this._lossReason = null;
    }
    // Em 'lost'/'reconnected' mantém o alerta até confirmação explícita do operador
    this.host.notifyState();
  }

  public async confirmRouteRecovery(): Promise<boolean> {
    const selected = this.host.getSelectedDeviceId();
    if (!selected) return false;
    const ok = await this.host.setAudioOutputDevice(selected);
    if (ok || selected === 'default') {
      this._health = 'healthy';
      this._lossReason = null;
      this.host.notifyState();
      return true;
    }
    return false;
  }

  private static defaultDevice(channelCountEstimate: number): AudioOutputDeviceInfo {
    return {
      deviceId: 'default',
      label: 'Dispositivo Padrão do Sistema (WASAPI)',
      groupId: 'default-group',
      isVirtual: false,
      isUsb: false,
      channelCountEstimate
    };
  }
}
