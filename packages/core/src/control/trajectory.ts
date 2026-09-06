/**
 * Aim guide prediction (GDD §2.7, §10.3). It runs the SAME integrator and the SAME swept collision the
 * player is about to experience — there are never two physics — so the dotted arc is exact up to the
 * first bounce, which is precisely what §2.2 ("the launch REPLACES the velocity") buys us.
 *
 * The fixed step itself is NOT written here: it is `physicsStep`, the single body of code `bubbleStep`
 * runs too. Everything below is the loop around it (the LAUNCHED lock, the stop condition, sampling).
 */
import { launchLockSteps, physicsStep } from '../physics/step';
import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { ForceField, SolidEntity } from '../types';

export interface TrajectoryInput {
  start: Vec2;
  vel: Vec2;
  radius: number;
  solids: readonly SolidEntity[];
  /** Force fields are NOT drawn (§2.7): pass [] for the player's guide; the validator may pass real fields. */
  fields: readonly ForceField[];
  timeMs: number;
  /** Max simulated seconds (default 2.5). */
  maxSeconds?: number;
}

/** Default simulated horizon in seconds when `maxSeconds` is not given. */
export const DEFAULT_TRAJECTORY_SECONDS = 2.5;

/**
 * Simulates the launch with the SAME integrator and collision code the player uses (§2.7, §10.3), sampling
 * one point per fixed step, stopping at the first contact (inclusive) or when maxSeconds elapse.
 * Returns the raw dense polyline in world coordinates.
 */
export function predictTrajectory(input: TrajectoryInput, t: Tuning): Vec2[] {
  const dt = t.FIXED_DT;
  const points: Vec2[] = [{ x: input.start.x, y: input.start.y }];
  if (!(dt > 0)) return points;

  const stepMs = dt * 1000;
  const maxSeconds = Math.max(0, input.maxSeconds ?? DEFAULT_TRAJECTORY_SECONDS);
  const steps = Math.floor(maxSeconds / dt + 1e-9);
  // §11.3: the first LAUNCH_LOCK_MS are LAUNCHED (lighter damping, rest ignored), then IDLE. The
  // window is counted in WHOLE STEPS; accumulating `dt * 1000` drifts and buys the lock a 16th step.
  const lockSteps = launchLockSteps(t);

  let pos: Vec2 = { x: input.start.x, y: input.start.y };
  let vel: Vec2 = { x: input.vel.x, y: input.vel.y };

  for (let i = 0; i < steps; i++) {
    const launched = i < lockSteps;
    const stepped = physicsStep(
      { pos, vel, radius: input.radius, state: launched ? 'LAUNCHED' : 'IDLE' },
      { solids: input.solids, fields: input.fields },
      {
        dt,
        // Exact step time, never an accumulator: moving solids (§11.2) are sampled with it.
        timeMs: input.timeMs + i * stepMs,
        lateralFriction: t.LATERAL_FRICTION,
        dampingMul: launched ? t.LAUNCH_DAMPING_MUL : 1,
        // One contact is enough: the guide stops at the first bounce (§2.7), so no extra iterations.
        maxIterations: 1,
      },
      t,
    );
    pos = stepped.pos;
    vel = stepped.vel;

    // `pos` is Bur's centre at the moment of impact: it is the point the guide must end on.
    points.push({ x: pos.x, y: pos.y });
    if (stepped.contacts.length > 0) break;
  }

  return points;
}

/**
 * Picks `n` dots off a dense polyline, always including the first point.
 *
 * The spacing is set by `ofMax`, not by `n`, and that is what makes §2.7's dot ramp a ramp. Dots sit
 * one `ofMax`-th of the arc apart, so a zone drawing all `ofMax` of them shows the whole arc — last
 * dot ON the landing point — and a zone drawing fewer shows a PREFIX of it: the shape of the shot for
 * as far as the scaffold reaches, and then open water. Scaling the spacing with `n` instead (which is
 * what "n evenly spaced points" means) keeps the landing point in every zone, so 2 dots answer the
 * question exactly as well as 6 and the ramp retires nothing. `ofMax` defaults to `n`, which is the
 * "draw me the whole arc in n dots" case the guide's own tests and the tuning panel want.
 */
export function sampleDots(points: readonly Vec2[], n: number, ofMax = n): Vec2[] {
  if (points.length === 0 || n <= 0) return [];
  // Never return the same point twice: with fewer points than dots the polyline itself is the answer.
  const count = Math.min(Math.floor(n), points.length);
  const last = points.length - 1;
  // A polyline shorter than the dot budget (a shot that hits something immediately) is its own answer:
  // the spacing collapses onto it instead of piling every dot on the first point.
  const span = Math.max(1, Math.min(Math.floor(ofMax), points.length) - 1);
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const p = points[count === 1 ? 0 : Math.min(last, Math.round((i * last) / span))];
    if (p !== undefined) out.push({ x: p.x, y: p.y });
  }
  return out;
}
