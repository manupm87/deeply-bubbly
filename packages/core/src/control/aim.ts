/**
 * Aim from a frozen origin (GDD §2.1, §11.4). Pure: the caller owns `lastAimValid`.
 */
import { clamp, degToRad, type Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';

export interface AimResult {
  /** Radians from straight down; positive = right. Always within ±AIM_CONE. */
  theta: number;
  /** False when the pointer was above the origin or inside AIM_MIN_RADIUS (direction was preserved). */
  valid: boolean;
  dragDist: number;
}

/**
 * Aim from a FROZEN origin (§2.1, §11.4):
 *   d = pointer - aimOrigin
 *   if d.y <= 0 || |d| < AIM_MIN_RADIUS: theta = lastAimValid ?? 0, valid = false
 *   else theta = clamp(atan2(d.x, d.y) * AIM_GAIN, ±cone); if |theta| < deadzone: theta = 0; valid = true
 * dragDist is |d| regardless of validity (0 when |d| < AIM_MIN_RADIUS is fine too: implementer's choice, documented in tests).
 *
 * Chosen here: `dragDist` is ALWAYS the true |d|, even when the direction is not valid, so the HUD
 * fine-tune ring stays continuous while the finger crosses the horizon or the anti-jitter disc.
 */
export function computeAim(pointer: Vec2, aimOrigin: Vec2, lastAimValid: number | null, t: Tuning): AimResult {
  const dx = pointer.x - aimOrigin.x;
  const dy = pointer.y - aimOrigin.y;
  const dragDist = Math.hypot(dx, dy);

  // Above the frozen origin (never aim upward) or too close to it (angular jitter): keep the last
  // valid direction, or straight down when there is none.
  if (dy <= 0 || dragDist < t.AIM_MIN_RADIUS) {
    return { theta: lastAimValid ?? 0, valid: false, dragDist };
  }

  const cone = degToRad(t.AIM_CONE_DEG);
  let theta = clamp(Math.atan2(dx, dy) * t.AIM_GAIN, -cone, cone);
  if (Math.abs(theta) < degToRad(t.AIM_DEADZONE_DEG)) theta = 0;
  return { theta, valid: true, dragDist };
}

/** vel = { x: sin(theta) * impulse, y: cos(theta) * impulse } — ASSIGNMENT semantics, never additive. */
export function launchVelocity(theta: number, impulse: number): Vec2 {
  return { x: Math.sin(theta) * impulse, y: Math.cos(theta) * impulse };
}
