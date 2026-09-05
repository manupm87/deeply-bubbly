import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAJECTORY_SECONDS, predictTrajectory, sampleDots } from './trajectory';
import type { TrajectoryInput } from './trajectory';
import { descentDistance } from '../physics/integrator';
import { createTuning } from '../tuning';
import type { Tuning } from '../tuning';
import type { Vec2 } from '../math/vec';
import type { Ceiling, ForceField, SolidEntity } from '../types';

const t = createTuning();

function ceiling(id: string, rect: { x: number; y: number; w: number; h: number }): Ceiling {
  return {
    type: 'ceiling',
    id,
    rect,
    kind: 'posadero',
    capturable: true,
    restitution: t.RESTITUTION_ROCK,
    material: 'rock',
  };
}

const START: Vec2 = { x: 90, y: 100 };

interface Override {
  solids?: readonly SolidEntity[];
  fields?: readonly ForceField[];
  maxSeconds?: number;
}

function straightDown(vy: number, over: Override = {}): Vec2[] {
  const input: TrajectoryInput = {
    start: START,
    vel: { x: 0, y: vy },
    radius: 7,
    solids: over.solids ?? [],
    fields: over.fields ?? [],
    timeMs: 0,
    ...(over.maxSeconds === undefined ? {} : { maxSeconds: over.maxSeconds }),
  };
  return predictTrajectory(input, t);
}

