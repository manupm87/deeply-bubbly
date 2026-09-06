/**
 * Putting Bur back in the water (GDD §2.4). The chain that CHOOSES the point lives in `run/respawn.ts`;
 * what lives here is the pose she arrives in, identical for the two callers — the resaca respawn
 * (§2.4.2) and the "Otra vez" restart (§2.4) — so the two can never drift apart.
 *
 * Air is deliberately not touched: the resaca has already charged its pip and the restart refills to
 * AIR_START, and both of those are decisions of their own caller.
 */
import type { Tuning } from '../tuning';
import type { Bubble, GameEvent } from '../types';
import type { RespawnPoint } from '../run/respawn';

/**
 * Places Bur at `point` with velocity 0, IDLE and INVULN_MS of grace (§2.4.2, verbatim: "reaparece con
 * velocidad 0 en el mejor anclaje disponible, con 700 ms de invulnerabilidad").
 *
 * `holdLatched` is set, not cleared: the finger that pressed "Otra vez" — or that was still on the glass
 * through a resaca — has already had its gesture, and D2 gives one gesture per contact. Without it the
 * tap that restarts the run would immediately open the aim for the next shot.
 */
export function placeBubble(bubble: Bubble, point: RespawnPoint, nowMs: number, t: Tuning): GameEvent[] {
  // D2 gives a gesture exactly three endings and all three are events. A respawn taken mid-pull —
  // the resaca of §2.4.2, or "Otra vez" — is a fourth way for one to end, so it reports the cancel
  // rather than clearing the fields underneath the shell's rubber band in silence.
  const events: GameEvent[] = bubble.aimOrigin === null ? [] : [{ type: 'aimCancel', reason: 'displaced' }];
  bubble.pos = { x: point.pos.x, y: point.pos.y };
  bubble.vel = { x: 0, y: 0 };
  bubble.state = 'IDLE';
  bubble.deadMs = 0;
  bubble.restMs = 0;
  bubble.launchedMs = 0;
  bubble.aimOrigin = null;
  bubble.aimMs = 0;
  bubble.pullDist = 0;
  bubble.pullTheta = 0;
  bubble.aimValid = true;
  bubble.cancelZone = false;
  // DECISIONS-v1.2 D1: the double jump is per airborne phase, and a respawn starts a new one.
  bubble.airLaunchesUsed = 0;
  bubble.holdLatched = true;
  bubble.restingOnId = null;
  bubble.lastRestingCeilingId = null;
  bubble.bounceChain = 0;
  bubble.bounceChainBodies.length = 0;
  if (bubble.passThrough !== undefined) bubble.passThrough.length = 0;
  bubble.flags.invulnUntil = nowMs + t.INVULN_MS;
  bubble.flags.stunUntil = 0;
  bubble.flags.resacaUntil = 0;
  bubble.flags.trapVentAt = 0;
  // A teleport ends the windows that belong to the place she left: the ascenso of §4.3 (which widens
  // the camera recall band to 640 px and suspends the resaca) cannot survive a checkpoint she is not
  // inside a fumarola at, and §2.6's REINFLATED radius belongs to the bag she popped back there.
  // `GameWorld.endAscenso` closes the event pair; clearing the stamp is this file's half.
  bubble.flags.ascensoUntil = 0;
  bubble.flags.reinflateUntil = 0;
  // §2.4.4: the passive pressure clock restarts at the checkpoint, like every other per-attempt clock.
  bubble.pressureDrainMs = 0;
  events.push({ type: 'respawn', at: { x: point.pos.x, y: point.pos.y }, anchorKind: point.kind });
  return events;
}
