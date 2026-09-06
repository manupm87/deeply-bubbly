/**
 * A headless autoplayer: the finger the content tests use to prove a zone can actually be crossed.
 *
 * **Why it aims.** Until DECISIONS-v1.2 the game could be played by a metronome — the world was one
 * 180 px chute with solid walls, so a shot at any angle bounced its way down. D1 ("el juego premia
 * calcular el tiro"), D3 (540 px of open water) and D4 (a full pull descends 195 px, not 362) together
 * removed that: a shot that lands is now a shot that was chosen, and a shot that misses floats up
 * through empty water until the resaca takes a pip. A fixed-cadence finger therefore measures nothing
 * about the level any more — it measures only that random shots miss, which they do by design.
 *
 * So this bot does the one thing the player does that a metronome cannot: before every launch it picks
 * the shot, with the SAME search the validator certifies levels with (`findReachTrajectory`, which
 * itself loops over `physicsStep`). Everything else about it stays naive — it never corrects in the air,
 * never spends the double jump, never collects anything, and falls back to a fixed cadence when it
 * cannot find a certificate. What it proves is exactly the interesting claim: authored content plus the
 * D2 gesture plus `GameWorld`'s step order add up to a zone a player can descend.
 *
 * It reads nothing but the `WorldSnapshot`, so it sees what the player sees: streamed entities, the live
 * camera, and Bur.
 */
import { DEFAULT_TUNING } from '../tuning';
import { clamp } from '../math/vec';
import { findLandingLines, findReachTrajectory, sideWalls } from '../level/validator';
import { POINTER_UP, pullGesture } from './testHarness';
import type { Tuning } from '../tuning';
import type { Vec2 } from '../math/vec';
import type { Anchor, ForceField, Hazard, PointerInput, SolidEntity, WorldSnapshot } from '../types';

/** How long the finger draws the sling, and how long it stays up between shots (ms). */
const PULL_MS = 250;
const RELEASE_MS = 250;

/** Fraction of the press spent extending the sling; the rest holds it at full stretch before release. */
const RAMP_FRACTION = 0.6;

/** Smallest drop that counts as "below": an anchor level with Bur is the one she is already resting on. */
const BELOW_EPS_PX = 12;

/** Slack around the straight line of a hop when deciding whether a hazard could be on it (px). */
const FLIGHT_BAND_PX = 80;

/** Margin under `AIM_MAX_MS` at which the bot lets go even if the window never opened. */
const AIM_MARGIN_MS = 500;

/** Vertical slack around the flight used to build the side walls the search flies against. */
const CONTEXT_PX = 400;

/**
 * How long after the release the arc is still inside a hazard's reach. §5 nº 5 sells Don Hinchón as a
 * rhythm gate — "contrarrestado … en su ventana de 1,2 s desinflado" — and this is the whole of the
 * bot's sense of rhythm: it draws the sling so that the RELEASE, not the press, falls at the top of the
 * deflated window, which is exactly what the tell (`tellMs`) is telling the player to do.
 */
const HAZARD_FLIGHT_MS = 1000;

/** How near a periodic hazard has to be for the bot to bother waiting for it (px). */
const HAZARD_WATCH_PX = 260;

/** The shot the bot plays when no certificate is found: the naive cadence, alternating sides. */
const FALLBACK_POWER = 0.7;
const FALLBACK_DEG = 30;

/** One chosen shot: the pull the finger will draw. */
export interface Shot {
  power: number;
  thetaDeg: number;
}

/**
 * The shot that lands on the next rest point below Bur, found with the validator's own search, or null
 * when there is nothing under her to aim at. Exported because it is the whole of the bot's "skill" and
 * every tool that wants to autoplay — the headless tests, the shell's screenshot bot — needs exactly
 * this and nothing else of `GuidedFinger`.
 *
 * `cutCorners` takes the line a crown is ON when one exists: the greedy player, for the tests that have
 * to prove §5 nº 6 and nº 7 still bite.
 */
