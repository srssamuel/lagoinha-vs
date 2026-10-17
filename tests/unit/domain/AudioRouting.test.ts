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

  it('outputs zero gain when stem is muted or inaudible', () => {
    const mutedGains = AudioRouting.calculateGains('bass', 'SPLIT_IEM_PA', 0, false, 0.8);
    expect(mutedGains.leftGain).toBe(0);
    expect(mutedGains.rightGain).toBe(0);
  });
});
