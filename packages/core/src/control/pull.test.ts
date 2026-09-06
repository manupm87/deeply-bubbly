import { describe, expect, it } from 'vitest';
import { createTuning, withLongSling } from '../tuning';
import {
  impulseForZone,
  impulseMagnitude,
  isCancelZone,
  pressureMultiplier,
  pullPower,
  zoneRadius,
  type ImpulseParams,
} from './pull';

const t = createTuning();

const fullImpulse = (over: Partial<ImpulseParams> = {}): number =>
  impulseMagnitude({ power: 1, radius: t.RADIUS_BASE, stunned: false, externalMul: 1, ...over }, t);

describe('pullPower (§11.7.1, rewritten for DECISIONS-v1.2 D2)', () => {
  it('p(PULL_MAX_PX) = 1, p(PULL_MAX_PX / 2) = 0.5, p(0) = 0', () => {
    expect(pullPower(70, t)).toBe(1);
    expect(pullPower(35, t)).toBe(0.5);
    expect(pullPower(0, t)).toBe(0);
  });

  it('is LINEAR: the player reads the shot off the length of their own drag', () => {
    for (let d = 0; d <= t.PULL_MAX_PX; d += 3.5) {
      expect(pullPower(d, t)).toBeCloseTo(d / t.PULL_MAX_PX, 12);
    }
  });

  it('saturates at 1 past a full pull and never goes negative', () => {
    expect(pullPower(140, t)).toBe(1);
    expect(pullPower(1e9, t)).toBe(1);
    expect(pullPower(-10, t)).toBe(0);
    expect(pullPower(Number.NaN, t)).toBe(0);
  });

  it('is strictly increasing between the ends', () => {
    for (let d = 0; d < t.PULL_MAX_PX; d += 2) {
      expect(pullPower(d + 2, t)).toBeGreaterThan(pullPower(d, t));
    }
  });

  it('the long slingshot spreads the same power over LONG_SLING_MUL times the travel (§8)', () => {
    const long = withLongSling(t);
    expect(long.PULL_MAX_PX).toBeCloseTo(t.PULL_MAX_PX * t.LONG_SLING_MUL, 12);
    expect(pullPower(t.PULL_MAX_PX, long)).toBeCloseTo(1 / t.LONG_SLING_MUL, 12);
    expect(pullPower(long.PULL_MAX_PX, long)).toBe(1);
    // Same shot, more room to aim it: nothing else about the gesture moves.
    expect(long.PULL_CANCEL_PX).toBe(t.PULL_CANCEL_PX);
    expect(long.AIM_MAX_MS).toBe(t.AIM_MAX_MS);
    expect(long.IMPULSE_MAX).toBe(t.IMPULSE_MAX);
  });
});

describe('isCancelZone (D2: "devolver el pájaro a la horquilla")', () => {
  it('is true strictly inside PULL_CANCEL_PX and false from it on', () => {
    expect(isCancelZone(0, t)).toBe(true);
    expect(isCancelZone(11.99, t)).toBe(true);
    expect(isCancelZone(t.PULL_CANCEL_PX, t)).toBe(false);
    expect(isCancelZone(70, t)).toBe(false);
  });

  it('treats a NaN pull as "no shot", never as a launch', () => {
    expect(isCancelZone(Number.NaN, t)).toBe(true);
  });
});

