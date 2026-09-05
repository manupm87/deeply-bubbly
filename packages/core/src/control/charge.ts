import type { Tuning } from '../tuning';

/** Normalised charge power p = min(1, chargeMs / CHARGE_FULL_MS) ^ CHARGE_EXP (§11.4). */
export function chargePower(chargeMs: number, t: Tuning): number {
  void chargeMs; void t;
  throw new Error('not implemented');
}

/** Symmetric ±DRAG_FINE_TUNE multiplier, neutral at DRAG_NEUTRAL_PX, clamped at DRAG_MAX_PX (§11.4). */
export function fineTuneMultiplier(dragDist: number, t: Tuning): number {
  void dragDist; void t;
  throw new Error('not implemented');
}

/** Fine tune expressed in [-1, 1] for the HUD ring thickness. */
export function fineTuneNormalized(dragDist: number, t: Tuning): number {
  void dragDist; void t;
  throw new Error('not implemented');
}

export interface ImpulseParams {
  power: number; // 0..1
  dragDist: number; // px
  radius: number; // current Bur radius
  stunned: boolean;
  /** Product of chargeMul from force fields (medusa fría) and REST_STICKY_IMPULSE_MUL when leaving a sticky ceiling. */
  externalMul: number;
}

/**
 * impulse = (IMPULSE_MIN + p * (IMPULSE_MAX - IMPULSE_MIN)) * fine * (radius / RADIUS_BASE) ^ IMPULSE_RADIUS_EXP
 *         * (stunned ? STUN_IMPULSE_MUL : 1) * externalMul
 */
export function impulseMagnitude(p: ImpulseParams, t: Tuning): number {
  void p; void t;
  throw new Error('not implemented');
}
