import { describe, expect, it } from 'vitest';
import { descentDistance, integrateVelocity } from './integrator';
import { createNeutralEnv } from './forceFields';
import { createTuning, terminalRise } from '../tuning';
import type { IntegrateParams } from './integrator';
import type { Vec2 } from '../math/vec';
import type { BubbleState } from '../types';

const t = createTuning();
const DT = t.FIXED_DT;

function params(state: BubbleState = 'IDLE', over: Partial<IntegrateParams> = {}): IntegrateParams {
  return { state, env: createNeutralEnv(), dampingMul: 1, ...over };
}

/** Free flight with the real integrator: returns the velocity after `steps` fixed steps. */
function integrateSteps(v0: Vec2, steps: number, p: IntegrateParams = params()): Vec2 {
  let v = v0;
  for (let i = 0; i < steps; i++) v = integrateVelocity(v, DT, p, t);
  return v;
}

describe('integrateVelocity (§11.4)', () => {
  it('applies exactly the §11.4 formula (buoyancy, then exponential damping, then field force)', () => {
    const env = createNeutralEnv();
    env.force = { x: 12, y: -30 };
    const v = integrateVelocity({ x: 50, y: 200 }, DT, params('IDLE', { env }), t);
    const expectedX = 50 * Math.exp(-t.DAMPING_X * DT) + 12 * DT;
    const expectedY = (200 - t.BUOYANCY * DT) * Math.exp(-t.DAMPING_Y * DT) - 30 * DT;
    expect(v.x).toBeCloseTo(expectedX, 12);
    expect(v.y).toBeCloseTo(expectedY, 12);
  });

  it('uses exp(-k·dt), not the Euler approximation (1 - k·dt)', () => {
    // One big step makes the two models diverge measurably.
    const v = integrateVelocity({ x: 100, y: 0 }, 1, params('IDLE', { env: createNeutralEnv() }), t);
    expect(v.x).toBeCloseTo(100 * Math.exp(-t.DAMPING_X), 12);
    expect(v.x).not.toBeCloseTo(100 * (1 - t.DAMPING_X), 3);
  });

  it('is pure: the input velocity is not mutated', () => {
    const v0 = { x: 10, y: 10 };
    integrateVelocity(v0, DT, params(), t);
    expect(v0).toEqual({ x: 10, y: 10 });
  });

  it('CHARGING applies buoyancy at CHARGING_BUOYANCY_MUL ("cargar ancla", §2.1)', () => {
    const idle = integrateVelocity({ x: 0, y: 0 }, DT, params('IDLE'), t);
    const charging = integrateVelocity({ x: 0, y: 0 }, DT, params('CHARGING'), t);
    expect(charging.y / idle.y).toBeCloseTo(t.CHARGING_BUOYANCY_MUL, 12);
    expect(charging.y).toBeLessThan(0); // still rising, just slower
  });

  it('RESTING and DEAD return the velocity unchanged (no buoyancy, no damping)', () => {
    for (const state of ['RESTING', 'DEAD'] as const) {
      expect(integrateVelocity({ x: 0, y: 0 }, DT, params(state), t)).toEqual({ x: 0, y: 0 });
      expect(integrateVelocity({ x: 7, y: -3 }, DT, params(state), t)).toEqual({ x: 7, y: -3 });
    }
  });

  it('scales buoyancy by the force-field buoyancyMul', () => {
    const env = createNeutralEnv();
    env.buoyancyMul = 0;
    const v = integrateVelocity({ x: 0, y: 100 }, DT, params('IDLE', { env }), t);
    expect(v.y).toBeCloseTo(100 * Math.exp(-t.DAMPING_Y * DT), 12);
  });

  it('dampingMul scales the damping (LAUNCHED lock window, §11.3)', () => {
    const light = integrateVelocity({ x: 100, y: 0 }, DT, params('LAUNCHED', { dampingMul: 0 }), t);
    expect(light.x).toBeCloseTo(100, 12);
    const half = integrateVelocity({ x: 100, y: 0 }, DT, params('LAUNCHED', { dampingMul: 0.5 }), t);
    expect(half.x).toBeCloseTo(100 * Math.exp(-t.DAMPING_X * DT * 0.5), 12);
  });

  it('clamps the fall speed at MAX_FALL_SPEED and never clamps the rise', () => {
    const env = createNeutralEnv();
    env.force = { x: 0, y: 5000 };
    const down = integrateVelocity({ x: 0, y: 500 }, DT, params('IDLE', { env }), t);
    expect(down.y).toBe(t.MAX_FALL_SPEED);
    const up = integrateVelocity({ x: 0, y: -5000 }, DT, params('IDLE'), t);
    expect(up.y).toBeLessThan(-4000);
  });

  it('§11.7.11 — free rise from v = 0 converges to TERMINAL_RISE within 1 %', () => {
    const v = integrateSteps({ x: 0, y: 0 }, 3000);
    const terminal = terminalRise(t);
    expect(Math.abs(-v.y - terminal) / terminal).toBeLessThan(0.01);
  });

  it('the horizontal is preserved much longer than the vertical (§2.2)', () => {
    const v = integrateSteps({ x: 100, y: 100 }, 60);
    expect(v.x).toBeCloseTo(100 * Math.exp(-t.DAMPING_X), 6);
    expect(v.x / 100).toBeGreaterThan(0.7);
  });
});

