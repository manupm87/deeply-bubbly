/**
 * The one fixed physics step of the game (GDD §11.4): sample the force fields at the pre-move
 * position, integrate the velocity, then move the swept circle. In that order, once.
 *
 * It lives here because BOTH the aim guide (`predictTrajectory`, §2.7) and the state machine
 * (`bubbleStep`, §11.3) must run it: §10.3 rejects "dos físicas divergentes" by name, and the dotted
 * arc is only "exacta hasta el primer rebote" while the two are literally the same code.
 */
import { moveCircle } from './collision';
import { NEUTRAL_ENV, sampleForceFields } from './forceFields';
import { integrateVelocity } from './integrator';
import type { MotionOptions } from './collision';
import type { ReadonlyPhysicsEnv } from './forceFields';
import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { BubbleState, Contact, EntityId, ForceField, SolidEntity } from '../types';

/** State of the moving circle at the START of the step. Never mutated. */
export interface PhysicsStepBody {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  /** Drives buoyancy (§11.4): CHARGING anchors, RESTING and DEAD do not integrate at all. */
  state: BubbleState;
}

/** Everything around the circle this step. Both lists are in world coordinates. */
export interface PhysicsStepWorld {
  solids: readonly SolidEntity[];
  /** Pass [] for the player's guide (§2.7 does not draw fields); GameWorld passes the real ones. */
  fields: readonly ForceField[];
}

export interface PhysicsStepOptions {
  dt: number;
  /** Simulation time at the START of the step (drives moving solids and contact timestamps). */
  timeMs: number;
  lateralFriction: number;
  /** §11.3: LAUNCH_DAMPING_MUL inside the LAUNCHED lock window, 1 otherwise. */
  dampingMul?: number;
  maxIterations?: number;
  ignoreIds?: ReadonlySet<EntityId>;
  restitutionById?: ReadonlyMap<EntityId, number>;
  /** Rest-capture hook (§2.3); see `MotionOptions.stopAtContact`. */
  stopAtContact?: (contact: Contact) => boolean;
}

export interface PhysicsStepResult {
  pos: Vec2;
  vel: Vec2;
  contacts: Contact[];
  /** The environment sampled BEFORE the move (multipliers the caller may still need). */
  env: ReadonlyPhysicsEnv;
}

/**
 * Whole fixed steps covered by the LAUNCHED lock (§11.3: 250 ms; §11.6: FIXED_DT = 1/60 s → 15).
 * A step is LAUNCHED when it STARTS before the lock expires. Callers must count steps with this
 * instead of accumulating `dt * 1000`: 15 such additions land on 249.99999999999994, which silently
 * stretches a 250 ms window into 16 steps (266.67 ms).
 */
export function launchLockSteps(t: Pick<Tuning, 'LAUNCH_LOCK_MS' | 'FIXED_DT'>): number {
  const stepMs = t.FIXED_DT * 1000;
  if (!(stepMs > 0) || !(t.LAUNCH_LOCK_MS > 0)) return 0;
  // Tolerant ceil: the division is exact in real arithmetic (250 / 16.666… = 15) but not in floats.
  return Math.max(0, Math.ceil(t.LAUNCH_LOCK_MS / stepMs - 1e-9));
}

/** One fixed step of motion: force fields → velocity → swept move. Pure; allocates one result. */
export function physicsStep(
  body: PhysicsStepBody,
  world: PhysicsStepWorld,
  opts: PhysicsStepOptions,
  t: Tuning,
): PhysicsStepResult {
  // No fields means nothing to sample: hand out the shared frozen env instead of allocating one per
  // step (§11.5.10 — the guide rebuilds 150 steps every frame while CHARGING, on a phone).
  const env: ReadonlyPhysicsEnv =
    world.fields.length === 0 ? NEUTRAL_ENV : sampleForceFields(body.pos, body.radius, world.fields);

  const vel = integrateVelocity(body.vel, opts.dt, { state: body.state, env, dampingMul: opts.dampingMul ?? 1 }, t);

  const motion: MotionOptions = {
    lateralFriction: opts.lateralFriction,
    timeMs: opts.timeMs,
    ...(opts.maxIterations === undefined ? {} : { maxIterations: opts.maxIterations }),
    ...(opts.ignoreIds === undefined ? {} : { ignoreIds: opts.ignoreIds }),
    ...(opts.restitutionById === undefined ? {} : { restitutionById: opts.restitutionById }),
    ...(opts.stopAtContact === undefined ? {} : { stopAtContact: opts.stopAtContact }),
  };
  const moved = moveCircle(body.pos, vel, body.radius, opts.dt, world.solids, motion);

  return { pos: moved.pos, vel: moved.vel, contacts: moved.contacts, env };
}
