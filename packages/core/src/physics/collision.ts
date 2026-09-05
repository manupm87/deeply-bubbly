import type { Rect, Vec2 } from '../math/vec';
import type { Contact, ContactFace, SolidEntity } from '../types';

/** Result of sweeping a circle along a displacement against one AABB. */
export interface SweepHit {
  /** Fraction of the displacement at which contact happens, in [0, 1]. */
  t: number;
  face: ContactFace;
  normal: Vec2;
  point: Vec2;
}

/**
 * Swept circle vs AABB (§11.4 "barrido"): finds the earliest time of impact of a circle of radius `r`
 * moving from `c0` by `delta` against `rect`. Returns null when there is no contact within the sweep.
 * Must be exact for face hits and handle corners (Minkowski expansion: rounded rectangle).
 * A circle already overlapping the rect at t=0 returns t=0 with the normal of the least-penetration face.
 */
export function sweepCircleAabb(c0: Vec2, r: number, delta: Vec2, rect: Rect): SweepHit | null {
  void c0; void r; void delta; void rect;
  throw new Error('not implemented');
}

export interface MotionResult {
  pos: Vec2;
  vel: Vec2;
  contacts: Contact[];
}

export interface MotionOptions {
  /** Restitution override per body id (e.g. jellyfish trampoline); default = body.restitution. */
  lateralFriction: number;
  /** Ids of bodies to ignore this tick (trampoline cooldown, dissolved snow, rest-exit lock). */
  ignoreIds?: ReadonlySet<string>;
  timeMs: number;
  /** Max number of successive contacts resolved within one tick (default 4). */
  maxIterations?: number;
}

/**
 * Moves the circle by vel*dt through `solids`, resolving up to `maxIterations` successive contacts.
 * On each contact: position is placed at the impact point (minus a tiny epsilon), the normal component
 * of velocity is reflected scaled by the body's restitution, the tangential component is scaled by
 * (1 - lateralFriction). Remaining time fraction continues the sweep. No tunneling at any speed.
 * The caller (bubbleStep) decides whether a 'bottom'-face contact becomes RESTING instead of a bounce:
 * it does so by passing the contact back through `captureAtContact` semantics (see bubbleStep).
 */
export function moveCircle(
  pos: Vec2,
  vel: Vec2,
  r: number,
  dt: number,
  solids: readonly SolidEntity[],
  opts: MotionOptions,
): MotionResult {
  void pos; void vel; void r; void dt; void solids; void opts;
  throw new Error('not implemented');
}

/** Current rect of a possibly-moving solid at simulation time `timeMs` (kinematic oscillation). */
export function solidRectAt(solid: SolidEntity, timeMs: number): Rect {
  void solid; void timeMs;
  throw new Error('not implemented');
}
