/**
 * The slingshot direction (DECISIONS-v1.2 D2; GDD §2.1, §11.4). Pure: no state is kept here.
 *
 * You pull BACKWARD and Bur goes forward, exactly like the bird in the fork:
 *   d   = pointer - aimOrigin      // aimOrigin is the FINGER's world position, frozen at pointerdown
 *   dir = -normalise(d)            // the launch direction is the opposite of the pull
 * The v1.1 angular gain, the anti-jitter radius and the "keep the last valid direction" rule are all
 * gone: with the direction taken from the pull itself there is no discontinuity to smooth over, and a
 * pull that asks to go UP is answered with the nearest horizontal instead of a frozen old angle.
 */
import { clamp, degToRad, type Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';

export interface AimResult {
  /** Radians from straight down; positive = right. Always within ±AIM_CONE_DEG. */
  theta: number;
  /**
   * False when the pull asked to go upward and the direction was clamped to the horizontal. The shot
   * is still live — the shell just paints the guide amber to say "not that way" (D2).
   */
  valid: boolean;
  /** |d|, the length of the pull in px. Drives power and the cancel zone. */
  pullDist: number;
  /** Unit launch direction, i.e. `(sin theta, cos theta)`. Never points upward. */
  dir: Vec2;
}

/** A pull of zero length has no direction: straight down is the neutral answer. */
const STRAIGHT_DOWN: AimResult = { theta: 0, valid: true, pullDist: 0, dir: { x: 0, y: 1 } };

/**
 * Aim from a FROZEN origin (D2):
 *   d = pointer - aimOrigin; pullDist = |d|; dir = -d / |d|
 *   theta = clamp(atan2(dir.x, dir.y), ±AIM_CONE)   // AIM_CONE_DEG = 90 → the clamp IS the horizontal
 *   valid = dir.y >= 0                              // an upward pull was clamped, and says so
 *   if valid and |theta| < AIM_DEADZONE_DEG: theta = 0
 *
 * `atan2(dir.x, dir.y)` is what makes the clamp land "on the same side the pull asked for" without a
 * sign test: an upward-left direction reads as an angle just past −90° and clamps to −90°, an
 * upward-right one just past +90° and clamps to +90°. Only a pull that is EXACTLY straight down (Bur
 * asked to fly straight up) has no side, and it resolves to the right-hand horizontal.
 */
export function computeAim(pointer: Vec2, aimOrigin: Vec2, t: Tuning): AimResult {
  const dx = pointer.x - aimOrigin.x;
  const dy = pointer.y - aimOrigin.y;
  const pullDist = Math.hypot(dx, dy);
  if (!(pullDist > 0)) return { ...STRAIGHT_DOWN, dir: { ...STRAIGHT_DOWN.dir } };

  // Opposite of the pull: you tug the sling back, Bur leaves forward.
  const dir = { x: -dx / pullDist, y: -dy / pullDist };
  const cone = degToRad(t.AIM_CONE_DEG);
  const valid = dir.y >= 0;
  let theta = clamp(Math.atan2(dir.x, dir.y), -cone, cone);
  if (valid && Math.abs(theta) < degToRad(t.AIM_DEADZONE_DEG)) theta = 0;

  // Re-derive the direction from the clamped angle so `dir` and `theta` can never disagree — the
  // deadzone snap and the upward clamp both move the shot, and the guide is drawn from `dir`.
  return { theta, valid, pullDist, dir: { x: Math.sin(theta), y: Math.cos(theta) } };
}

/** vel = { x: sin(theta) * impulse, y: cos(theta) * impulse } — ASSIGNMENT semantics, never additive. */
export function launchVelocity(theta: number, impulse: number): Vec2 {
  return { x: Math.sin(theta) * impulse, y: Math.cos(theta) * impulse };
}