/** Numeric descent with the real integrator: distance fallen until the dead point. */
function numericDescent(v0: number): number {
  let v: Vec2 = { x: 0, y: v0 };
  let d = 0;
  for (let i = 0; i < 100_000; i++) {
    v = integrateVelocity(v, DT, params('IDLE'), t);
    if (v.y <= 0) break;
    d += v.y * DT;
  }
  return d;
}

describe('descentDistance (§2.2 reach table)', () => {
  it('reproduces the §2.2 numbers: 430 px/s -> ~362 px, 150 px/s (dry tap) -> ~72 px', () => {
    expect(descentDistance(430, t)).toBeCloseTo(362, 0);
    expect(descentDistance(150, t)).toBeCloseTo(72, 0);
  });

  it('reproduces the whole §2.2 per-zone table within 1 %', () => {
    const table: readonly (readonly [number, number])[] = [
      [430, 362],
      [418, 346],
      [404, 331],
      [387, 311],
      [368, 288],
      [349, 267],
    ];
    for (const [impulse, expected] of table) {
      const d = descentDistance(impulse, t);
      expect(Math.abs(d - expected) / expected).toBeLessThan(0.01);
    }
  });

  it('agrees with the numeric integrator within 2 % across the real impulse range (373–494 px/s)', () => {
    for (let v0 = 150; v0 <= 520; v0 += 10) {
      const analytic = descentDistance(v0, t);
      const numeric = numericDescent(v0);
      expect(Math.abs(analytic - numeric) / analytic).toBeLessThan(0.02);
    }
  });

  it('a full-charge shot always clears a chunk (240 px) in every zone (§2.2)', () => {
    for (const impulse of [430, 418, 404, 387, 368, 349]) {
      expect(descentDistance(impulse, t)).toBeGreaterThan(t.CHUNK_H);
    }
  });

  it('every MAX_HOP_PX leaves margin over the zone reach (§11.5.11)', () => {
    const impulses = [430, 418, 404, 387, 368, 349];
    impulses.forEach((impulse, zone) => {
      expect(t.MAX_HOP_PX[zone] ?? 0).toBeLessThan(descentDistance(impulse, t));
    });
  });

  it('is zero for a non-positive launch speed and strictly increasing above it', () => {
    expect(descentDistance(0, t)).toBe(0);
    expect(descentDistance(-100, t)).toBe(0);
    expect(descentDistance(Number.NaN, t)).toBe(0);
    let prev = 0;
    for (let v0 = 10; v0 <= 520; v0 += 10) {
      const d = descentDistance(v0, t);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it('scales with the tuning, not with a hard-coded constant', () => {
    const stronger = createTuning({ BUOYANCY: 200 });
    expect(descentDistance(430, stronger)).toBeLessThan(descentDistance(430, t));
  });
});