export function pickShot(snapshot: WorldSnapshot, t: Tuning = DEFAULT_TUNING, cutCorners = false): Shot | null {
  const from = snapshot.bubble.pos;
  const target = nextAnchorBelow(snapshot, from);
  if (target === undefined) return null;

  const solids: SolidEntity[] = [...sideWalls(from.y - CONTEXT_PX, target.pos.y + CONTEXT_PX, t)];
  const fields: ForceField[] = [];
  const hazards: Hazard[] = [];
  for (const e of snapshot.entities) {
    if (e.type === 'ceiling' || e.type === 'wall') solids.push(e);
    else if (e.type === 'forcefield') fields.push(e);
    else if (e.type === 'hazard' && inFlightBand(e, from, target.pos)) hazards.push(e);
  }
  // With nothing to dodge, the first certificate is the answer, and that is the cheap search: it stops
  // at the first arc that lands. Only where §5 nº 6 or nº 7 could be ON that arc is it worth
  // enumerating every line and taking one, which is the decision the zone is asking for and which a
  // player reads off the dotted guide (§2.7). Same integrator either way.
  if (hazards.length === 0) {
    const found = findReachTrajectory(from, target.pos, snapshot.zone, solids, t, target.ceilingId, fields);
    return found.ok ? { power: found.power, thetaDeg: found.thetaDeg } : null;
  }
  const lines = findLandingLines(from, target.pos, snapshot.zone, solids, t, target.ceilingId, fields, hazards);
  const wanted = cutCorners ? lines.find((l) => l.touchesHazard) : lines.find((l) => !l.touchesHazard);
  const chosen = wanted ?? lines[0];
  return chosen === undefined ? null : { power: chosen.power, thetaDeg: chosen.thetaDeg };
}

/** The rest point `pickShot` aims at: the shallowest one strictly below Bur. */
export function autoPlayerTarget(snapshot: WorldSnapshot): Anchor | undefined {
  return nextAnchorBelow(snapshot, snapshot.bubble.pos);
}

/**
 * A finger that aims. Drive it once per frame from a fresh snapshot — it needs the live camera to place
 * the pointer, and the live entities to choose the shot.
 */
export class GuidedFinger {
  /** ms the finger has been down on the current contact; null while it is up. */
  private drawMs: number | null = null;
  /** ms left of the pause between shots. */
  private restMs = 0;
  /** Viewport point of the pointerdown, held for the whole contact. */
  private origin: Vec2 = { x: 0, y: 0 };
  /** The shot being drawn, chosen once per contact. */
  private shot: Shot = { power: FALLBACK_POWER, thetaDeg: FALLBACK_DEG };
  /** Flips the fallback shot's side, so a bot with no certificate still tries both ways. */
  private swing = 1;
  /** The rung the last shot was aimed at. */
  private lastTargetId: string | null = null;
  /** Rungs whose crown has already taken a pip: a corner is cut once, and then it is learnt. */
  private readonly burnt = new Set<string>();

  /**
   * @param t tuning to play with.
   * @param cutCorners on the FIRST try at each rung, take the line a crown is ON whenever one exists —
   *   the player who cuts every corner, pays for it, and then plays the hop straight. It is how a test
   *   can prove §5 nº 6 and nº 7 still bite without asking a metronome, which since D4 misses everything
   *   and therefore proves nothing. Cutting the same corner for ever is not a player, it is a stall.
   */
  constructor(
    private readonly t: Tuning = DEFAULT_TUNING,
    private readonly cutCorners = false,
  ) {}

  /** Next pointer sample for this frame. */
  next(frameDtMs: number, snapshot: WorldSnapshot): PointerInput {
    const dt = Math.max(0, frameDtMs);
    this.learn(snapshot);
    if (this.drawMs === null) return this.whileUp(dt, snapshot);

    // A gesture the world took away (a capture, an impaciente ledge, a trap): drop it and start over.
    if (snapshot.bubble.state !== 'AIMING' && snapshot.bubble.state !== 'RESTING') {
      this.drawMs = null;
      this.restMs = RELEASE_MS;
      return POINTER_UP;
    }

    this.drawMs += dt;
    const drawn = this.drawMs >= PULL_MS;
    // D2 freezes the posadero's anti-camping clock while the sling is drawn, and that is what buys the
    // wait: the bot holds the shot until Don Hinchón deflates instead of standing on the ledge until it
    // is thrown off. `AIM_MAX_MS` is the cap, so it always lets go with room to spare.
    const expiring = this.drawMs >= this.t.AIM_MAX_MS - AIM_MARGIN_MS;
    if (drawn && (expiring || windowIsOpen(snapshot, this.t))) {
      this.drawMs = null;
      this.restMs = RELEASE_MS;
      return POINTER_UP;
    }
    const stretch = clamp(this.drawMs / Math.max(1, PULL_MS * RAMP_FRACTION), 0, 1);
    const pull = pullGesture(this.shot.power * stretch, this.shot.thetaDeg, this.t);
    return { down: true, x: this.origin.x + pull.x, y: this.origin.y + pull.y };
  }

