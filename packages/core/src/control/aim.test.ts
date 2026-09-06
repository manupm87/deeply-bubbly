import { describe, expect, it } from 'vitest';
import { degToRad, vec } from '../math/vec';
import { createTuning } from '../tuning';
import { computeAim, launchVelocity } from './aim';

const t = createTuning();
const origin = vec(90, 200);
const CONE = degToRad(t.AIM_CONE_DEG); // 90° = π/2 after DECISIONS-v1.2 D2
const DEADZONE = degToRad(t.AIM_DEADZONE_DEG); // 5°

/**
 * Pointer that PULLS the sling so the shot leaves at `launchDeg` from straight down (+ = right).
 * The pull is the opposite of the shot, which is the whole of D2 in one line.
 */
const pullFor = (launchDeg: number, dist = 50) =>
  vec(origin.x - Math.sin(degToRad(launchDeg)) * dist, origin.y - Math.cos(degToRad(launchDeg)) * dist);

describe('computeAim — the pull is the opposite of the shot (D2)', () => {
  it('a pull straight UP launches straight DOWN', () => {
    const r = computeAim(vec(origin.x, origin.y - 60), origin, t);
    expect(r.theta).toBe(0);
    expect(r.valid).toBe(true);
    expect(r.pullDist).toBeCloseTo(60, 12);
    expect(r.dir.x).toBeCloseTo(0, 12);
    expect(r.dir.y).toBeCloseTo(1, 12);
  });

  it('a pull up-and-left launches down-and-right', () => {
    const r = computeAim(vec(origin.x - 50, origin.y - 50), origin, t);
    expect(r.valid).toBe(true);
    expect(r.theta).toBeCloseTo(degToRad(45), 12);
    expect(r.dir.x).toBeGreaterThan(0);
    expect(r.dir.y).toBeGreaterThan(0);
  });

  it('there is no angular gain any more: the shot is exactly the mirror of the drag', () => {
    for (const deg of [10, 25, 40, 60, 80]) {
      expect(computeAim(pullFor(deg), origin, t).theta).toBeCloseTo(degToRad(deg), 9);
      expect(computeAim(pullFor(-deg), origin, t).theta).toBeCloseTo(degToRad(-deg), 9);
    }
  });

  it('reports pullDist as the true |d| at any angle, valid or not', () => {
    expect(computeAim(vec(origin.x + 3, origin.y - 4), origin, t).pullDist).toBeCloseTo(5, 12);
    expect(computeAim(vec(origin.x + 30, origin.y + 40), origin, t).pullDist).toBeCloseTo(50, 12);
    expect(computeAim(origin, origin, t).pullDist).toBe(0);
  });

  it('does not depend on the pull LENGTH, only on its direction', () => {
    const near = computeAim(pullFor(30, 6), origin, t);
    const far = computeAim(pullFor(30, 400), origin, t);
    expect(near.theta).toBeCloseTo(far.theta, 12);
    // Even a 6 px pull has a direction: the cancel zone is a decision of `pullPower`/`isCancelZone`,
    // not of the aim. Freezing the angle near the origin was the v1.1 anti-jitter rule and it is gone.
    expect(near.valid).toBe(true);
  });

  it('is measured from the FROZEN origin, so a still finger is a perfectly still shot', () => {
    const pointer = pullFor(30);
    const a = computeAim(pointer, origin, t);
    const b = computeAim(pointer, vec(origin.x + 40, origin.y - 60), t);
    expect(a.theta).not.toBeCloseTo(b.theta, 3);
    expect(computeAim(pointer, origin, t).theta).toBe(a.theta);
  });

  it('is a zero-length pull is a neutral straight-down aim, not a NaN', () => {
    const r = computeAim(origin, origin, t);
    expect(r.theta).toBe(0);
    expect(r.valid).toBe(true);
    expect(r.dir).toEqual({ x: 0, y: 1 });
  });
});

