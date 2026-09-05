import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, createTuning } from '../tuning';
import { completeImmersion, createRunState, mayOfferSecondBreath, mercyDensityMul, registerFailure } from './runState';

const t = createTuning();

describe('createRunState', () => {
  it('starts a clean run (§11.2)', () => {
    const run = createRunState(42, 'expedicion');
    expect(run).toEqual({
      seed: 42,
      mode: 'expedicion',
      immersionIndex: 0,
      lastBoyaId: null,
      lastStationIndex: -1,
      maxProgressY: 0,
      pearls: 0,
      shells: 0,
      failCountThisImmersion: 0,
      mercyLevel: 0,
      shieldAvailable: true,
      elapsedMs: 0,
    });
  });

  it('does not share state between runs', () => {
    const a = createRunState(1, 'expedicion');
    const b = createRunState(2, 'abismo');
    a.pearls = 5;
    expect(b.pearls).toBe(0);
    expect(b.mode).toBe('abismo');
  });
});

describe('registerFailure / mercy (§4.2.3, §11.7.8)', () => {
  it('raises mercy at MERCY_FAILS[0] and MERCY_FAILS[1] and nowhere else', () => {
    const run = createRunState(1, 'expedicion');
    const levels: number[] = [];
    for (let i = 0; i < 6; i++) {
      registerFailure(run, t);
      levels.push(run.mercyLevel);
      expect(run.failCountThisImmersion).toBe(i + 1);
    }
    expect(levels).toEqual([0, 1, 1, 2, 2, 2]); // MERCY_FAILS = [2, 4]
  });

  it('density is exactly 100 % / 80 % / 65 % and returns to 100 % on completion', () => {
    const run = createRunState(1, 'expedicion');
    expect(mercyDensityMul(run, t)).toBe(1);
    registerFailure(run, t);
    registerFailure(run, t);
    expect(run.mercyLevel).toBe(1);
    expect(mercyDensityMul(run, t)).toBe(t.MERCY_DENSITY_MUL[0]);
    expect(mercyDensityMul(run, t)).toBeCloseTo(0.8, 10);
    registerFailure(run, t);
    registerFailure(run, t);
    expect(run.mercyLevel).toBe(2);
    expect(mercyDensityMul(run, t)).toBeCloseTo(0.65, 10);
    completeImmersion(run, 0);
    expect(mercyDensityMul(run, t)).toBe(1);
  });

  it('is disabled in Abismo mode (fails are still counted)', () => {
    const run = createRunState(1, 'abismo');
    for (let i = 0; i < 5; i++) registerFailure(run, t);
    expect(run.failCountThisImmersion).toBe(5);
    expect(run.mercyLevel).toBe(0);
    expect(mercyDensityMul(run, t)).toBe(1);
  });

  it('follows tuning overrides rather than hard-coded thresholds', () => {
    const tt = createTuning({ MERCY_FAILS: [1, 3], MERCY_DENSITY_MUL: [0.5, 0.25] });
    const run = createRunState(1, 'expedicion');
    registerFailure(run, tt);
    expect(run.mercyLevel).toBe(1);
    expect(mercyDensityMul(run, tt)).toBe(0.5);
    registerFailure(run, tt);
    registerFailure(run, tt);
    expect(run.mercyLevel).toBe(2);
    expect(mercyDensityMul(run, tt)).toBe(0.25);
  });
});

describe('completeImmersion', () => {
  it('advances the immersion, checkpoints the station and clears mercy', () => {
    const run = createRunState(1, 'expedicion');
    run.lastBoyaId = 'boya-3';
    registerFailure(run, t);
    registerFailure(run, t);
    run.pearls = 12;
    run.maxProgressY = 4321;

    completeImmersion(run, 0);

    expect(run.immersionIndex).toBe(1);
    expect(run.lastStationIndex).toBe(0);
    expect(run.failCountThisImmersion).toBe(0);
    expect(run.mercyLevel).toBe(0);
    expect(run.lastBoyaId).toBeNull();
    // Progress and economy survive.
    expect(run.pearls).toBe(12);
    expect(run.maxProgressY).toBe(4321);

    completeImmersion(run, 1);
    expect(run.immersionIndex).toBe(2);
    expect(run.lastStationIndex).toBe(1);
  });
});

describe('mayOfferSecondBreath (§6.5, §11.7.8)', () => {
  it('only from AD_OFFER_MIN_FAILS, which is strictly after the first mercy level', () => {
    expect(DEFAULT_TUNING.AD_OFFER_MIN_FAILS).toBeGreaterThan(DEFAULT_TUNING.MERCY_FAILS[0]);
    const run = createRunState(1, 'expedicion');
    for (let i = 1; i < t.AD_OFFER_MIN_FAILS; i++) {
      registerFailure(run, t);
      expect(mayOfferSecondBreath(run, t)).toBe(false);
      expect(run.mercyLevel).toBeGreaterThanOrEqual(i >= t.MERCY_FAILS[0] ? 1 : 0);
    }
    registerFailure(run, t);
    expect(run.failCountThisImmersion).toBe(t.AD_OFFER_MIN_FAILS);
    expect(mayOfferSecondBreath(run, t)).toBe(true);
    // Mercy level 2 is already in place when the first offer becomes legal.
    expect(run.mercyLevel).toBe(2);
    completeImmersion(run, 0);
    expect(mayOfferSecondBreath(run, t)).toBe(false);
  });
});
