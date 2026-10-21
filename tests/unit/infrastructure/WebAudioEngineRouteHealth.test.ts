import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAudioEngine } from '../../../src/infrastructure/audio/WebAudioEngine';
import { DemoWorshipSongs } from '../../../src/infrastructure/mock/DemoWorshipSongs';

describe('WebAudioEngine — Integridade de Rota e Interrupção Imediata (ENG-02)', () => {
  let engine: WebAudioEngine;
  let mockDevices: MediaDeviceInfo[];
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockDevices = [
      {
        deviceId: 'default',
        kind: 'audiooutput',
        label: 'Alto-falantes do Laptop (Realtek Audio)',
        groupId: 'group-1',
        toJSON: () => ({})
      } as MediaDeviceInfo,
      {
        deviceId: 'xr18-usb-interface',
        kind: 'audiooutput',
        label: 'Behringer X-AIR XR18 USB ASIO (18ch)',
        groupId: 'group-2',
        toJSON: () => ({})
      } as MediaDeviceInfo
    ];

    const mockAudioContext = vi.fn().mockImplementation(() => ({
      destination: { maxChannelCount: 4, channelCount: 4, channelCountMode: 'explicit', channelInterpretation: 'discrete' },
      createGain: () => ({
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
          linearRampToValueAtTime: vi.fn()
        },
        connect: vi.fn()
      }),
      createDynamicsCompressor: () => ({
        threshold: { setValueAtTime: vi.fn(), value: -1 },
        knee: { setValueAtTime: vi.fn(), value: 0 },
        ratio: { setValueAtTime: vi.fn(), value: 20 },
        attack: { setValueAtTime: vi.fn(), value: 0.001 },
        release: { setValueAtTime: vi.fn(), value: 0.05 },
        connect: vi.fn()
      }),
      createAnalyser: () => ({
        fftSize: 128,
        frequencyBinCount: 64,
        smoothingTimeConstant: 0.72,
        getByteFrequencyData: vi.fn(),
        connect: vi.fn()
      }),
      createChannelMerger: () => ({
        connect: vi.fn()
      }),
      createChannelSplitter: () => ({
        connect: vi.fn()
      }),
      createBufferSource: () => ({
        buffer: null,
        playbackRate: { setValueAtTime: vi.fn(), value: 1 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      }),
      createDelay: () => ({
        delayTime: { value: 0, setValueAtTime: vi.fn() },
        connect: vi.fn()
      }),
      createOscillator: () => ({
        type: 'sawtooth',
        frequency: { value: 1, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      }),
      createWaveShaper: () => ({
        curve: null,
        connect: vi.fn()
      }),
      createBiquadFilter: () => ({
        type: 'highpass',
        frequency: { value: 20, setValueAtTime: vi.fn() },
        Q: { value: 0.7, setValueAtTime: vi.fn() },
        gain: { value: 0, setValueAtTime: vi.fn() },
        connect: vi.fn()
      }),
      sampleRate: 44100,
      createBuffer: (_channels: number, length: number, _sampleRate: number) => ({
        length,
        duration: length / 44100,
        getChannelData: () => new Float32Array(length)
      }),
      decodeAudioData: vi.fn(async () => ({ duration: 1, length: 44100 })),
      setSinkId: vi.fn().mockResolvedValue(undefined),
      state: 'running',
      currentTime: 0,
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined)
    }));

    vi.stubGlobal('window', {
      AudioContext: mockAudioContext,
      webkitAudioContext: mockAudioContext,
      setTimeout: (fn: (...args: any[]) => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: any) => clearTimeout(id)
    });

    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn(async () => mockDevices),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
    });

    // Stems reais usam URLs relativas (./stems/...) que só existem no navegador;
    // o teste responde com um ArrayBuffer vazio em vez de tocar a rede.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }))
    );

    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    engine = new WebAudioEngine();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.clearAllTimers();
  });

  it('inicia com integridade saudável (healthy)', () => {
    const state = engine.getState();
    expect(state.routeHealth).toBe('healthy');
    expect(state.routeLossReason).toBeNull();
  });

  it('detecta desconexão física e interrompe a reprodução imediatamente a 0ms', async () => {
    // 1. Simula seleção da XR18 como interface ativa de palco
    await engine.detectAudioDevices();
    await engine.setAudioOutputDevice('xr18-usb-interface');

    expect(engine.getState().selectedAudioDeviceId).toBe('xr18-usb-interface');
    expect(engine.getState().routeHealth).toBe('healthy');

    // 2. Simula desconexão física do cabo USB (XR18 desaparece dos dispositivos do SO)
    mockDevices = [
      {
        deviceId: 'default',
        kind: 'audiooutput',
        label: 'Alto-falantes do Laptop (Realtek Audio)',
        groupId: 'group-1',
        toJSON: () => ({})
      } as MediaDeviceInfo
    ];

    // 3. Executa verificação imediata (0 ms) acionada pelo devicechange
    await engine.checkImmediateLossAndInterrupt();

    const stateAfterLoss = engine.getState();
    expect(stateAfterLoss.routeHealth).toBe('lost');
    expect(stateAfterLoss.routeLossReason).toContain('desconectada fisicamente');
  });

  it('bloqueia o comando play() quando a rota está em estado lost ou reconnected', async () => {
    const song = DemoWorshipSongs.getPresetSongs()[0]!;
    await engine.loadSong(song);

    // Força estado lost na rota
    await engine.detectAudioDevices();
    await engine.setAudioOutputDevice('xr18-usb-interface');
    mockDevices = [];
    await engine.checkImmediateLossAndInterrupt();

    expect(engine.getState().routeHealth).toBe('lost');

    // Tenta iniciar o playback enquanto a rota está perdida
    engine.play();
    expect(engine.getState().isPlaying).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Rota de áudio em estado 'lost'"));

    // Simula que a interface foi reconectada fisicamente
    mockDevices = [
      {
        deviceId: 'xr18-usb-interface',
        kind: 'audiooutput',
        label: 'Behringer X-AIR XR18 USB ASIO (18ch)',
        groupId: 'group-2',
        toJSON: () => ({})
      } as MediaDeviceInfo
    ];
    await engine.evaluateDeviceChange();

    expect(engine.getState().routeHealth).toBe('reconnected');

    // Tenta iniciar sem confirmação explícita do operador
    engine.play();
    expect(engine.getState().isPlaying).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Rota de áudio em estado 'reconnected'"));

    // Após confirmação explícita do operador
    const recovered = await engine.confirmRouteRecovery();
    expect(recovered).toBe(true);
    expect(engine.getState().routeHealth).toBe('healthy');
  });

  describe('Telemetria desacoplada do React (medidores x estado de transporte)', () => {
    let frames: FrameRequestCallback[];
    const runFrame = () => frames.shift()?.(0);

    beforeEach(() => {
      frames = [];
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    it('o estado de transporte não carrega medidores; parado, o quadro de medidores é zero', async () => {
      await engine.loadSong(DemoWorshipSongs.getPresetSongs()[0]!);

      expect(engine.getState()).not.toHaveProperty('stemLevels');
      expect(engine.getState()).not.toHaveProperty('masterRta');

      const frame = engine.getMeterFrame();
      expect(Object.values(frame.stemLevels).every((v) => v === 0)).toBe(true);
      expect(frame.masterRta.peakL).toBe(0);
      expect(frame.masterRta.peakR).toBe(0);
    });

    it('emite medidores a cada quadro e estado só quando o tempo cruza 100 ms', async () => {
      await engine.loadSong(DemoWorshipSongs.getPresetSongs()[0]!);
      const ctx = (globalThis.window as unknown as { AudioContext: { mock: { results: { value: { currentTime: number } }[] } } })
        .AudioContext.mock.results[0]!.value;

      const onState = vi.fn();
      const onMeters = vi.fn();
      engine.subscribe(onState);
      engine.subscribeMeters(onMeters);

      engine.play();
      expect(engine.getState().isPlaying).toBe(true);
      onState.mockClear();
      onMeters.mockClear();

      ctx.currentTime = 0.02;
      runFrame();
      ctx.currentTime = 0.05;
      runFrame();
      expect(onMeters).toHaveBeenCalledTimes(2);
      expect(onState).not.toHaveBeenCalled();

      ctx.currentTime = 0.15;
      runFrame();
      expect(onMeters).toHaveBeenCalledTimes(3);
      expect(onState).toHaveBeenCalledTimes(1);

      // Parar emite estado e um quadro final para zerar os VUs
      engine.stop();
      expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ isPlaying: false }));
      expect(onMeters.mock.lastCall?.[0].masterRta.peakL).toBe(0);
    });
  });
});
