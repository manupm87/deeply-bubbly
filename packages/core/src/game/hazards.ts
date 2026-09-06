/**
 * Hazard contacts (GDD §2.4.1) and the one trap of the catalogue, the Anémona Pegajosa (§2.4.5, §5 nº 7).
 *
 * Air is never touched here: every pip goes through `applyAirLoss` → `bubble/air.ts`, which owns
 * invulnerability, the shell shield and the death transition. What DOES live here, because only the
 * caller knows the hazard's geometry (see the note in `air.ts`), is the §2.4.1 pushback and the trap's
 * hold/vent clock.
 */
import { circleRectOverlap } from '../math/vec';
import { movingRectAt } from '../physics/collision';
import { applyAirLoss } from '../bubble/bubbleStep';
import type { Rect, Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { Bubble, EntityId, GameEvent, Hazard, RunState } from '../types';

/** The charge that buys an escape from the anemone (§2.4.5: "escapar cuesta una carga del 60%"). */
export const TRAP_ESCAPE_POWER = 0.6;

/** Live state of the single trap Bur can be inside. Owned by `GameWorld`, mutated here. */
export interface TrapState {
  /** Hazard currently holding Bur, or null. */
  hazardId: EntityId | null;
  /**
   * Simulation time until which she cannot ACT (§5 nº 7: "atrapa 0,8 s"). `GameWorld` suppresses the
   * pointer while it runs; the physical hold itself lasts as long as the overlap, not this stamp.
   */
  pinUntil: number;
  /** Where she was caught; the pin restores it every step so buoyancy cannot drag her out for free. */
  pos: Vec2 | null;
  /**
   * Hazard she has just escaped or been vented by. She is still geometrically inside it for a few
   * steps, and re-arming the trap on the very next step would make the escape §2.4.5 sells impossible.
   * Cleared as soon as she is out of that hazard.
   */
  escapedFrom: EntityId | null;
  /**
   * Trap that has just SPENT its pip, and the time until which it may not close again (§5 nº 7:
   * "recurso, no muerte"). `escapedFrom` is not enough on its own: it ends with the overlap, and an
   * anemone growing on a ledge is directly below the point the vent leaves Bur in, so the very next
   * launch drops her back into the same crown. Without a cooldown that is a pip every TRAP_VENT_MS
   * until the bar is empty — the anemone becomes the deadliest thing in the game, which is the exact
   * opposite of what the catalogue promises. The jellyfish (§5 nº 1) deflates after a bounce for the
   * same reason; this is the trap's `bounceCooldownMs`.
   */
  spentId: EntityId | null;
  spentUntil: number;
}

export function createTrapState(): TrapState {
  return { hazardId: null, pinUntil: 0, pos: null, escapedFrom: null, spentId: null, spentUntil: 0 };
}

/** Back to "no trap in progress and nothing spent": a respawn, a restart, a new run. */
export function resetTrapState(trap: TrapState): void {
  trap.hazardId = null;
  trap.pinUntil = 0;
  trap.pos = null;
  trap.escapedFrom = null;
  trap.spentId = null;
  trap.spentUntil = 0;
}

/** Whether `hazard` may close on Bur right now: not the one she just left, and not one still spent. */
function canArm(trap: TrapState, hazard: Hazard, nowMs: number): boolean {
  if (hazard.id === trap.escapedFrom) return false;
  return !(hazard.id === trap.spentId && nowMs < trap.spentUntil);
}

export interface HazardStepInput {
  hazards: readonly Hazard[];
  nowMs: number;
}

export interface HazardStepResult {
  events: GameEvent[];
  /** Hazard that connected this step (telemetry), or null. */
  hitId: EntityId | null;
  /** True when this step's air loss emptied the bar. */
  died: boolean;
}

/**
 * Duty cycle of a periodic hazard (§11.2): no `periodMs` means always dangerous; otherwise the cycle
 * phase `((now + phaseMs) mod period) / period` must fall inside `activeFraction` (default 1).
 * `tellMs` is the warning window the renderer draws and costs nothing here.
 */
export function hazardActiveAt(hazard: Hazard, nowMs: number): boolean {
  const period = hazard.periodMs;
  if (period === undefined || !(period > 0)) return true;
  const fraction = hazard.activeFraction ?? 1;
  if (!(fraction > 0)) return false;
  if (fraction >= 1) return true;
  const raw = (nowMs + (hazard.phaseMs ?? 0)) % period;
  const phase = (raw + period) % period; // a negative phaseMs must not flip the cycle
  return phase / period < fraction;
}

/** Current rect of a (possibly moving) hazard: the same oscillation solids use (§11.2). */
export function hazardRectAt(hazard: Hazard, nowMs: number): Rect {
  return movingRectAt(hazard.shape, hazard.moving, nowMs);
}

export function hazardOverlaps(bubble: Bubble, hazard: Hazard, nowMs: number): boolean {
  return hazardActiveAt(hazard, nowMs) && circleRectOverlap(bubble.pos, bubble.radius, hazardRectAt(hazard, nowMs));
}

/**
 * §2.4.1: "empujón de 120 px/s en dirección contraria". It ASSIGNS the component it owns and leaves the
 * other one alone — the same rule as the launch (§2.2), and for the same reason: a pushback that
 * accumulated would stack across the invulnerability window into a launch nobody asked for.
 * `pushImpulse` overrides HIT_PUSHBACK; `pushDir` picks the axis ('up' only exists for catalogId 20/21,
 * §11.7.9, and is a data invariant the validator checks, not something to re-test here).
 */
export function applyPushback(bubble: Bubble, rect: Rect, hazard: Hazard, t: Tuning): void {
  const speed = hazard.pushImpulse ?? t.HIT_PUSHBACK;
  if (!(speed > 0)) return;
  switch (hazard.pushDir) {
    case 'lateral': {
      const centreX = rect.x + rect.w / 2;
      bubble.vel = { x: (bubble.pos.x < centreX ? -1 : 1) * speed, y: bubble.vel.y };
      break;
    }
    case 'down':
      bubble.vel = { x: bubble.vel.x, y: speed };
      break;
    case 'up':
      bubble.vel = { x: bubble.vel.x, y: -speed };
      break;
  }
}

/**
 * Ends the trap because Bur launched out of it (§2.4.5: a charge of 60 % or more). The hazard is
 * remembered as `escapedFrom` so the very next step, in which she is still inside its rect, does not
 * catch her again.
 */
export function escapeTrap(bubble: Bubble, trap: TrapState): void {
  if (trap.hazardId === null) return;
  trap.escapedFrom = trap.hazardId;
  clearTrap(bubble, trap);
}

function clearTrap(bubble: Bubble, trap: TrapState): void {
  trap.hazardId = null;
  trap.pinUntil = 0;
  trap.pos = null;
  bubble.flags.trapVentAt = 0;
}

/**
 * One step of hazard contacts. Order: trap first (it owns Bur's position while it holds her), then at
 * most ONE damaging contact — the invulnerability window `loseAir` opens makes every further hazard of
 * the same step a no-op anyway, and letting them through would stack pushbacks from three directions.
 */
export function stepHazards(
  bubble: Bubble,
  run: RunState,
  trap: TrapState,
  input: HazardStepInput,
  t: Tuning,
): HazardStepResult {
  const events: GameEvent[] = [];
  const out: HazardStepResult = { events, hitId: null, died: false };
  if (bubble.state === 'DEAD') return out;

  const overlapping = input.hazards.filter((h) => hazardOverlaps(bubble, h, input.nowMs));

  // The escape grace ends the moment she is out of the hazard she escaped, never on a timer.
  if (trap.escapedFrom !== null && !overlapping.some((h) => h.id === trap.escapedFrom)) trap.escapedFrom = null;

  const held = trap.hazardId === null ? undefined : overlapping.find((h) => h.id === trap.hazardId);
  if (trap.hazardId !== null && held === undefined) clearTrap(bubble, trap);

  const active = held ?? beginTrap(bubble, trap, overlapping, input.nowMs, t);
  if (active !== undefined) {
    if (trap.pos !== null) {
      // §2.4.5 and §5 nº 7: the anemone HOLDS her. "Escapar cuesta una carga del 60%" is a sentence
      // about the ONLY way out, so the pin lasts as long as the overlap does — not TRAP_HOLD_MS.
      // Buoyancy alone lifts Bur ~21 px in the 700 ms between TRAP_HOLD_MS and TRAP_VENT_MS, which is
      // more than a 16 px anemone is tall: a pin that stopped at the hold would let her leave for
      // free and the fifth way to lose Air (§2.4) would be unreachable.
      // Restoring the caught position (not just the velocity) matters for the same reason: buoyancy
      // displaces her a little inside every step before this runs.
      // TRAP_HOLD_MS keeps its own job, the one §5 nº 7 gives it: it is how long she cannot ACT
      // (`GameWorld` suppresses input while it runs), after which the ≈330 ms of a 60 % charge still
      // "cabe de sobra en la ventana de 1,5 s".
      bubble.pos = { x: trap.pos.x, y: trap.pos.y };
      bubble.vel = { x: 0, y: 0 };
    }
    const ventAt = bubble.flags.trapVentAt;
    if (ventAt > 0 && input.nowMs >= ventAt) {
      // The fifth way to lose Air (§2.4.5). Venting also frees her: the anemone has had its pip.
      const change = applyAirLoss(bubble, run, 'trap', bubble.pos, input.nowMs, t);
      events.push(...change.events);
      out.died = change.died;
      trap.escapedFrom = active.id;
      // It has had its pip: it stays open for TRAP_REARM_MS, so the escape is a cost and never a loop.
      trap.spentId = active.id;
      trap.spentUntil = input.nowMs + t.TRAP_REARM_MS;
      clearTrap(bubble, trap);
      if (change.died) return out;
    }
  }

  for (const hazard of overlapping) {
    if (hazard.trap === true) continue; // The anemone's cost is its vent, never a contact hit too.
    const change = applyAirLoss(bubble, run, 'hit', bubble.pos, input.nowMs, t);
    events.push(...change.events);
    // Nothing happened: she is invulnerable, so neither this hazard nor any other can connect now.
    if (change.events.length === 0) break;
    out.hitId = hazard.id;
    out.died = change.died;
    if (change.died) return out;
    detachOnHit(bubble, events);
    applyPushback(bubble, hazardRectAt(hazard, input.nowMs), hazard, t);
    break;
  }

  return out;
}

/** Arms the trap on the first non-escaped trap hazard Bur overlaps. */
function beginTrap(
  bubble: Bubble,
  trap: TrapState,
  overlapping: readonly Hazard[],
  nowMs: number,
  t: Tuning,
): Hazard | undefined {
  const hazard = overlapping.find((h) => h.trap === true && canArm(trap, h, nowMs));
  if (hazard === undefined) return undefined;
  trap.hazardId = hazard.id;
  trap.pinUntil = nowMs + t.TRAP_HOLD_MS;
  trap.pos = { x: bubble.pos.x, y: bubble.pos.y };
  bubble.flags.trapVentAt = nowMs + t.TRAP_VENT_MS;
  return hazard;
}

/**
 * §2.4.1 pushes Bur "en dirección contraria", which is impossible while a ceiling holds her: `stepBubble`
 * re-pins an attached Bur to the ledge every step, so the impulse would be silently eaten. The hit
 * displaces her instead — that is exactly what `restRelease: 'displaced'` names. A hold in progress is
 * NOT cancelled: §11.3 keeps the input accepted while STUNNED, only the impulse drops to 60 %.
 */
function detachOnHit(bubble: Bubble, events: GameEvent[]): void {
  if (bubble.restingOnId === null) return;
  if (bubble.state === 'RESTING') bubble.state = 'IDLE';
  bubble.restingOnId = null;
  bubble.restMs = 0;
  events.push({ type: 'restRelease', reason: 'displaced' });
}
