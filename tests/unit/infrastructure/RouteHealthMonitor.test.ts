import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RouteHealthMonitor, RouteHealthHost } from '../../../src/infrastructure/audio/RouteHealthMonitor';

const device = (deviceId: string, label: string, kind: MediaDeviceKind = 'audiooutput') =>
  ({ deviceId, kind, label, groupId: `g-${deviceId}`, toJSON: () => ({}) }) as MediaDeviceInfo;

const LAPTOP = device('default', 'Alto-falantes do Laptop (Realtek Audio)');
const XR18 = device('xr18', 'Behringer X-AIR XR18 USB ASIO (18ch)');

describe('RouteHealthMonitor (ENG-02) — módulo extraído do WebAudioEngine', () => {
  let devices: MediaDeviceInfo[];
  let selected: string;
  let playing: boolean;
  let host: RouteHealthHost & { pause: ReturnType<typeof vi.fn>; notifyState: ReturnType<typeof vi.fn> };
  let monitor: RouteHealthMonitor;
  let deviceChangeHandler: (() => void) | null;

  beforeEach(() => {
    vi.useFakeTimers();
    devices = [LAPTOP, XR18];
    selected = 'xr18';
    playing = true;
    deviceChangeHandler = null;

    host = {
      getMaxChannelCount: () => 4,
      getSelectedDeviceId: () => selected,
      isPlaying: () => playing,
      pause: vi.fn(() => {
        playing = false;
      }),
      setAudioOutputDevice: vi.fn(async () => true),
      notifyState: vi.fn()
    };

    vi.stubGlobal('window', {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms)
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn(async () => devices),
        addEventListener: vi.fn((_type: string, handler: () => void) => {
          deviceChangeHandler = handler;
        })
      }
    });

    monitor = new RouteHealthMonitor(host);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('inicia saudável e sem bloquear o play', () => {
    expect(monitor.health).toBe('healthy');
    expect(monitor.lossReason).toBeNull();
    expect(monitor.blocksPlayback).toBe(false);
  });

  it('classifica interfaces USB/virtuais e usa a contagem de canais do host nas demais', async () => {
    devices = [LAPTOP, XR18, device('vb', 'CABLE Output (VB-Audio Virtual Cable)'), device('empty', '')];
    const found = await monitor.detectAudioDevices();

    expect(found.find((d) => d.deviceId === 'xr18')).toMatchObject({ isUsb: true, channelCountEstimate: 4 });
    expect(found.find((d) => d.deviceId === 'vb')).toMatchObject({ isVirtual: true, channelCountEstimate: 4 });
    expect(found.find((d) => d.deviceId === 'default')).toMatchObject({ isUsb: false, channelCountEstimate: 4 });
    expect(found.find((d) => d.deviceId === 'empty')?.label).toBe('Saída de Áudio 4');
    expect(monitor.availableDevices).toBe(found);
  });

  it('sem saídas enumeradas ou sem mediaDevices cai no dispositivo padrão', async () => {
    devices = [device('mic', 'Microfone', 'audioinput')];
    expect((await monitor.detectAudioDevices()).map((d) => d.deviceId)).toEqual(['default']);

    vi.stubGlobal('navigator', {});
    expect((await monitor.detectAudioDevices()).map((d) => d.deviceId)).toEqual(['default']);
  });

  it('desconexão física pausa na hora, marca lost e bloqueia o play', async () => {
    devices = [LAPTOP];
    await monitor.checkImmediateLossAndInterrupt();

    expect(host.pause).toHaveBeenCalledTimes(1);
    expect(monitor.health).toBe('lost');
    expect(monitor.lossReason).toContain('desconectada fisicamente');
    expect(monitor.blocksPlayback).toBe(true);
    expect(host.notifyState).toHaveBeenCalled();
  });

  it('com a saída padrão selecionada a perda imediata não dispara', async () => {
    selected = 'default';
    devices = [];
    await monitor.checkImmediateLossAndInterrupt();
    expect(monitor.health).toBe('healthy');
    expect(host.pause).not.toHaveBeenCalled();
  });

  it('lost -> reconnected só volta a healthy por confirmRouteRecovery do operador', async () => {
    devices = [LAPTOP];
    await monitor.evaluateDeviceChange();
    expect(monitor.health).toBe('lost');

    devices = [LAPTOP, XR18];
    await monitor.evaluateDeviceChange();
    expect(monitor.health).toBe('reconnected');
    expect(monitor.blocksPlayback).toBe(true);

    // Outra mudança irrelevante (webcam) não limpa o alerta sozinha
    devices = [LAPTOP, XR18, device('cam', 'Webcam', 'videoinput')];
    await monitor.evaluateDeviceChange();
    expect(monitor.health).toBe('reconnected');

    await expect(monitor.confirmRouteRecovery()).resolves.toBe(true);
    expect(host.setAudioOutputDevice).toHaveBeenCalledWith('xr18');
    expect(monitor.health).toBe('healthy');
    expect(monitor.lossReason).toBeNull();
    expect(monitor.blocksPlayback).toBe(false);
  });

  it('confirmRouteRecovery falha (e mantém o bloqueio) se o dispositivo não aceitar a saída', async () => {
    devices = [LAPTOP];
    await monitor.evaluateDeviceChange();
    host.setAudioOutputDevice = vi.fn(async () => false);

    await expect(monitor.confirmRouteRecovery()).resolves.toBe(false);
    expect(monitor.health).toBe('lost');
  });

  it('devicechange: perda imediata a 0 ms e reavaliação com debounce de 150 ms', async () => {
    monitor.listen();
    expect(deviceChangeHandler).not.toBeNull();

    devices = [LAPTOP];
    deviceChangeHandler!();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.health).toBe('lost');
    expect(host.pause).toHaveBeenCalledTimes(1);

    // Rajada de eventos reinicia o debounce: só uma reavaliação ao final
    devices = [LAPTOP, XR18];
    const evaluate = vi.spyOn(monitor, 'evaluateDeviceChange');
    deviceChangeHandler!();
    await vi.advanceTimersByTimeAsync(100);
    deviceChangeHandler!();
    await vi.advanceTimersByTimeAsync(100);
    expect(evaluate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(monitor.health).toBe('reconnected');
  });
});