describe('computeAim — the cone clamps upward pulls to the horizontal (D2)', () => {
  it('a downward pull (asking to fly UP) clamps to the horizontal and reports aimValid false', () => {
    const right = computeAim(vec(origin.x - 5, origin.y + 60), origin, t);
    expect(right.valid).toBe(false);
    expect(right.theta).toBeCloseTo(CONE, 12);

    const left = computeAim(vec(origin.x + 5, origin.y + 60), origin, t);
    expect(left.valid).toBe(false);
    expect(left.theta).toBeCloseTo(-CONE, 12);
  });

  it('clamps to the horizontal on the SAME side the pull asked for', () => {
    // Pulling down-and-right means "go up and left": the nearest legal shot is the left horizontal.
    expect(computeAim(vec(origin.x + 40, origin.y + 40), origin, t).theta).toBeCloseTo(-CONE, 12);
    expect(computeAim(vec(origin.x - 40, origin.y + 40), origin, t).theta).toBeCloseTo(CONE, 12);
  });

  it('a purely horizontal pull is the cone edge, and it is VALID', () => {
    const r = computeAim(vec(origin.x - 60, origin.y), origin, t);
    expect(r.valid).toBe(true);
    expect(r.theta).toBeCloseTo(CONE, 12);
  });

  it('never returns an upward direction: dir.y >= 0 for every pointer position', () => {
    for (let dx = -400; dx <= 400; dx += 17) {
      for (let dy = -400; dy <= 400; dy += 17) {
        const r = computeAim(vec(origin.x + dx, origin.y + dy), origin, t);
        expect(r.dir.y).toBeGreaterThanOrEqual(-1e-12);
        expect(Math.abs(r.theta)).toBeLessThanOrEqual(CONE + 1e-12);
      }
    }
  });

  it('snaps to straight down inside the ±5° deadzone', () => {
    expect(computeAim(pullFor(3), origin, t).theta).toBe(0);
    expect(computeAim(pullFor(-3), origin, t).theta).toBe(0);
    expect(computeAim(pullFor(0), origin, t).theta).toBe(0);
  });

  it('leaves the deadzone just above it', () => {
    const r = computeAim(pullFor(6), origin, t);
    expect(r.theta).toBeCloseTo(degToRad(6), 9);
    expect(Math.abs(r.theta)).toBeGreaterThanOrEqual(DEADZONE);
    expect(r.valid).toBe(true);
  });

  it('is monotonic in the pull angle across the whole cone', () => {
    let prev = computeAim(pullFor(-90), origin, t).theta;
    for (let deg = -89; deg <= 90; deg += 1) {
      const th = computeAim(pullFor(deg), origin, t).theta;
      expect(th).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = th;
    }
  });

  it('keeps dir and theta in agreement even where the clamp or the deadzone moved the shot', () => {
    for (let dx = -200; dx <= 200; dx += 23) {
      for (let dy = -200; dy <= 200; dy += 23) {
        const r = computeAim(vec(origin.x + dx, origin.y + dy), origin, t);
        expect(r.dir.x).toBeCloseTo(Math.sin(r.theta), 12);
        expect(r.dir.y).toBeCloseTo(Math.cos(r.theta), 12);
      }
    }
  });
});

describe('launchVelocity (§2.2: assignment, never accumulation)', () => {
  it('theta = 0 is straight down at full impulse', () => {
    expect(launchVelocity(0, t.IMPULSE_MAX)).toEqual({ x: 0, y: t.IMPULSE_MAX });
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
    for (let deg = -90; deg <= 90; deg += 4) {
      const v = launchVelocity(degToRad(deg), 317);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(317, 10);
    }
  });

  it('is exactly horizontal at the cone edges: the shot never rises', () => {
    expect(Math.abs(launchVelocity(CONE, t.IMPULSE_MAX).y)).toBeLessThan(1e-9);
    expect(Math.abs(launchVelocity(-CONE, t.IMPULSE_MAX).y)).toBeLessThan(1e-9);
    expect(launchVelocity(CONE, t.IMPULSE_MAX).x).toBeGreaterThan(0);
    expect(launchVelocity(-CONE, t.IMPULSE_MAX).x).toBeLessThan(0);
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
  it('a full-cone pull lands on the horizontal, moving sideways and never up', () => {
    const aim = computeAim(vec(origin.x - 80, origin.y), origin, t);
    const v = launchVelocity(aim.theta, t.IMPULSE_MAX);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeGreaterThanOrEqual(0);
    expect(Math.atan2(v.x, v.y)).toBeCloseTo(CONE, 6);
  });

  it('a pull that asks to fly upward still produces a legal, sideways shot', () => {
    const aim = computeAim(vec(origin.x - 200, origin.y + 200), origin, t);
    expect(aim.valid).toBe(false);
    const v = launchVelocity(aim.theta, 250);
    expect(v.x).toBeCloseTo(250, 6);
    expect(Math.abs(v.y)).toBeLessThan(1e-9);
  });
});
