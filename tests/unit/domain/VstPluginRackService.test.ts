import { describe, it, expect } from 'vitest';
import { TrackStem } from '../../../src/domain/entities/TrackStem';
import { VstPluginRackService } from '../../../src/domain/services/VstPluginRackService';

describe('VstPluginRackService — DSP Channel Strip & Plugin Boutique Free FX Presets', () => {
  it('initializes default neutral DSP plugin settings on a TrackStem', () => {
    const stem = new TrackStem({
      id: 'violao',
      name: 'Violão',
      type: 'violao',
      volume: 1.0,
      pan: 0,
      isMuted: false,
      isSolo: false
    });

    expect(stem.dsp.highPassHz).toBe(20);
    expect(stem.dsp.eqLowDb).toBe(0);
    expect(stem.dsp.eqMidDb).toBe(0);
    expect(stem.dsp.eqHighDb).toBe(0);
    expect(stem.dsp.driveAmount).toBe(0);
    expect(stem.dsp.compressorEnabled).toBe(false);
  });

  it('applies Smart Stem Auto-Fix (De-Bleed & Polish) tailored to Violão, Guitarra, Bass and Drums', () => {
    const stems = [
      new TrackStem({ id: '1', name: 'Violão', type: 'violao', volume: 1, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: '2', name: 'Guitarra', type: 'guitars', volume: 1, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: '3', name: 'Baixo', type: 'bass', volume: 1, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: '4', name: 'Click', type: 'click', volume: 0.85, pan: -1, isMuted: false, isSolo: false })
    ];

    VstPluginRackService.applySmartAutoFixAll(stems);

    // Violão recebe High-Pass cirúrgico (remove vazamento de grave < 105Hz) e reforço de brilho agudo (Air)
    expect(stems[0]!.dsp.highPassHz).toBeGreaterThanOrEqual(95);
    expect(stems[0]!.dsp.eqHighDb).toBeGreaterThan(2.0);
    expect(stems[0]!.dsp.compressorEnabled).toBe(true);
    expect(stems[0]!.dsp.presetName).toContain('TDR Nova');

    // Guitarra recebe Tube Saturation suave e foco nos médios
    expect(stems[1]!.dsp.highPassHz).toBeGreaterThanOrEqual(85);
    expect(stems[1]!.dsp.eqMidDb).toBeGreaterThan(1.5);
    expect(stems[1]!.dsp.driveAmount).toBeGreaterThan(0.1);

    // Baixo recebe reforço de sub-grave e compressão OTT/Optical
    expect(stems[2]!.dsp.eqLowDb).toBeGreaterThan(2.0);
    expect(stems[2]!.dsp.compressorEnabled).toBe(true);

    // Click permanece neutro para precisão de clock
    expect(stems[3]!.dsp.eqLowDb).toBe(0);
    expect(stems[3]!.dsp.driveAmount).toBe(0);
  });

  it('generates a soft-clipping transfer curve for tube saturation without NaN or clipping above 1.0', () => {
    const curve = VstPluginRackService.createTubeSaturationCurve(0.35, 256);
    expect(curve.length).toBe(256);
    // Extremos limitados em [-1, 1] e centro em ~0
    expect(Math.abs(curve[128]!)).toBeLessThan(0.05);
    expect(curve[0]!).toBeGreaterThanOrEqual(-1.0);
    expect(curve[255]!).toBeLessThanOrEqual(1.0);
  });
});
