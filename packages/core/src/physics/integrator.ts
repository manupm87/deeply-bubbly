import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { BubbleState } from '../types';
import type { PhysicsEnv } from './forceFields';

export interface IntegrateParams {
  state: BubbleState;
  env: PhysicsEnv;
  /** LAUNCHED lock window uses lighter damping (§11.3): multiply damping by this (1 = normal). */
  dampingMul: number;
}

/**
 * Semi-implicit velocity update for one fixed step (§11.4). Pure: returns a new velocity.
 *   vel.y -= BUOYANCY * dt * buoyancyMul * (CHARGING ? CHARGING_BUOYANCY_MUL : 1)
 *   vel.x *= exp(-DAMPING_X * dt * dampingMul); vel.y *= exp(-DAMPING_Y * dt * dampingMul)
 *   vel += env.force * dt
 *   vel.y = min(vel.y, MAX_FALL_SPEED)
 * Buoyancy is skipped entirely while RESTING (velocity is forced to 0 by the state machine) and DEAD.
 */
export function integrateVelocity(vel: Vec2, dt: number, p: IntegrateParams, t: Tuning): Vec2 {
  void vel; void dt; void p; void t;
  throw new Error('not implemented');
}

/**
 * Analytic descent from a downward launch speed v0 until the dead point (§2.2):
 *   d = (T/D) * (x - ln(1 + x)),  T = terminalRise, D = DAMPING_Y, x = v0 / T
 * Used by the reach rule and by tests; must agree with the numeric integrator within 2 %.
 */
export function descentDistance(v0: number, t: Tuning): number {
  void v0; void t;
  throw new Error('not implemented');
}
