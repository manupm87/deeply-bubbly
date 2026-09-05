/**
 * ADVERSARIAL tests for control/trajectory.ts. Each `it` here documents a defect found by review and is
 * expected to FAIL until the implementation is fixed. Nothing in this file duplicates the loop under
 * test: every expectation is derived from the GDD contract, never from the code.
 */
import { describe, expect, it } from 'vitest';
import { predictTrajectory } from './trajectory';
import { integrateVelocity } from '../physics/integrator';
import { createNeutralEnv } from '../physics/forceFields';
import { createTuning } from '../tuning';
import type { Vec2 } from '../math/vec';

const START: Vec2 = { x: 90, y: 100 };
const LAUNCH_VEL: Vec2 = { x: 120, y: 400 };

/**
 * §11.3 / §11.6: LAUNCHED lasts LAUNCH_LOCK_MS = 250 ms, and the simulation runs at a FIXED step of
 * 1/60 s = 16.666… ms, so the lock covers exactly 250 / 16.666… = 15 whole steps. Step index 15 (the
 * 16th) is already past the lock and must integrate as IDLE.
 *
 * `predictTrajectory` decides with `elapsedMs < LAUNCH_LOCK_MS` on an accumulator built by repeated
 * `elapsedMs += dt * 1000`. After 15 additions that accumulator is 249.99999999999994, not 250, so the
 * 16th step is still treated as LAUNCHED: the lock runs 266.67 ms instead of 250 ms.
 *
 * The defect is invisible with the shipped DEFAULT_TUNING because LAUNCH_DAMPING_MUL === 1 makes
 * LAUNCHED and IDLE numerically identical — tuning.ts says that value is "kept at 1.0 … Tune in
 * playtest", so the bug is armed and waiting. These tests use a tuning where the two states differ.
 */
describe('predictTrajectory — LAUNCHED lock window (§11.3, §11.6)', () => {
  const t = createTuning({ LAUNCH_DAMPING_MUL: 0 });
  const stepMs = t.FIXED_DT * 1000;
  /** Whole fixed steps covered by the lock: 250 / 16.666… = 15. */
  const lockSteps = Math.round(t.LAUNCH_LOCK_MS / stepMs);

  /** Reference arc: identical physics, but the lock is counted in whole steps as §11.3 specifies. */
  function reference(steps: number): Vec2[] {
    let pos: Vec2 = { ...START };
    let vel: Vec2 = { ...LAUNCH_VEL };
    const points: Vec2[] = [{ ...START }];
    for (let i = 0; i < steps; i++) {
      const launched = i < lockSteps;
      vel = integrateVelocity(
        vel,
        t.FIXED_DT,
        {
          state: launched ? 'LAUNCHED' : 'IDLE',
          env: createNeutralEnv(),
          dampingMul: launched ? t.LAUNCH_DAMPING_MUL : 1,
        },
        t,
      );
      pos = { x: pos.x + vel.x * t.FIXED_DT, y: pos.y + vel.y * t.FIXED_DT };
      points.push({ ...pos });
    }
    return points;
  }

  it('the lock covers exactly 15 fixed steps, so step 16 is already damped as IDLE', () => {
    expect(lockSteps).toBe(15);
    const steps = lockSteps + 1;
    const got = predictTrajectory(
      { start: START, vel: LAUNCH_VEL, radius: 7, solids: [], fields: [], timeMs: 0, maxSeconds: steps * t.FIXED_DT },
      t,
    );
    const want = reference(steps);
    // Index 0..15 agree; index 16 is the first step past the 250 ms lock.
    expect(got[lockSteps]?.y).toBeCloseTo(want[lockSteps]?.y ?? 0, 9);
    expect(got[lockSteps + 1]?.y).toBeCloseTo(want[lockSteps + 1]?.y ?? 0, 9);
  });

  it('a whole predicted arc matches the step-counted reference (it diverges from index 16 on)', () => {
    const steps = 30;
    const got = predictTrajectory(
      { start: START, vel: LAUNCH_VEL, radius: 7, solids: [], fields: [], timeMs: 0, maxSeconds: steps * t.FIXED_DT },
      t,
    );
    const want = reference(steps);
    expect(got).toHaveLength(want.length);
    for (let i = 0; i < want.length; i++) {
      expect(got[i]?.x).toBeCloseTo(want[i]?.x ?? 0, 9);
      expect(got[i]?.y).toBeCloseTo(want[i]?.y ?? 0, 9);
    }
  });

  it('the extra locked step is worth ~0.5 px of predicted depth: the guide is not "exacta" (§2.7)', () => {
    const steps = 24;
    const got = predictTrajectory(
      { start: START, vel: LAUNCH_VEL, radius: 7, solids: [], fields: [], timeMs: 0, maxSeconds: steps * t.FIXED_DT },
      t,
    );
    const want = reference(steps);
    const gotY = got[got.length - 1]?.y ?? 0;
    const wantY = want[want.length - 1]?.y ?? 0;
    expect(Math.abs(gotY - wantY)).toBeLessThan(1e-9);
  });
});