describe('impulseMagnitude (§11.4, D4 numbers)', () => {
  it('is IMPULSE_MIN at zero power and IMPULSE_MAX at full pull, at base radius', () => {
    expect(fullImpulse({ power: 0 })).toBeCloseTo(t.IMPULSE_MIN, 12);
    expect(fullImpulse()).toBeCloseTo(t.IMPULSE_MAX, 12);
    expect(t.IMPULSE_MIN).toBe(90);
    expect(t.IMPULSE_MAX).toBe(280);
  });

  it('is linear in power between the two ends: nothing but the pull decides the shot', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      expect(fullImpulse({ power: p })).toBeCloseTo(t.IMPULSE_MIN + p * (t.IMPULSE_MAX - t.IMPULSE_MIN), 9);
    }
  });

  it('§11.7.2: full power at radius 3.85 ≥ 70 % power at radius 7, within 2 %', () => {
    const deep = impulseMagnitude({ power: 1, radius: 3.85, stunned: false, externalMul: 1 }, t);
    const shallow = impulseMagnitude({ power: 0.7, radius: 7, stunned: false, externalMul: 1 }, t);
    expect(deep).toBeGreaterThanOrEqual(shallow);
    expect(Math.abs(deep - shallow) / shallow).toBeLessThan(0.02);
  });

  it('applies the stun multiplier', () => {
    expect(fullImpulse({ stunned: true })).toBeCloseTo(t.IMPULSE_MAX * t.STUN_IMPULSE_MUL, 12);
  });

  it('applies the external multiplier (cold jelly / sticky ceiling)', () => {
    expect(fullImpulse({ externalMul: 0.75 })).toBeCloseTo(t.IMPULSE_MAX * 0.75, 12);
    expect(fullImpulse({ externalMul: t.REST_STICKY_IMPULSE_MUL })).toBeCloseTo(t.IMPULSE_MAX * 0.6, 12);
  });

  it('multiplies all factors together', () => {
    const got = impulseMagnitude({ power: 1, radius: 3.85, stunned: true, externalMul: 0.75 }, t);
    expect(got).toBeCloseTo(t.IMPULSE_MAX * (3.85 / 7) ** t.IMPULSE_RADIUS_EXP * 0.6 * 0.75, 10);
  });

  it('clamps power outside [0,1] instead of extrapolating', () => {
    expect(fullImpulse({ power: -1 })).toBeCloseTo(t.IMPULSE_MIN, 12);
    expect(fullImpulse({ power: 5 })).toBeCloseTo(t.IMPULSE_MAX, 12);
  });

  it('is monotonic in power and in radius', () => {
    for (let p = 0; p < 1; p += 0.05) {
      expect(fullImpulse({ power: p + 0.05 })).toBeGreaterThan(fullImpulse({ power: p }));
    }
    for (let r = 3; r < 7; r += 0.25) {
      expect(fullImpulse({ radius: r + 0.25 })).toBeGreaterThan(fullImpulse({ radius: r }));
    }
  });

  it('never produces NaN at radius 0', () => {
    expect(fullImpulse({ radius: 0 })).toBe(0);
  });
});

describe('pressureMultiplier / zoneRadius', () => {
  it('is exactly 1 at the base radius', () => {
    expect(pressureMultiplier(t.RADIUS_BASE, t)).toBe(1);
  });

  it('follows the §2.6 radius table', () => {
    const radii = [7.0, 6.44, 5.88, 5.18, 4.48, 3.85];
    for (let z = 0; z < radii.length; z++) {
      expect(zoneRadius(z as 0, t)).toBeCloseTo(radii[z] as number, 6);
    }
  });
});

describe('impulseForZone', () => {
  it('is IMPULSE_MAX in Zone 1 and decreases monotonically with depth (§2.2, §2.6)', () => {
    expect(impulseForZone(0, t)).toBeCloseTo(t.IMPULSE_MAX, 12);
    for (let z = 0; z < 5; z++) {
      expect(impulseForZone((z + 1) as 0, t)).toBeLessThan(impulseForZone(z as 0, t));
    }
  });

  it('is exactly the full-pull impulse at that zone radius: one number, no bracket', () => {
    for (let z = 0; z < 6; z++) {
      const zone = z as 0;
      expect(impulseForZone(zone, t)).toBeCloseTo(
        impulseMagnitude({ power: 1, radius: zoneRadius(zone, t), stunned: false, externalMul: 1 }, t),
        12,
      );
    }
  });
});