describe('predictTrajectory (§2.7, §10.3)', () => {
  it('always starts at the launch position', () => {
    const points = straightDown(430);
    expect(points[0]).toEqual(START);
    expect(points[0]).not.toBe(START); // defensive copy
  });

  it('samples one point per fixed step up to maxSeconds', () => {
    const points = straightDown(430, { maxSeconds: 1 });
    expect(points).toHaveLength(1 + Math.round(1 / t.FIXED_DT));
  });

  it('defaults to DEFAULT_TRAJECTORY_SECONDS of simulation', () => {
    const points = straightDown(430);
    expect(points).toHaveLength(1 + Math.round(DEFAULT_TRAJECTORY_SECONDS / t.FIXED_DT));
  });

  /**
   * §11.4 transcribed straight from the GDD (buoyancy, exact exponential damping, force fields, fall
   * cap — in that order), plus the §11.3 lock counted in WHOLE FIXED STEPS: LAUNCH_LOCK_MS = 250 ms
   * at FIXED_DT = 1/60 s is exactly 15 steps, so step index 15 is already IDLE. Nothing here calls
   * into the implementation: a test that re-runs the loop under test only proves the loop equals
   * itself (§11.7 — the contracts, not the code, are the definition of "hecho").
   */
  const LOCK_STEPS = 15;

  function referenceArc(vel: Vec2, steps: number, tt: Tuning): Vec2[] {
    const dt = tt.FIXED_DT;
    let x = START.x;
    let y = START.y;
    let vx = vel.x;
    let vy = vel.y;
    const out: Vec2[] = [{ x, y }];
    for (let i = 0; i < steps; i++) {
      const damping = i < LOCK_STEPS ? tt.LAUNCH_DAMPING_MUL : 1;
      vy -= tt.BUOYANCY * dt;
      vx *= Math.exp(-tt.DAMPING_X * dt * damping);
      vy *= Math.exp(-tt.DAMPING_Y * dt * damping);
      vy = Math.min(vy, tt.MAX_FALL_SPEED);
      x += vx * dt;
      y += vy * dt;
      out.push({ x, y });
    }
    return out;
  }

  it('reproduces the §11.4 formulas step by step, with the LAUNCHED lock at 15 steps (§11.3)', () => {
    // LAUNCH_DAMPING_MUL is 1.0 in DEFAULT_TUNING, which makes LAUNCHED and IDLE indistinguishable;
    // tuning.ts flags it as a playtest knob, so the contract is checked where the two differ.
    for (const mul of [1, 0.4, 0]) {
      const tt = createTuning({ LAUNCH_DAMPING_MUL: mul });
      const steps = 40;
      const points = predictTrajectory(
        { start: START, vel: { x: 120, y: 400 }, radius: 7, solids: [], fields: [], timeMs: 0, maxSeconds: steps * tt.FIXED_DT },
        tt,
      );
      const want = referenceArc({ x: 120, y: 400 }, steps, tt);
      expect(points).toHaveLength(want.length);
      for (let i = 0; i < want.length; i++) {
        expect(points[i]?.x).toBeCloseTo(want[i]?.x ?? 0, 9);
        expect(points[i]?.y).toBeCloseTo(want[i]?.y ?? 0, 9);
      }
    }
  });

  it('samples moving solids at input.timeMs + the step time, not from zero (§11.2)', () => {
    // 40 px of travel at 4 px/s = a 20 s period, so the ceiling is nearly static within one arc:
    // at u = 0.25 it sits 20 px BELOW its base rect, at u = 0.75, 20 px above.
    const lift = ceiling('lift', { x: 0, y: 200, w: 180, h: 20 });
    const moving: Ceiling = { ...lift, moving: { axis: 'y', speed: 4, range: 40 } };
    const arcAt = (timeMs: number): Vec2[] =>
      predictTrajectory(
        { start: START, vel: { x: 0, y: 300 }, radius: 7, solids: [moving], fields: [], timeMs, maxSeconds: 1 },
        t,
      );

    const low = arcAt(5_000); // ceiling pushed down: Bur falls further before touching it
    const high = arcAt(15_000); // ceiling pushed up: Bur is stopped earlier
    const lowEnd = low[low.length - 1]?.y ?? 0;
    const highEnd = high[high.length - 1]?.y ?? 0;
    expect(lowEnd).toBeGreaterThan(highEnd + 30);
    // Top face at 220 / 180 (base 200 ± 20), centre one radius above it; the ceiling still creeps a
    // couple of px along its 4 px/s travel while Bur falls, hence the 3 px window.
    expect(Math.abs(lowEnd - (220 - 7))).toBeLessThan(3);
    expect(Math.abs(highEnd - (180 - 7))).toBeLessThan(3);
    // A whole period later the world is in the same place, so the prediction must be identical.
    expect(arcAt(20_000)).toEqual(arcAt(0));
  });

  it('the dead point of a free arc matches descentDistance within 2 % (§2.2)', () => {
    for (const v0 of [150, 300, 430, 494]) {
      const points = straightDown(v0);
      const deepest = Math.max(...points.map((p) => p.y));
      const analytic = descentDistance(v0, t);
      expect(Math.abs(deepest - START.y - analytic) / analytic).toBeLessThan(0.02);
    }
  });

  it('turns around and rises again once buoyancy wins (§2.2)', () => {
    const points = straightDown(430);
    const deepest = Math.max(...points.map((p) => p.y));
    const lastPoint = points[points.length - 1];
    expect(lastPoint?.y).toBeLessThan(deepest);
  });

  it('preserves the horizontal component far better than the vertical (DAMPING_X < DAMPING_Y)', () => {
    const points = predictTrajectory(
      { start: START, vel: { x: 200, y: 200 }, radius: 7, solids: [], fields: [], timeMs: 0, maxSeconds: 1 },
      t,
    );
    const last = points[points.length - 1];
    expect((last?.x ?? 0) - START.x).toBeGreaterThan(150);
  });

  it('stops at the first contact and includes the contact point', () => {
    const floor = ceiling('floor', { x: 0, y: 200, w: 180, h: 20 });
    const points = predictTrajectory(
      { start: START, vel: { x: 0, y: 430 }, radius: 7, solids: [floor], fields: [], timeMs: 0 },
      t,
    );
    const last = points[points.length - 1];
    // Ends touching the top face of the floor (centre at y = 200 - r), not past it and not short of it.
    expect(last?.y).toBeCloseTo(200 - 7, 2);
    expect(points.length).toBeLessThan(1 + Math.round(DEFAULT_TRAJECTORY_SECONDS / t.FIXED_DT));
    // Every earlier point is strictly above the floor.
    for (const p of points.slice(0, -1)) expect(p.y).toBeLessThan(200 - 7);
  });

  it('stops at a ceiling hit from below too (rest-capture candidate)', () => {
    const roof = ceiling('roof', { x: 0, y: 40, w: 180, h: 10 });
    const points = predictTrajectory(
      { start: { x: 90, y: 120 }, vel: { x: 0, y: -100 }, radius: 7, solids: [roof], fields: [], timeMs: 0 },
      t,
    );
    const last = points[points.length - 1];
    expect(last?.y).toBeCloseTo(50 + 7, 2);
  });

  it('ignores geometry that is out of the way', () => {
    const aside = ceiling('aside', { x: 0, y: 200, w: 20, h: 20 });
    expect(straightDown(430, { solids: [aside] })).toHaveLength(
      1 + Math.round(DEFAULT_TRAJECTORY_SECONDS / t.FIXED_DT),
    );
  });

  it('force fields bend the arc when the caller passes them (validator use, §2.7)', () => {
    const current: ForceField = {
      type: 'forcefield',
      id: 'corriente',
      rect: { x: 0, y: 0, w: 180, h: 400 },
      fieldType: 'corriente',
      vector: { x: 300, y: 0 },
      buoyancyMul: 1,
      impulseMul: 1,
      chargeMul: 1,
      opensAscenso: false,
    };
    const withField = straightDown(430, { fields: [current], maxSeconds: 1 });
    const withoutField = straightDown(430, { maxSeconds: 1 });
    expect(withField[withField.length - 1]?.x).toBeGreaterThan(
      (withoutField[withoutField.length - 1]?.x ?? 0) + 50,
    );
  });

  it('is deterministic', () => {
    expect(straightDown(430)).toEqual(straightDown(430));
  });

  it('returns just the start point for a zero horizon', () => {
    expect(straightDown(430, { maxSeconds: 0 })).toEqual([START]);
  });
});

