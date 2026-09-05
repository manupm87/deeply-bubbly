/**
 * Charge curve, drag fine tune and impulse magnitude (GDD §2.1, §2.2, §11.4).
 * Pure functions: no state, no time source, no allocation beyond the returned objects.
 */
import { clamp } from '../math/vec';
import type { Tuning } from '../tuning';
import type { ZoneIndex } from '../types';

/** Normalised charge power p = min(1, chargeMs / CHARGE_FULL_MS) ^ CHARGE_EXP (§11.4). */
export function chargePower(chargeMs: number, t: Tuning): number {
  if (!(chargeMs > 0) || t.CHARGE_FULL_MS <= 0) return 0;
  return Math.min(1, chargeMs / t.CHARGE_FULL_MS) ** t.CHARGE_EXP;
}

/**
 * Fine tune in [-1, 1]: -1 at zero drag, 0 at DRAG_NEUTRAL_PX, +1 at DRAG_MAX_PX and beyond.
 * Written as two linear ramps around the neutral point so both constants are honoured; with the
 * shipped values (45 / 90) it is exactly the §11.4 formula `(clamp(d,0,90)/90 - 0.5) * 2`.
 */
export function fineTuneNormalized(dragDist: number, t: Tuning): number {
  const d = clamp(Number.isFinite(dragDist) ? dragDist : 0, 0, t.DRAG_MAX_PX);
  const neutral = clamp(t.DRAG_NEUTRAL_PX, 0, t.DRAG_MAX_PX);
  if (d < neutral) return neutral > 0 ? d / neutral - 1 : 0;
  const upper = t.DRAG_MAX_PX - neutral;
  return upper > 0 ? (d - neutral) / upper : 0;
}

/** Symmetric ±DRAG_FINE_TUNE multiplier, neutral at DRAG_NEUTRAL_PX, clamped at DRAG_MAX_PX (§11.4). */
export function fineTuneMultiplier(dragDist: number, t: Tuning): number {
  return 1 + fineTuneNormalized(dragDist, t) * t.DRAG_FINE_TUNE;
}

/** Pressure penalty `(radius / RADIUS_BASE) ^ IMPULSE_RADIUS_EXP` (§2.6). */
export function pressureMultiplier(radius: number, t: Tuning): number {
  if (t.RADIUS_BASE <= 0) return 1;
  const r = Math.max(0, radius);
  return (r / t.RADIUS_BASE) ** t.IMPULSE_RADIUS_EXP;
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
  const power = clamp(p.power, 0, 1);
  const base = t.IMPULSE_MIN + power * (t.IMPULSE_MAX - t.IMPULSE_MIN);
  return (
    base *
    fineTuneMultiplier(p.dragDist, t) *
    pressureMultiplier(p.radius, t) *
    (p.stunned ? t.STUN_IMPULSE_MUL : 1) *
    p.externalMul
  );
}

/** Bur's radius in a zone with no reinflate active: RADIUS_BASE * ZONE_RADIUS_PCT[zone] (§2.6). */
export function zoneRadius(zone: ZoneIndex, t: Tuning): number {
  const pct = t.ZONE_RADIUS_PCT[zone] ?? 1;
  return t.RADIUS_BASE * pct;
}

export interface ImpulseRange {
  /** Full charge, drag at 0 px (fine tune at its minimum). */
  min: number;
  /** Full charge, drag at DRAG_MAX_PX or beyond (fine tune at its maximum). */
  max: number;
  /** Full charge, neutral drag: the value of the §2.2 "impulso efectivo" table. */
  neutral: number;
}

/**
 * Effective impulse at full charge for a zone, with no stun and no external multipliers.
 * `neutral` is the §2.2 table value (430 / 418 / 404 / 387 / 368 / 349 px/s); `min`/`max` bracket it
 * with the ±DRAG_FINE_TUNE window. Used by the level validator to reason about worst-case reach.
 */
export function impulseRangeForZone(zone: ZoneIndex, t: Tuning): ImpulseRange {
  const radius = zoneRadius(zone, t);
  const at = (dragDist: number): number =>
    impulseMagnitude({ power: 1, dragDist, radius, stunned: false, externalMul: 1 }, t);
  return { min: at(0), max: at(t.DRAG_MAX_PX), neutral: at(t.DRAG_NEUTRAL_PX) };
}