  /**
   * A crown that has just cost a pip is a crown this bot will not meet twice. Without it a corner-cutter
   * is not a player at all: it pays the same anemone every time it comes back and drowns in front of it.
   */
  private learn(snapshot: WorldSnapshot): void {
    if (this.lastTargetId === null) return;
    for (const e of snapshot.events) {
      if (e.type === 'airLost' && (e.reason === 'trap' || e.reason === 'hit')) this.burnt.add(this.lastTargetId);
    }
  }

  /** The finger is up: count the pause down, and open a new contact the moment Bur has a ledge. */
  private whileUp(dt: number, snapshot: WorldSnapshot): PointerInput {
    if (this.restMs > 0) {
      this.restMs -= dt;
      return POINTER_UP;
    }
    if (snapshot.bubble.state !== 'RESTING') return POINTER_UP;
    this.origin = { x: snapshot.bubble.pos.x - snapshot.camera.x, y: snapshot.bubble.pos.y - snapshot.camera.y };
    this.shot = this.chooseShot(snapshot);
    this.drawMs = 0;
    return { down: true, x: this.origin.x, y: this.origin.y };
  }

  /** The shot for this contact: `pickShot`, plus the bot's own memory of the corners it has paid for. */
  private chooseShot(snapshot: WorldSnapshot): Shot {
    this.swing = -this.swing;
    const fallback: Shot = { power: FALLBACK_POWER, thetaDeg: FALLBACK_DEG * this.swing };
    const target = autoPlayerTarget(snapshot);
    if (target === undefined) {
      this.lastTargetId = null;
      return fallback;
    }
    const learnt = target.id === this.lastTargetId || this.burnt.has(target.id);
    this.lastTargetId = target.id;
    return pickShot(snapshot, this.t, this.cutCorners && !learnt) ?? fallback;
  }
}

/** Whether `hazard` sits anywhere the arc from `from` to `to` could plausibly pass. */
function inFlightBand(hazard: Hazard, from: Vec2, to: Vec2): boolean {
  const b = hazard.shape;
  if (b.y + b.h < from.y - FLIGHT_BAND_PX || b.y > to.y + FLIGHT_BAND_PX) return false;
  const left = Math.min(from.x, to.x) - FLIGHT_BAND_PX;
  const right = Math.max(from.x, to.x) + FLIGHT_BAND_PX;
  return b.x + b.w >= left && b.x <= right;
}

/**
 * Whether every periodic hazard near Bur will still be in its safe phase for the whole flight that is
 * about to start. A hazard with no duty cycle (§5 nº 6, the urchin) is always "open": it is aim, not
 * rhythm, and nothing about waiting would help.
 */
function windowIsOpen(snapshot: WorldSnapshot, t: Tuning): boolean {
  void t;
  for (const e of snapshot.entities) {
    if (e.type !== 'hazard') continue;
    if (!isNear(e, snapshot.bubble.pos.x, snapshot.bubble.pos.y)) continue;
    if (!safeBetween(e, snapshot.timeMs, HAZARD_FLIGHT_MS)) return false;
  }
  return true;
}

/** True while `hazard` is within the band the next hop crosses. */
function isNear(hazard: Hazard, x: number, y: number): boolean {
  const cx = hazard.shape.x + hazard.shape.w / 2;
  const cy = hazard.shape.y + hazard.shape.h / 2;
  return Math.abs(cx - x) <= HAZARD_WATCH_PX && cy > y - HAZARD_WATCH_PX && cy < y + HAZARD_WATCH_PX;
}

/** True when `hazard` stays in its deflated phase over the whole window `[fromMs, fromMs + lengthMs]`. */
function safeBetween(hazard: Hazard, fromMs: number, lengthMs: number): boolean {
  const period = hazard.periodMs;
  const active = hazard.activeFraction;
  if (period === undefined || active === undefined || !(period > 0)) return true;
  const activeMs = period * active;
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const at = fromMs + (lengthMs * i) / steps;
    const phase = (((at + (hazard.phaseMs ?? 0)) % period) + period) % period;
    if (phase < activeMs) return false;
  }
  return true;
}

/** The shallowest declared rest point strictly below `from` among the entities currently streamed in. */
function nextAnchorBelow(snapshot: WorldSnapshot, from: Vec2): Anchor | undefined {
  let best: Anchor | undefined;
  for (const e of snapshot.entities) {
    if (e.type !== 'anchor' || e.pos.y <= from.y + BELOW_EPS_PX) continue;
    if (best === undefined || e.pos.y < best.pos.y) best = e;
  }
  return best;
}
