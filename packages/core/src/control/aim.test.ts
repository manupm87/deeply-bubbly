import { describe, expect, it } from 'vitest';
import { degToRad, vec } from '../math/vec';
import { createTuning } from '../tuning';
import { computeAim, launchVelocity } from './aim';

const t = createTuning();
const origin = vec(90, 200);
const CONE = degToRad(t.AIM_CONE_DEG); // 62° = 1.0821 rad
const DEADZONE = degToRad(t.AIM_DEADZONE_DEG); // 5° = 0.0873 rad

/** Pointer at `dist` px from the origin, `rawDeg` away from straight down (+ = right). */
const pointerAt = (rawDeg: number, dist = 100) =>
  vec(origin.x + Math.sin(degToRad(rawDeg)) * dist, origin.y + Math.cos(degToRad(rawDeg)) * dist);

describe('computeAim — validity gates (§2.1)', () => {
  it('keeps the last valid direction when the pointer is above the origin', () => {
    const r = computeAim(vec(140, 150), origin, 0.4, t);
    expect(r.valid).toBe(false);
    expect(r.theta).toBe(0.4);
  });

  it('aims straight down when the pointer is above the origin and there is no last valid', () => {
    const r = computeAim(vec(140, 150), origin, null, t);
    expect(r.valid).toBe(false);
    expect(r.theta).toBe(0);
  });

  it('treats exactly level with the origin (d.y === 0) as invalid — never launch sideways or up', () => {
    const r = computeAim(vec(origin.x + 60, origin.y), origin, 0.9, t);
    expect(r.valid).toBe(false);
    expect(r.theta).toBe(0.9);
  });

  it('never returns an upward direction: cos(theta) > 0 for every pointer position', () => {
    for (let dx = -400; dx <= 400; dx += 17) {
      for (let dy = -400; dy <= 400; dy += 17) {
        const r = computeAim(vec(origin.x + dx, origin.y + dy), origin, null, t);
        expect(Math.cos(r.theta)).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the last valid direction inside AIM_MIN_RADIUS (anti-jitter)', () => {
    const r = computeAim(vec(origin.x + 5, origin.y + 10), origin, -0.3, t); // |d| ≈ 11.2 < 18
    expect(r.valid).toBe(false);
    expect(r.theta).toBe(-0.3);
    expect(r.dragDist).toBeCloseTo(Math.hypot(5, 10), 12);
  });

  it('becomes valid exactly at AIM_MIN_RADIUS', () => {
    expect(computeAim(vec(origin.x, origin.y + 17.99), origin, null, t).valid).toBe(false);
    expect(computeAim(vec(origin.x, origin.y + 18), origin, null, t).valid).toBe(true);
  });

  it('reports dragDist as the true |d| regardless of validity', () => {
    expect(computeAim(vec(origin.x + 3, origin.y - 4), origin, null, t).dragDist).toBeCloseTo(5, 12);
    expect(computeAim(vec(origin.x + 30, origin.y + 40), origin, null, t).dragDist).toBeCloseTo(50, 12);
    expect(computeAim(origin, origin, null, t).dragDist).toBe(0);
  });
});

describe('computeAim — gain, cone and deadzone (§11.4)', () => {
  it('applies the 1.5 angular gain below the cone edge', () => {
    const r = computeAim(pointerAt(30), origin, null, t);
    expect(r.valid).toBe(true);
    expect(r.theta).toBeCloseTo(degToRad(45), 10);
  });

  it('is symmetric: +x is right, -x is left', () => {
    const right = computeAim(pointerAt(30), origin, null, t);
    const left = computeAim(pointerAt(-30), origin, null, t);
    expect(right.theta).toBeGreaterThan(0);
    expect(left.theta).toBeCloseTo(-right.theta, 12);
  });

  it('clamps to ±62° after the gain', () => {
    // ~41° raw already reaches the cone edge (the §2.1 rationale for the gain).
    expect(computeAim(pointerAt(41.33), origin, null, t).theta).toBeCloseTo(CONE, 3);
    expect(computeAim(pointerAt(60), origin, null, t).theta).toBeCloseTo(CONE, 12);
    expect(computeAim(pointerAt(-89.9), origin, null, t).theta).toBeCloseTo(-CONE, 12);
  });

  it('never exceeds the cone for any pointer position', () => {
    for (let dx = -500; dx <= 500; dx += 13) {
      for (let dy = 1; dy <= 500; dy += 13) {
        const r = computeAim(vec(origin.x + dx, origin.y + dy), origin, null, t);
        expect(Math.abs(r.theta)).toBeLessThanOrEqual(CONE + 1e-12);
      }
    }
  });

  it('snaps to straight down inside the ±5° deadzone', () => {
    // raw 3° * 1.5 = 4.5° < 5° → 0
    expect(computeAim(pointerAt(3), origin, null, t).theta).toBe(0);
    expect(computeAim(pointerAt(-3), origin, null, t).theta).toBe(0);
    expect(computeAim(pointerAt(0), origin, null, t).theta).toBe(0);
  });

  it('leaves the deadzone just above it', () => {
    // raw 4° * 1.5 = 6° ≥ 5° → kept
    const r = computeAim(pointerAt(4), origin, null, t);
    expect(r.theta).toBeCloseTo(degToRad(6), 10);
    expect(Math.abs(r.theta)).toBeGreaterThanOrEqual(DEADZONE);
  });

  it('marks a deadzone-snapped aim as valid (it is a real, commanded direction)', () => {
    expect(computeAim(pointerAt(2), origin, null, t).valid).toBe(true);
  });

  it('is measured from the FROZEN origin, not from the live bubble position', () => {
    const pointer = pointerAt(30);
    const a = computeAim(pointer, origin, null, t);
    const b = computeAim(pointer, vec(origin.x + 40, origin.y - 60), null, t);
    expect(a.theta).not.toBeCloseTo(b.theta, 3);
    // A still finger over an unchanged origin gives a perfectly stable angle.
    expect(computeAim(pointer, origin, null, t).theta).toBe(a.theta);
  });

  it('ignores lastAimValid whenever the pointer is valid', () => {
    const r = computeAim(pointerAt(30), origin, -1.0, t);
    expect(r.valid).toBe(true);
    expect(r.theta).toBeCloseTo(degToRad(45), 10);
  });

  it('is monotonic in the raw angle across the usable range', () => {
    let prev = computeAim(pointerAt(-41), origin, null, t).theta;
    for (let deg = -40; deg <= 41; deg += 1) {
      const th = computeAim(pointerAt(deg), origin, null, t).theta;
      expect(th).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = th;
    }
  });

  it('does not depend on drag distance, only on direction', () => {
    const near = computeAim(pointerAt(30, 20), origin, null, t);
    const far = computeAim(pointerAt(30, 400), origin, null, t);
    expect(near.theta).toBeCloseTo(far.theta, 12);
    expect(near.dragDist).toBeCloseTo(20, 10);
    expect(far.dragDist).toBeCloseTo(400, 10);
  });
});

describe('launchVelocity (§2.2: assignment, never accumulation)', () => {
  it('theta = 0 is straight down at full impulse', () => {
    expect(launchVelocity(0, 430)).toEqual({ x: 0, y: 430 });
  });

  it('+theta goes right and down, -theta goes left and down', () => {
    const right = launchVelocity(degToRad(45), 100);
    expect(right.x).toBeCloseTo(Math.SQRT1_2 * 100, 10);
    expect(right.y).toBeCloseTo(Math.SQRT1_2 * 100, 10);

    const left = launchVelocity(degToRad(-45), 100);
    expect(left.x).toBeCloseTo(-Math.SQRT1_2 * 100, 10);
    expect(left.y).toBeCloseTo(Math.SQRT1_2 * 100, 10);
  });

  it('preserves the impulse magnitude at every angle in the cone', () => {
    for (let deg = -62; deg <= 62; deg += 4) {
      const v = launchVelocity(degToRad(deg), 317);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(317, 10);
    }
  });

  it('stays downward at the cone edges', () => {
    expect(launchVelocity(CONE, 430).y).toBeGreaterThan(0);
    expect(launchVelocity(-CONE, 430).y).toBeGreaterThan(0);
  });

  it('returns a fresh object (the caller assigns, never mutates a shared vector)', () => {
    const a = launchVelocity(0.2, 100);
    const b = launchVelocity(0.2, 100);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('is zero for a zero impulse', () => {
    expect(launchVelocity(0.5, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('aim + launch integration', () => {
  it('a full-cone right aim lands within the ±62° half-plane, moving down and right', () => {
    const aim = computeAim(pointerAt(80), origin, null, t);
    const v = launchVelocity(aim.theta, 430);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeGreaterThan(0);
    expect(Math.atan2(v.x, v.y)).toBeCloseTo(CONE, 10);
  });

  it('an invalid pointer with no history launches exactly straight down', () => {
    const aim = computeAim(vec(origin.x - 200, origin.y - 200), origin, null, t);
    expect(launchVelocity(aim.theta, 250)).toEqual({ x: 0, y: 250 });
  });
});
