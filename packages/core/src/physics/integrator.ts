/**
 * Velocity integration and analytic reach (GDD §11.4, §2.2).
 *
 * Semi-implicit, fixed step. Damping is the EXACT exponential exp(-k·dt), never the Euler
 * approximation (1 - k·dt): they agree at 1/60 s and diverge as soon as the step changes.
 */
import { terminalRise } from '../tuning';
import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { BubbleState } from '../types';
import type { ReadonlyPhysicsEnv } from './forceFields';

export interface IntegrateParams {
  state: BubbleState;
  /** Sampled force-field environment; read-only (the shared NEUTRAL_ENV is a valid argument). */
  env: ReadonlyPhysicsEnv;
  /** LAUNCHED lock window uses lighter damping (§11.3): multiply damping by this (1 = normal). */
  dampingMul: number;
}

/**
 * Semi-implicit velocity update for one fixed step (§11.4). Pure: returns a new velocity.
 *   vel.y -= BUOYANCY * dt * buoyancyMul
 *   vel.x *= exp(-DAMPING_X * dt * dampingMul); vel.y *= exp(-DAMPING_Y * dt * dampingMul)
 *   vel += env.force * dt
 *   vel.y = min(vel.y, MAX_FALL_SPEED)
 * Buoyancy is skipped entirely while RESTING (velocity is forced to 0 by the state machine) and DEAD.
 * AIMING keeps §2.1's "apuntar ancla": buoyancy drops to `AIM_BUOYANCY_MUL` while the aim is held. It
 * only ever applies to an AIR aim, because an aim from a ledge is pinned and does not integrate at
 * all — and it is exactly what makes D1's metered double jump usable. Free rise puts Bur 268 px up in
 * the 3 s she may spend lining the shot up and 728 px up over the whole AIM_MAX_MS, against a 320–420
 * px view with a ratcheting Y camera: without the anchor the one mid-air shot of the fall punishes
 * the hesitation it exists for, and hands the player a resaca for thinking.
 */
export function integrateVelocity(vel: Vec2, dt: number, p: IntegrateParams, t: Tuning): Vec2 {
  // RESTING pins Bur to the ceiling and DEAD is a cosmetic deflate: neither integrates.
  if (p.state === 'RESTING' || p.state === 'DEAD') return { x: vel.x, y: vel.y };

  const anchor = p.state === 'AIMING' ? t.AIM_BUOYANCY_MUL : 1;
  let x = vel.x;
  let y = vel.y - t.BUOYANCY * dt * p.env.buoyancyMul * anchor;

  const damping = Math.max(0, p.dampingMul);
  x *= Math.exp(-t.DAMPING_X * dt * damping);
  y *= Math.exp(-t.DAMPING_Y * dt * damping);

  x += p.env.force.x * dt;
  y += p.env.force.y * dt;

  return { x, y: Math.min(y, t.MAX_FALL_SPEED) };
}

/**
 * Analytic descent from a downward launch speed v0 until the dead point (§2.2):
 *   d = (T/D) * (x - ln(1 + x)),  T = terminalRise, D = DAMPING_Y, x = v0 / T
 * Used by the reach rule and by tests; must agree with the numeric integrator within 2 %.
 */
export function descentDistance(v0: number, t: Tuning): number {
  if (!(v0 > 0)) return 0;
  const T = terminalRise(t);
  const D = t.DAMPING_Y;
  if (!(T > 0) || !(D > 0)) return 0;
  const x = v0 / T;
  return (T / D) * (x - Math.log1p(x));
}
