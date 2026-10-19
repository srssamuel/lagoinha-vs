import { describe, it, expect } from 'vitest';
import { MixerBusService } from '../../../src/application/services/MixerBusService';
import { TrackStem } from '../../../src/domain/entities/TrackStem';

describe('MixerBusService', () => {
  it('correctly handles Solo: only soloed stems are audible, others are muted', () => {
    const stems = [
      new TrackStem({ id: 's1', name: 'Click', type: 'click', volume: 0.8, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's2', name: 'Drums', type: 'drums', volume: 0.8, pan: 0, isMuted: false, isSolo: true }),
      new TrackStem({ id: 's3', name: 'Bass', type: 'bass', volume: 0.8, pan: 0, isMuted: false, isSolo: false }),
    ];

    const evaluations = MixerBusService.evaluateAllStems(stems, 'STEREO_FULL');
    const drumsEval = evaluations.find((e) => e.stemId === 's2');
    const bassEval = evaluations.find((e) => e.stemId === 's3');

    expect(drumsEval?.isAudible).toBe(true);
    expect(bassEval?.isAudible).toBe(false);
  });

  it('guarantees zero right gain for click and guide in SPLIT_IEM_PA', () => {
    const stems = [
      new TrackStem({ id: 's1', name: 'Click', type: 'click', volume: 1.0, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's2', name: 'Guide', type: 'guide', volume: 1.0, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's3', name: 'Keys', type: 'keys', volume: 1.0, pan: 0, isMuted: false, isSolo: false }),
    ];

    const evaluations = MixerBusService.evaluateAllStems(stems, 'SPLIT_IEM_PA');
    const clickEval = evaluations.find((e) => e.stemId === 's1')!;
    const guideEval = evaluations.find((e) => e.stemId === 's2')!;
    const keysEval = evaluations.find((e) => e.stemId === 's3')!;

    expect(clickEval.gains.rightGain).toBe(0.0);
    expect(guideEval.gains.rightGain).toBe(0.0);
    expect(keysEval.gains.rightGain).toBe(1.0);
  });

  it('silences all instrument stems when Solo Click (Live Rescue) is engaged', () => {
    const stems = [
      new TrackStem({ id: 's1', name: 'Click', type: 'click', volume: 1.0, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's2', name: 'Guide', type: 'guide', volume: 1.0, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's3', name: 'Drums', type: 'drums', volume: 0.9, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's4', name: 'Guitars', type: 'guitars', volume: 0.8, pan: 0, isMuted: false, isSolo: false }),
    ];

    const evaluations = MixerBusService.evaluateAllStems(stems, 'SPLIT_IEM_PA', true);
    const clickEval = evaluations.find((e) => e.stemId === 's1')!;
    const drumsEval = evaluations.find((e) => e.stemId === 's3')!;
    const guitarsEval = evaluations.find((e) => e.stemId === 's4')!;

    expect(clickEval.isAudible).toBe(true);
    expect(drumsEval.isAudible).toBe(false);
    expect(guitarsEval.isAudible).toBe(false);
  });

  it('guarantees complete isolation in MULTI_4CH_DISCRETE mode for Leandro Machado specification', () => {
    const stems = [
      new TrackStem({ id: 's1', name: 'Click', type: 'click', volume: 0.95, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's2', name: 'Guide', type: 'guide', volume: 0.90, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's3', name: 'Drums', type: 'drums', volume: 1.0, pan: 0, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's4', name: 'Guitars', type: 'guitars', volume: 0.8, pan: -0.5, isMuted: false, isSolo: false }),
      new TrackStem({ id: 's5', name: 'Keys', type: 'keys', volume: 0.8, pan: 0.5, isMuted: false, isSolo: false }),
    ];

    const evaluations = MixerBusService.evaluateAllStems(stems, 'MULTI_4CH_DISCRETE');
    const clickEval = evaluations.find((e) => e.stemId === 's1')!;
    const guideEval = evaluations.find((e) => e.stemId === 's2')!;
    const drumsEval = evaluations.find((e) => e.stemId === 's3')!;
    const guitarsEval = evaluations.find((e) => e.stemId === 's4')!;

    // Ch 1 (VS L) & Ch 2 (VS R) devem ter ZERO Click e ZERO Guide
    expect(clickEval.gains.ch1_vsL).toBe(0.0);
    expect(clickEval.gains.ch2_vsR).toBe(0.0);
    expect(guideEval.gains.ch1_vsL).toBe(0.0);
    expect(guideEval.gains.ch2_vsR).toBe(0.0);

    // Ch 3 exclusivo para Click
    expect(clickEval.gains.ch3_click).toBe(0.95);
    expect(guideEval.gains.ch3_click).toBe(0.0);
    expect(drumsEval.gains.ch3_click).toBe(0.0);
    expect(guitarsEval.gains.ch3_click).toBe(0.0);

    // Ch 4 exclusivo para Guide
    expect(clickEval.gains.ch4_guide).toBe(0.0);
    expect(guideEval.gains.ch4_guide).toBe(0.90);
    expect(drumsEval.gains.ch4_guide).toBe(0.0);
    expect(guitarsEval.gains.ch4_guide).toBe(0.0);

    // Canais 1 e 2 recebem a mixagem estéreo da banda para o PA FOH
    expect(drumsEval.gains.ch1_vsL).toBeGreaterThan(0.6);
    expect(drumsEval.gains.ch2_vsR).toBeGreaterThan(0.6);
    expect(guitarsEval.gains.ch1_vsL).toBeGreaterThan(guitarsEval.gains.ch2_vsR); // Panned left
  });
});
