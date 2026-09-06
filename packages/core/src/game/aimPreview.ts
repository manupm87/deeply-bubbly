/**
 * The dotted aim guide (GDD §2.7). It is "exacta hasta el primer rebote" only if the velocity it starts
 * from is the velocity the release would assign, so this file reproduces the launch impulse of §11.4
 * and hands it to `predictTrajectory`, which runs the very same `physicsStep` the player will (§10.3).
 *
 * Force fields are passed as `[]` on purpose: §2.7 keeps them out of the guide in every zone, assisted
 * mode included, because reading currents is the skill the ramp is made of. Their multipliers still
 * apply to the impulse — that part is felt at the fingertip, not drawn.
 */
import { chargePower, impulseMagnitude } from '../control/charge';
import { launchVelocity } from '../control/aim';
import { predictTrajectory, sampleDots } from '../control/trajectory';
import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { Bubble, EntityId, SolidEntity, ZoneIndex } from '../types';
import type { ReadonlyPhysicsEnv } from '../physics/forceFields';

/**
 * Impulse the current hold would produce if released now (§11.4, §2.3's sticky ledge included).
 *
 * NOTE for whoever touches `bubbleStep.launch` next: those five lines and these are the same rule, and
 * §2.7's promise of an exact arc is exactly the statement that they agree. The clean fix is to export
 * this function from `bubble/bubbleStep.ts` and have `launch` call it; that file was owned by another
 * module while this one was written, so the duplication is flagged here instead of made silently.
 */
export function holdImpulse(
  bubble: Bubble,
  solids: readonly SolidEntity[],
  env: ReadonlyPhysicsEnv,
  nowMs: number,
  t: Tuning,
): number {
  const ceiling = solids.find((s) => s.id === bubble.restingOnId && s.type === 'ceiling');
  const sticky = ceiling !== undefined && ceiling.type === 'ceiling' && ceiling.kind === 'pegajosa';
  const magnitude = impulseMagnitude(
    {
      power: chargePower(bubble.chargeMs, t),
      dragDist: bubble.dragDist,
      radius: bubble.radius,
      stunned: nowMs < bubble.flags.stunUntil,
      externalMul: env.chargeMul * (sticky ? t.REST_STICKY_IMPULSE_MUL : 1),
    },
    t,
  );
  return magnitude * env.impulseMul;
}

/**
 * The bodies the guide must be drawn against: the ones Bur is actually going to collide with.
 * `bubbleStep` moves her with `ignoreIds = passThroughIds(bubble)` — the trampoline cooldown of §2.2
 * ("tras rebotar en una medusa, esa medusa se desinfla y Bur la atraviesa", 600 ms) and the ceiling she
 * has just launched from (§11.3, LAUNCH_LOCK_MS) — so a guide that kept them would draw a bounce off a
 * body the physics passes straight through: the one case in which §2.7's "exacta hasta el primer
 * rebote" is guaranteed to be a lie, and the case §2.2 makes routine.
 *
 * Removing them from the list is the same thing `PhysicsStepOptions.ignoreIds` does, expressed with
 * what `predictTrajectory` accepts today. The expiry test mirrors `bubbleStep`'s pruning (`until >
 * nowMs`), so the guide and the step agree on the world AT THIS INSTANT; a pass-through that expires
 * mid-arc is past the first bounce, which §2.7 already calls "difusa".
 * The array itself is returned untouched in the common case (nothing to pass through), so a charging
 * step allocates nothing.
 */
export function collidableSolids(
  bubble: Bubble,
  solids: readonly SolidEntity[],
  nowMs: number,
): readonly SolidEntity[] {
  const list = bubble.passThrough;
  if (list === undefined || list.length === 0) return solids;
  const ids = new Set<EntityId>();
  for (const entry of list) if (entry.until > nowMs) ids.add(entry.id);
  if (ids.size === 0) return solids;
  return solids.filter((s) => !ids.has(s.id));
}

/** Number of dots the current zone draws (§2.6 table, §2.7: 6 → 2 from Z1 to Z6). */
export function trajectoryDots(zone: ZoneIndex, t: Tuning): number {
  return t.TRAJECTORY_DOTS[zone] ?? t.TRAJECTORY_DOTS[t.TRAJECTORY_DOTS.length - 1] ?? 0;
}

/** The `trajectoryDots(zone)` points of the guide, or [] when there is no hold to preview. */
export function previewTrajectory(
  bubble: Bubble,
  solids: readonly SolidEntity[],
  env: ReadonlyPhysicsEnv,
  zone: ZoneIndex,
  nowMs: number,
  t: Tuning,
): Vec2[] {
  // The sticky-ledge multiplier reads the ceiling Bur hangs from, which is never a body she passes
  // through, so the impulse is measured against the full list and the ARC against the collidable one.
  const vel = launchVelocity(bubble.aimTheta, holdImpulse(bubble, solids, env, nowMs, t));
  const points = predictTrajectory(
    {
      start: bubble.pos,
      vel,
      radius: bubble.radius,
      solids: collidableSolids(bubble, solids, nowMs),
      fields: [],
      timeMs: nowMs,
    },
    t,
  );
  return sampleDots(points, trajectoryDots(zone, t));
}
