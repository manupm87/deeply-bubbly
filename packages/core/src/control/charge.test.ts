import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import {
  chargePower,
  fineTuneMultiplier,
  fineTuneNormalized,
  impulseMagnitude,
  impulseRangeForZone,
  pressureMultiplier,
  zoneRadius,
  type ImpulseParams,
} from './charge';

const t = createTuning();

const neutralImpulse = (over: Partial<ImpulseParams> = {}): number =>
  impulseMagnitude(
    { power: 1, dragDist: t.DRAG_NEUTRAL_PX, radius: t.RADIUS_BASE, stunned: false, externalMul: 1, ...over },
    t,
  );

describe('chargePower (§11.7.1)', () => {
  it('reaches exactly 1 at CHARGE_FULL_MS', () => {
    expect(chargePower(550, t)).toBe(1);
  });

  it('saturates at 1 beyond CHARGE_FULL_MS', () => {
    expect(chargePower(2500, t)).toBe(1);
    expect(chargePower(1e9, t)).toBe(1);
  });

  it('is exponential, not linear: charge(275) ≈ 0.406', () => {
    expect(chargePower(275, t)).toBeCloseTo(0.406, 3);
    // A linear curve would give 0.5; the ^1.30 curve is measurably below it.
    expect(chargePower(275, t)).toBeLessThan(0.5);
  });

  it('mastery window: 1 - charge(380) ≈ 0.38', () => {
    expect(1 - chargePower(380, t)).toBeCloseTo(0.38, 2);
    // The last MASTERY_WINDOW_MS carry that 38 %.
    expect(380 + t.MASTERY_WINDOW_MS).toBe(t.CHARGE_FULL_MS);
  });

  it('a lazy ~400 ms hold gives about 66 %', () => {
    expect(chargePower(400, t)).toBeCloseTo(0.66, 2);
  });

  it('is 0 at or below 0 ms and strictly increasing in between', () => {
    expect(chargePower(0, t)).toBe(0);
    expect(chargePower(-10, t)).toBe(0);
    expect(chargePower(Number.NaN, t)).toBe(0);
    for (let ms = 1; ms < 550; ms += 7) {
      expect(chargePower(ms + 1, t)).toBeGreaterThan(chargePower(ms, t));
    }
  });

  it('scales with CHARGE_FULL_MS (accessibility slow charge)', () => {
    const slow = createTuning({ CHARGE_FULL_MS: 880 });
    expect(chargePower(880, slow)).toBe(1);
    expect(chargePower(440, slow)).toBeCloseTo(chargePower(275, t), 12);
  });
});

describe('fine tune (§11.4)', () => {
  it('is neutral at DRAG_NEUTRAL_PX', () => {
    expect(fineTuneNormalized(45, t)).toBe(0);
    expect(fineTuneMultiplier(45, t)).toBe(1);
  });

  it('is ∓15 % at 0 px and at DRAG_MAX_PX', () => {
    expect(fineTuneMultiplier(0, t)).toBeCloseTo(0.85, 12);
    expect(fineTuneMultiplier(90, t)).toBeCloseTo(1.15, 12);
    expect(fineTuneNormalized(0, t)).toBe(-1);
    expect(fineTuneNormalized(90, t)).toBe(1);
  });

  it('clamps beyond the ends and for negative input', () => {
    expect(fineTuneMultiplier(400, t)).toBeCloseTo(1.15, 12);
    expect(fineTuneMultiplier(-30, t)).toBeCloseTo(0.85, 12);
    expect(fineTuneNormalized(1e6, t)).toBe(1);
    expect(fineTuneNormalized(-1e6, t)).toBe(-1);
  });

  it('matches the §11.4 closed form on the shipped constants', () => {
    for (let d = 0; d <= 90; d += 3) {
      expect(fineTuneMultiplier(d, t)).toBeCloseTo(1 + (d / 90 - 0.5) * 2 * 0.15, 12);
    }
  });

  it('is monotonically increasing and symmetric around the neutral point', () => {
    for (let d = 0; d < 90; d += 5) {
      expect(fineTuneNormalized(d + 5, t)).toBeGreaterThan(fineTuneNormalized(d, t));
    }
    expect(fineTuneNormalized(45 - 20, t)).toBeCloseTo(-fineTuneNormalized(45 + 20, t), 12);
  });

  it('honours a neutral point that is not the midpoint', () => {
    const skewed = createTuning({ DRAG_NEUTRAL_PX: 30, DRAG_MAX_PX: 90 });
    expect(fineTuneNormalized(30, skewed)).toBe(0);
    expect(fineTuneNormalized(0, skewed)).toBe(-1);
    expect(fineTuneNormalized(90, skewed)).toBe(1);
    expect(fineTuneNormalized(60, skewed)).toBeCloseTo(0.5, 12);
  });
});

