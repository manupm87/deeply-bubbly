import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, createTuning, terminalRise, withCalmDive, withLongSling } from './tuning';

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
  it('the long slingshot stretches the pull and nothing else (§8, DECISIONS-v1.2 D2)', () => {
    const base = createTuning();
    const t = withLongSling(base);
    expect(t.PULL_MAX_PX).toBe(105); // 70 × 1,5
    expect(t.PULL_CANCEL_PX).toBe(base.PULL_CANCEL_PX);
    expect(t.AIM_MAX_MS).toBe(base.AIM_MAX_MS);
    expect(t.AIM_CONE_DEG).toBe(base.AIM_CONE_DEG);
    expect(t.IMPULSE_MIN).toBe(base.IMPULSE_MIN);
    expect(t.IMPULSE_MAX).toBe(base.IMPULSE_MAX);
    expect(base.PULL_MAX_PX).toBe(70); // non-destructive
  });
  it('"Buceo tranquilo" widens rest, resaca grace and pressure drain, and nothing else (§8)', () => {
    const base = createTuning();
    const t = withCalmDive(base);
    expect(t.REST_MAX_MS.posadero).toBe(6000); // §2.3: "en Buceo tranquilo el temporizador es de 6,0 s"
    expect(t.REST_MAX_MS.impaciente).toBe(2400);
    expect(t.REST_MAX_MS.pegajosa).toBe(1200);
    expect(t.RESACA_GRACE_MS).toBeCloseTo(2400, 9);
    expect(t.PRESSURE_DRAIN_S).toBeCloseTo(35, 9);
    // Everything else is the same dive: same slingshot, same impulse, same camera.
    expect(t.PULL_MAX_PX).toBe(base.PULL_MAX_PX);
    expect(t.IMPULSE_MAX).toBe(base.IMPULSE_MAX);
    expect(t.ZONE_AIR_MAX).toEqual(base.ZONE_AIR_MAX);
    // Non-destructive: the tuning it was derived from is untouched.
    expect(base.REST_MAX_MS.posadero).toBe(3000);
    expect(base.RESACA_GRACE_MS).toBe(1600);
  });
  it('the two accessibility transforms compose in either order (§8)', () => {
    const a = withCalmDive(withLongSling(createTuning()));
    const b = withLongSling(withCalmDive(createTuning()));
    expect(a).toEqual(b);
  });

  it('the D1/D2 gesture constants ship at their DECISIONS-v1.2 values', () => {
    expect(DEFAULT_TUNING.PULL_MAX_PX).toBe(70);
    expect(DEFAULT_TUNING.PULL_CANCEL_PX).toBe(12);
    expect(DEFAULT_TUNING.AIM_MAX_MS).toBe(6000);
    expect(DEFAULT_TUNING.AIM_CONE_DEG).toBe(90);
    expect(DEFAULT_TUNING.AIR_LAUNCHES_MAX).toBe(1);
    expect(DEFAULT_TUNING.AIR_LAUNCH_COST).toBe(1);
    expect(DEFAULT_TUNING.LONG_SLING_MUL).toBe(1.5);
    // §2.1 "apuntar ancla": the number that keeps the one mid-air aim of a fall inside a screen.
    expect(DEFAULT_TUNING.AIM_BUOYANCY_MUL).toBe(0.35);
    // D1's floor is a consequence of the price, not a second constant: a shot costs more than it
    // leaves, so a Bur on her last pip can never buy one.
    expect(DEFAULT_TUNING.AIR_LAUNCH_COST).toBeGreaterThan(0);
  });
  it('MERCY fires before any ad offer (§11.7.8)', () => {
    expect(DEFAULT_TUNING.AD_OFFER_MIN_FAILS).toBeGreaterThan(DEFAULT_TUNING.MERCY_FAILS[0]);
  });
});