describe('sampleDots', () => {
  const dense: Vec2[] = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i * 2 }));

  it('always includes the first point', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) expect(sampleDots(dense, n)[0]).toEqual({ x: 0, y: 0 });
  });

  it('includes the last point when n > 1', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const dots = sampleDots(dense, n);
      expect(dots).toHaveLength(n);
      expect(dots[n - 1]).toEqual({ x: 99, y: 198 });
    }
  });

  it('spaces the indices evenly', () => {
    const dots = sampleDots(dense, 5);
    expect(dots.map((p) => p.x)).toEqual([0, 25, 50, 74, 99]);
  });

  it('returns only the first point for n = 1 (Z6 would still show 2, §2.6)', () => {
    expect(sampleDots(dense, 1)).toEqual([{ x: 0, y: 0 }]);
  });

  it('handles every TRAJECTORY_DOTS value from the tuning table', () => {
    for (const n of t.TRAJECTORY_DOTS) {
      const dots = sampleDots(dense, n);
      expect(dots).toHaveLength(n);
      expect(new Set(dots.map((p) => p.x)).size).toBe(n); // no duplicates
    }
  });

  it('never returns duplicates when there are fewer points than dots', () => {
    const short: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(sampleDots(short, 6)).toEqual(short);
  });

  it('degenerates gracefully', () => {
    expect(sampleDots([], 6)).toEqual([]);
    expect(sampleDots(dense, 0)).toEqual([]);
    expect(sampleDots(dense, -3)).toEqual([]);
  });

  it('copies the points instead of aliasing the polyline', () => {
    const dots = sampleDots(dense, 3);
    expect(dots[0]).not.toBe(dense[0]);
    expect(dots[0]).toEqual(dense[0]);
  });
});
