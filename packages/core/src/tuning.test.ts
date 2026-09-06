import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, createTuning, terminalRise, withCalmDive, withSlowCharge } from './tuning';

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
  it('"Buceo tranquilo" widens rest, resaca grace and pressure drain, and nothing else (§8)', () => {
    const base = createTuning();
    const t = withCalmDive(base);
    expect(t.REST_MAX_MS.posadero).toBe(6000); // §2.3: "en Buceo tranquilo el temporizador es de 6,0 s"
    expect(t.REST_MAX_MS.impaciente).toBe(2400);
    expect(t.REST_MAX_MS.pegajosa).toBe(1200);
    expect(t.RESACA_GRACE_MS).toBeCloseTo(2400, 9);
    expect(t.PRESSURE_DRAIN_S).toBeCloseTo(35, 9);
    // Everything else is the same dive: same charge, same impulse, same camera.
    expect(t.CHARGE_FULL_MS).toBe(base.CHARGE_FULL_MS);
    expect(t.IMPULSE_MAX).toBe(base.IMPULSE_MAX);
    expect(t.ZONE_AIR_MAX).toEqual(base.ZONE_AIR_MAX);
    // Non-destructive: the tuning it was derived from is untouched.
    expect(base.REST_MAX_MS.posadero).toBe(3000);
    expect(base.RESACA_GRACE_MS).toBe(1600);
  });
  it('the two accessibility transforms compose in either order (§8)', () => {
    const a = withCalmDive(withSlowCharge(createTuning()));
    const b = withSlowCharge(withCalmDive(createTuning()));
    expect(a).toEqual(b);
  });
  it('MERCY fires before any ad offer (§11.7.8)', () => {
    expect(DEFAULT_TUNING.AD_OFFER_MIN_FAILS).toBeGreaterThan(DEFAULT_TUNING.MERCY_FAILS[0]);
  });
});
