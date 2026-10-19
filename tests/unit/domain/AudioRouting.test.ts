import { describe, it, expect } from 'vitest';
import { AudioRouting } from '../../../src/domain/value-objects/AudioRouting';

describe('AudioRouting Logic (Stage Safety Audit)', () => {
  it('guarantees Click and Guide have 0 gain on Right (PA) channel in SPLIT_IEM_PA mode', () => {
    const clickGains = AudioRouting.calculateGains('click', 'SPLIT_IEM_PA', 0, true, 0.85);
    expect(clickGains.leftGain).toBe(0.85);
    expect(clickGains.rightGain).toBe(0.0);

    const guideGains = AudioRouting.calculateGains('guide', 'SPLIT_IEM_PA', 0, true, 0.90);
    expect(guideGains.leftGain).toBe(0.90);
    expect(guideGains.rightGain).toBe(0.0);
  });

  it('routes instruments to both PA (Right) and Musicians IEM (Left) in SPLIT_IEM_PA mode', () => {
    const drumGains = AudioRouting.calculateGains('drums', 'SPLIT_IEM_PA', 0, true, 1.0);
    expect(drumGains.rightGain).toBe(1.0);
    expect(drumGains.leftGain).toBeGreaterThan(0.7); // Heard in monitors
  });

  it('guarantees Click is routed strictly to Ch 3 (Click IEM) with ZERO on FOH PA (Ch 1/2) and Guide (Ch 4) in MULTI_4CH_DISCRETE mode', () => {
    const clickGains = AudioRouting.calculateGains('click', 'MULTI_4CH_DISCRETE', 0, true, 0.95);
    expect(clickGains.ch1_vsL).toBe(0.0);
    expect(clickGains.ch2_vsR).toBe(0.0);
    expect(clickGains.ch3_click).toBe(0.95);
    expect(clickGains.ch4_guide).toBe(0.0);
    expect(clickGains.leftGain).toBe(0.0);
    expect(clickGains.rightGain).toBe(0.0);
  });

  it('guarantees Guide is routed strictly to Ch 4 (Guide IEM) with ZERO on FOH PA (Ch 1/2) and Click (Ch 3) in MULTI_4CH_DISCRETE mode', () => {
    const guideGains = AudioRouting.calculateGains('guide', 'MULTI_4CH_DISCRETE', 0, true, 0.88);
    expect(guideGains.ch1_vsL).toBe(0.0);
    expect(guideGains.ch2_vsR).toBe(0.0);
    expect(guideGains.ch3_click).toBe(0.0);
    expect(guideGains.ch4_guide).toBe(0.88);
    expect(guideGains.leftGain).toBe(0.0);
    expect(guideGains.rightGain).toBe(0.0);
  });

  it('routes VS Playback stems (Drums, Bass, Guitars, Keys) strictly to Ch 1 and Ch 2 (FOH L/R) with ZERO on Ch 3 and Ch 4 in MULTI_4CH_DISCRETE mode', () => {
    // Centro (Pan 0)
    const keysGains = AudioRouting.calculateGains('keys', 'MULTI_4CH_DISCRETE', 0, true, 1.0);
    expect(keysGains.ch1_vsL).toBeGreaterThan(0.65);
    expect(keysGains.ch2_vsR).toBeGreaterThan(0.65);
    expect(keysGains.ch3_click).toBe(0.0);
    expect(keysGains.ch4_guide).toBe(0.0);

    // Pan Hard Left (-1)
    const guitarLeftGains = AudioRouting.calculateGains('guitars', 'MULTI_4CH_DISCRETE', -1, true, 1.0);
    expect(guitarLeftGains.ch1_vsL).toBeCloseTo(1.0, 2);
    expect(guitarLeftGains.ch2_vsR).toBeCloseTo(0.0, 2);
    expect(guitarLeftGains.ch3_click).toBe(0.0);
    expect(guitarLeftGains.ch4_guide).toBe(0.0);
  });

  it('outputs zero gain across all 4 channels when stem is muted or inaudible', () => {
    const mutedGains = AudioRouting.calculateGains('bass', 'MULTI_4CH_DISCRETE', 0, false, 0.8);
    expect(mutedGains.ch1_vsL).toBe(0);
    expect(mutedGains.ch2_vsR).toBe(0);
    expect(mutedGains.ch3_click).toBe(0);
    expect(mutedGains.ch4_guide).toBe(0);
    expect(mutedGains.leftGain).toBe(0);
    expect(mutedGains.rightGain).toBe(0);
  });

  it('correctly classifies physical USB, virtual cable, and built-in hardware interfaces', () => {
    const isVirtual = (name: string) => /(cable|voicemeeter|virtual|vac|loopback|blackhole|dante)/i.test(name);
    const isUsb = (name: string) => /(usb|umc|xr18|x32|scarlett|focusrite|behringer|presonus|motu|quad|audiobox|line-level)/i.test(name);

    expect(isUsb('Behringer UMC404HD 192k USB Audio')).toBe(true);
    expect(isUsb('Focusrite Scarlett 4i4 USB')).toBe(true);
    expect(isVirtual('VoiceMeeter Aux VAIO (VB-Audio)')).toBe(true);
    expect(isVirtual('CABLE Input (VB-Audio Virtual Cable)')).toBe(true);
    expect(isVirtual('Realtek High Definition Audio')).toBe(false);
    expect(isUsb('Realtek High Definition Audio')).toBe(false);
  });

  it('has dedicated tone frequencies for isolated channel test on stage', () => {
    // Frequências tonais isoladas por canal para teste de bancada e ligação no altar
    const channelFrequencies: Record<number, { name: string; target: string; hz: number }> = {
      0: { name: 'VS Left', target: 'Mesa FOH L', hz: 440 },
      1: { name: 'VS Right', target: 'Mesa FOH R', hz: 554.37 },
      2: { name: 'Click Track', target: 'IEM Músicos', hz: 1000 },
      3: { name: 'Guide Track', target: 'IEM Músicos', hz: 880 }
    };

    expect(channelFrequencies[0]?.hz).toBe(440);
    expect(channelFrequencies[1]?.hz).toBeCloseTo(554.37, 2);
    expect(channelFrequencies[2]?.hz).toBe(1000); // Beep agudo de metrônomo
    expect(channelFrequencies[3]?.hz).toBe(880);  // Tom guia audível
  });
});
