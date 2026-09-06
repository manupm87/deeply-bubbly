/**
 * The slingshot: pull distance → power, and power → impulse (DECISIONS-v1.2 D2, D4; GDD §2.2, §11.4).
 * Pure functions: no state, no time source, no allocation beyond the returned objects.
 *
 * This file replaces v1.1's `charge.ts`. Power is no longer a clock — it is the length of the drag —
 * so the exponential charge curve, the mastery window and the ±15 % drag fine tune are gone: a pull
 * of `d` px is worth `d / PULL_MAX_PX` of power and nothing else reads the gesture. `charge.ts` is
 * kept next door as a thin re-export so the level content and the validator keep their imports.
 */
import { clamp } from '../math/vec';
import type { Tuning } from '../tuning';
import type { ZoneIndex } from '../types';

/**
 * Normalised power `p = clamp(|d| / PULL_MAX_PX, 0, 1)` (D2). Linear on purpose: the player reads the
 * shot off the length of their own drag, so any curve here would be a lie told by the fingertip.
 */
export function pullPower(pullDist: number, t: Tuning): number {
  if (!(pullDist > 0) || !(t.PULL_MAX_PX > 0)) return 0;
  return clamp(pullDist / t.PULL_MAX_PX, 0, 1);
}

/**
 * "Returning the bird to the slingshot" (D2): a release inside PULL_CANCEL_PX of the frozen origin
 * cancels the shot at no cost. While it holds, the guide is not drawn and the ring shows empty.
 */
export function isCancelZone(pullDist: number, t: Tuning): boolean {
  return !(pullDist >= t.PULL_CANCEL_PX);
}

/** Pressure penalty `(radius / RADIUS_BASE) ^ IMPULSE_RADIUS_EXP` (§2.6). */
export function pressureMultiplier(radius: number, t: Tuning): number {
  if (t.RADIUS_BASE <= 0) return 1;
  const r = Math.max(0, radius);
  return (r / t.RADIUS_BASE) ** t.IMPULSE_RADIUS_EXP;
}

export interface ImpulseParams {
  power: number; // 0..1
  radius: number; // current Bur radius
  stunned: boolean;
  /** Product of chargeMul from force fields (medusa fría) and REST_STICKY_IMPULSE_MUL when leaving a sticky ceiling. */
  externalMul: number;
}

/**
 * impulse = (IMPULSE_MIN + p * (IMPULSE_MAX - IMPULSE_MIN))
 *         * (radius / RADIUS_BASE) ^ IMPULSE_RADIUS_EXP
 *         * (stunned ? STUN_IMPULSE_MUL : 1) * externalMul
 */
export function impulseMagnitude(p: ImpulseParams, t: Tuning): number {
  const power = clamp(p.power, 0, 1);
  const base = t.IMPULSE_MIN + power * (t.IMPULSE_MAX - t.IMPULSE_MIN);
  return base * pressureMultiplier(p.radius, t) * (p.stunned ? t.STUN_IMPULSE_MUL : 1) * p.externalMul;
}

/** Everything outside the pull that scales a shot: the ledge it leaves and the water it leaves into. */
export interface ShotParams extends Omit<ImpulseParams, 'externalMul'> {
  /** True when Bur is launching off a `pegajosa` ceiling (§2.3: REST_STICKY_IMPULSE_MUL). */
  sticky: boolean;
  /** `env.chargeMul` of the sampled force fields (medusa fría). */
  chargeMul: number;
  /** `env.impulseMul` of the sampled force fields. */
  impulseMul: number;
}

/**
 * THE launch impulse (§11.4): the magnitude `bubbleStep.launch` assigns to the velocity, and therefore
 * the magnitude the dotted guide of §2.7 must start from for its promise of an arc "exacta hasta el
 * primer rebote" to mean anything. It lives here, on its own, because it was written twice — once in
 * the state machine and once in `game/aimPreview.ts` — and two copies of a rule are two rules.
 */
export function launchImpulse(p: ShotParams, t: Tuning): number {
  const externalMul = p.chargeMul * (p.sticky ? t.REST_STICKY_IMPULSE_MUL : 1);
  return impulseMagnitude({ power: p.power, radius: p.radius, stunned: p.stunned, externalMul }, t) * p.impulseMul;
}

/** Bur's radius in a zone with no reinflate active: RADIUS_BASE * ZONE_RADIUS_PCT[zone] (§2.6). */
export function zoneRadius(zone: ZoneIndex, t: Tuning): number {
  const pct = t.ZONE_RADIUS_PCT[zone] ?? 1;
  return t.RADIUS_BASE * pct;
}

/**
 * Effective impulse at FULL pull for a zone, with no stun and no external multipliers: the single
 * number of the §2.2 "impulso efectivo" table, and the one the level validator reasons about. There
 * is no bracket around it any more — with the fine tune gone, a full pull is a full pull.
 */
export function impulseForZone(zone: ZoneIndex, t: Tuning): number {
  return impulseMagnitude({ power: 1, radius: zoneRadius(zone, t), stunned: false, externalMul: 1 }, t);
}
