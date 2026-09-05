import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, createTuning, terminalRise, withSlowCharge } from './tuning';

describe('tuning', () => {
  it('TERMINAL_RISE is the identity BUOYANCY / DAMPING_Y ≈ 167 (§11.7.11)', () => {
    expect(terminalRise(DEFAULT_TUNING)).toBeCloseTo(166.67, 1);
  });
  it('createTuning deep-copies and applies overrides', () => {
    const t = createTuning({ BUOYANCY: 120 });
    expect(t.BUOYANCY).toBe(120);
    expect(DEFAULT_TUNING.BUOYANCY).toBe(100);
    t.ZONE_AIR_MAX = [1, 1, 1, 1, 1, 1];
    expect(DEFAULT_TUNING.ZONE_AIR_MAX[0]).toBe(8);
  });
  it('slow charge scales every gesture time by the same factor (§8)', () => {
    const t = withSlowCharge(createTuning());
    expect(t.CHARGE_FULL_MS).toBe(880);
    expect(t.OVERCHARGE_MS).toBe(1440);
    expect(t.OVERCHARGE_MS_RESTING).toBe(2880);
    expect(t.OVERCHARGE_DRAIN_MS).toBe(800);
    expect(t.AUTO_RELEASE_MS).toBe(4000);
  });
  it('MERCY fires before any ad offer (§11.7.8)', () => {
    expect(DEFAULT_TUNING.AD_OFFER_MIN_FAILS).toBeGreaterThan(DEFAULT_TUNING.MERCY_FAILS[0]);
  });
});