describe('impulseMagnitude (§11.4)', () => {
  it('is IMPULSE_MIN on a dry tap with neutral drag at base radius', () => {
    expect(neutralImpulse({ power: 0 })).toBeCloseTo(150, 12);
  });

  it('is IMPULSE_MAX at full charge with neutral drag at base radius', () => {
    expect(neutralImpulse()).toBeCloseTo(430, 12);
  });

  // §2.2 quotes the real range as "373 – 494 px/s". The upper end matches exactly; the lower end of a
  // strictly symmetric ±15 % window is 430 * 0.85 = 365.5, so the quoted 373 is a rounding slip in the
  // prose. The formula in §11.4 is normative and symmetric, so we assert that.
  it('spans the real fine-tune range (365.5 – 494.5 px/s)', () => {
    expect(impulseMagnitude({ power: 1, dragDist: 0, radius: 7, stunned: false, externalMul: 1 }, t)).toBeCloseTo(
      365.5,
      1,
    );
    expect(impulseMagnitude({ power: 1, dragDist: 90, radius: 7, stunned: false, externalMul: 1 }, t)).toBeCloseTo(
      494.5,
      1,
    );
  });

  it('§11.7.2: full charge at radius 3.9 ≥ 70 % charge at radius 7, within 2 %', () => {
    const deep = impulseMagnitude({ power: 1, dragDist: 45, radius: 3.9, stunned: false, externalMul: 1 }, t);
    const shallow = impulseMagnitude({ power: 0.7, dragDist: 45, radius: 7, stunned: false, externalMul: 1 }, t);
    expect(deep).toBeCloseTo(350, 0);
    expect(shallow).toBeCloseTo(346, 0);
    expect(deep).toBeGreaterThanOrEqual(shallow);
    expect(Math.abs(deep - shallow) / shallow).toBeLessThan(0.02);
  });

  it('applies the stun multiplier', () => {
    expect(neutralImpulse({ stunned: true })).toBeCloseTo(430 * 0.6, 12);
  });

  it('applies the external multiplier (cold jelly / sticky ceiling)', () => {
    expect(neutralImpulse({ externalMul: 0.75 })).toBeCloseTo(430 * 0.75, 12);
    expect(neutralImpulse({ externalMul: t.REST_STICKY_IMPULSE_MUL })).toBeCloseTo(430 * 0.6, 12);
  });

  it('multiplies all factors together', () => {
    const got = impulseMagnitude({ power: 1, dragDist: 90, radius: 3.85, stunned: true, externalMul: 0.75 }, t);
    const want = 430 * 1.15 * (3.85 / 7) ** 0.35 * 0.6 * 0.75;
    expect(got).toBeCloseTo(want, 10);
  });

  it('clamps power outside [0,1] instead of extrapolating', () => {
    expect(neutralImpulse({ power: -1 })).toBeCloseTo(150, 12);
    expect(neutralImpulse({ power: 5 })).toBeCloseTo(430, 12);
  });

  it('is monotonic in power and in radius', () => {
    for (let p = 0; p < 1; p += 0.05) {
      expect(neutralImpulse({ power: p + 0.05 })).toBeGreaterThan(neutralImpulse({ power: p }));
    }
    for (let r = 3; r < 7; r += 0.25) {
      expect(neutralImpulse({ radius: r + 0.25 })).toBeGreaterThan(neutralImpulse({ radius: r }));
    }
  });

  it('never produces NaN at radius 0', () => {
    expect(neutralImpulse({ radius: 0 })).toBe(0);
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

describe('impulseRangeForZone', () => {
  it('reproduces the §2.2 "impulso efectivo" table at neutral drag', () => {
    const table = [430, 418, 404, 387, 368, 349];
    for (let z = 0; z < table.length; z++) {
      // ±1 px/s: the GDD table is rounded to the unit (Z3 computes to 404.5).
      expect(Math.abs(impulseRangeForZone(z as 0, t).neutral - (table[z] as number))).toBeLessThanOrEqual(1);
    }
  });

  it('brackets the neutral value by exactly ±DRAG_FINE_TUNE', () => {
    for (let z = 0; z < 6; z++) {
      const r = impulseRangeForZone(z as 0, t);
      expect(r.min).toBeLessThan(r.neutral);
      expect(r.max).toBeGreaterThan(r.neutral);
      expect(r.min).toBeCloseTo(r.neutral * 0.85, 10);
      expect(r.max).toBeCloseTo(r.neutral * 1.15, 10);
    }
  });

  it('decreases monotonically with depth', () => {
    for (let z = 0; z < 5; z++) {
      expect(impulseRangeForZone((z + 1) as 0, t).neutral).toBeLessThan(impulseRangeForZone(z as 0, t).neutral);
    }
  });
});
