import type { Vec2 } from '../math/vec';
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
 */
export function computeAim(pointer: Vec2, aimOrigin: Vec2, lastAimValid: number | null, t: Tuning): AimResult {
  void pointer; void aimOrigin; void lastAimValid; void t;
  throw new Error('not implemented');
}

/** vel = { x: sin(theta) * impulse, y: cos(theta) * impulse } — ASSIGNMENT semantics, never additive. */
export function launchVelocity(theta: number, impulse: number): Vec2 {
  void theta; void impulse;
  throw new Error('not implemented');
}
