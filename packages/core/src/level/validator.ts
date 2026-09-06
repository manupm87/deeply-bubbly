/**
 * Level validator (GDD §11.5). In the MVP there is no procedural assembler (§4.1): these rules run as a
 * VALIDATOR over the hand-authored sequences, in test. The generator that consumes them arrives in H3.
 *
 * The reach rule (§11.5.11, §11.7.7) is the reason this file lives next to the physics: it certifies levels
 * with the SAME integrator the player runs, never a second model. It loops over `physicsStep` — the one
 * fixed step `bubbleStep` (§11.3) and the aim guide (§2.7) both run — rather than over `predictTrajectory`,
 * because a reachability certificate has to name the CONTACT that ends the shot and the speed Bur arrives
 * with, and the player's guide throws both away (it only returns the polyline). Same physics, one more
 * return value.
 */
import { launchVelocity } from '../control/aim';
import { impulseMagnitude, zoneRadius } from '../control/charge';
import { circleRectOverlap, degToRad } from '../math/vec';
import { solidRectAt } from '../physics/collision';
import { launchLockSteps, physicsStep } from '../physics/step';
import { instantiateChunk } from './campaign';
import type { Rect, Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type {
  Anchor,
  Ceiling,
  Chunk,
  Contact,
  ForceField,
  Hazard,
  PlacedChunk,
  SolidEntity,
  Wall,
  WorldEntity,
  ZoneIndex,
} from '../types';
import type { ChunkLibrary } from './library';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  rule: string; // e.g. 'breathing', 'isolation', 'reach', 'schema', 'segmentTime', 'airBudget', 'pushDir', 'trap'
  chunkId?: string;
  message: string;
}

// ---------------------------------------------------------------------------------------------
// Reach search parameters (§11.5.11). They describe the SHOT the player is expected to find, not a
// tolerance of the physics: the physics itself is `physicsStep`.
// ---------------------------------------------------------------------------------------------

/**
 * Smallest charge power the search probes (DECISIONS-v1.2 D4). Since D2 the power IS the pull distance
 * — `p = |drag| / PULL_MAX_PX` — so the grid is uniform in what the finger asks for, and a release
 * inside PULL_CANCEL_PX (12 of 70 px, `p ≈ 0,17`) is not a shot at all: 0,2 is the first tenth above
 * the cancel radius, i.e. the weakest thing the player can actually fire.
 *
 * It is weaker in absolute terms than the old 0,1 floor was, because D4 halved the impulse range
 * (90–280 instead of 150–430): 0,2 now buys 128 px/s where 0,1 used to buy 178.
 */
const REACH_POWER_MIN = 0.2;

/** Grid step of the charge sweep (D4): a tenth of the pull, 7 px of travel on a 70 px slingshot. */
const REACH_POWER_STEP = 0.1;

/** Charge powers sampled by the reach search: `p` of §11.4, from the shortest legal tap to a full commit. */
export const REACH_POWERS: readonly number[] = buildReachPowers();

function buildReachPowers(): number[] {
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const p = REACH_POWER_MIN + i * REACH_POWER_STEP;
    if (p > 1 + 1e-9) break;
    out.push(Math.round(p * 1000) / 1000);
  }
  return out;
}

/**
 * Angular resolution of the aim sweep inside the ±AIM_CONE_DEG cone, in degrees (D4). D2 opened the
 * cone to the full 90° — horizontal-left to horizontal-right through straight down — which quadruples
 * the grid at a fixed step; 5° keeps the sweep at 37 angles while D4's shorter arcs (a full-power shot
 * now descends ≈195 px in Z1, not 362) move the landing by well under the ±(radius + tolerance) window
 * per degree, so nothing reachable falls between two samples.
 */
export const REACH_THETA_STEP_DEG = 5;

/**
 * Slack, ON TOP OF Bur's radius, between where a certified shot actually lands and the declared anchor
 * (px). `reachTolerance` is the number the rule uses: `radius + REACH_TOLERANCE_PX` = 13 px in Zone 1.
 * It is a window around a REST that Bur genuinely enters, not a fly-by distance: the certificate must
 * first satisfy §2.3 (bottom face of the target ceiling, ascending, within REST_CAPTURE_SPEED).
 */
export const REACH_TOLERANCE_PX = 6;

/** Radius of the window around an anchor a certified shot must land inside (§11.5.11). */
export function reachTolerance(zone: ZoneIndex, t: Tuning): number {
  return zoneRadius(zone, t) + REACH_TOLERANCE_PX;
}

/**
 * Ascent speed a certified arrival must still carry (px/s). §11.4 captures at `vel.y < 0`; asking for a
 * few px/s of margin keeps a certificate from resting on the last 16 ms of buoyancy — an arc that is
 * technically rising by 0.4 px/s at the touch is a fly-by the player would experience as a bounce.
 */
const REACH_MIN_ASCENT_SPEED = 5;

/**
 * Simulated horizon of one probe shot (s). It matches `DEFAULT_TRAJECTORY_SECONDS`, the horizon §2.7
 * draws for the player: a shot the aim guide can show end to end is a shot the rule may certify.
 *
 * It is not slack. Zone 1 hops are flown at p ≈ 0,10–0,25 and the medium is buoyant, so the round trip
 * — dip past the ledge, float back up under it (§2.3) — takes 1,8–2,3 s for a 55–90 px drop. Anything
 * that replays a certificate (tests included) must use the SAME horizon, hence the export.
 */
export const REACH_MAX_SECONDS = 2.5;

/** Thickness of the solid side walls the search adds outside the world column (px). */
const SIDE_WALL_THICKNESS = 40;

/**
 * Vertical slack added above the source anchor when collecting the solids a probe shot can meet (px).
 * A full chunk: a probe that misses everything floats up at TERMINAL_RISE, and it must meet the world
 * walls (and any ledge above) instead of escaping the WORLD_W column sideways.
 */
const REACH_CONTEXT_ABOVE_PX = 240;

/** Vertical slack added below the target anchor when collecting those solids (px). */
const REACH_CONTEXT_BELOW_PX = 400;

/** Tolerance (px) on where an `Anchor` sits under its ceiling: Bur's centre is exactly one radius below. */
const ANCHOR_PLACEMENT_EPS = 0.5;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const error = (rule: string, message: string, chunkId?: string): ValidationIssue =>
  chunkId === undefined ? { severity: 'error', rule, message } : { severity: 'error', rule, chunkId, message };

const warning = (rule: string, message: string, chunkId?: string): ValidationIssue =>
  chunkId === undefined ? { severity: 'warning', rule, message } : { severity: 'warning', rule, chunkId, message };

/**
 * Where Bur's centre sits when she rests under a ceiling whose box is `rect` (§2.3): exactly one radius
 * below its bottom face. The single definition of a rest pose's height — content authoring (`level/content`) and the
 * anchor-placement rule below must never re-derive it independently.
 */
export function restPoseY(rect: Rect, radius: number): number {
  return rect.y + rect.h + radius;
}

/** The axis-aligned box an entity occupies, already widened by a `moving` oscillation when it has one. */
function entityBounds(e: WorldEntity, radius: number): Rect | null {
  switch (e.type) {
    case 'ceiling':
    case 'wall':
    case 'forcefield': {
      const moving = e.type === 'ceiling' ? e.moving : undefined;
      return sweptRect(e.rect, moving?.axis, moving?.range ?? 0);
    }
    case 'hazard':
      return sweptRect(e.shape, e.moving?.axis, e.moving?.range ?? 0);
    case 'anchor':
      // An anchor is a place for Bur's CENTRE: it must leave a whole radius of water around it.
      return { x: e.pos.x - radius, y: e.pos.y - radius, w: radius * 2, h: radius * 2 };
    case 'pickup':
      return { x: e.pos.x - e.radius, y: e.pos.y - e.radius, w: e.radius * 2, h: e.radius * 2 };
    case 'boya':
    case 'station':
      return null; // markers are derived by `campaignMarkers`, not authored geometry
  }
}

/** `rect` grown by half the oscillation travel on `axis` (a moving body sweeps ±range/2, §11.2). */
function sweptRect(rect: Rect, axis: 'x' | 'y' | undefined, range: number): Rect {
  if (axis === undefined || !(range > 0)) return rect;
  const half = range / 2;
  return axis === 'x'
    ? { x: rect.x - half, y: rect.y, w: rect.w + range, h: rect.h }
    : { x: rect.x, y: rect.y - half, w: rect.w, h: rect.h + range };
}

/**
 * The two ends of a moving solid's travel, taken from `physics/collision.solidRectAt` — the single
 * source of truth for the oscillation — so an authoring rule can never disagree with what Bur hits.
 * A static solid has one "extreme": itself. The triangle wave is piecewise linear, so its two peaks
 * (u = 0.25 and u = 0.75) bound every intermediate rect on the moving axis.
 */
function travelExtremes(solid: SolidEntity): Rect[] {
  const moving = solid.type === 'ceiling' ? solid.moving : undefined;
  if (moving === undefined || !(moving.range > 0) || !(moving.speed > 0)) return [{ ...solid.rect }];
  const periodMs = ((2 * moving.range) / moving.speed) * 1000;
  const atPhase = (u: number): Rect => {
    const shifted = ((u - (moving.phase ?? 0)) % 1 + 1) % 1;
    return solidRectAt(solid, shifted * periodMs);
  };
  return [atPhase(0.25), atPhase(0.75)];
}

/** Squared distance from `p` to the segment [a, b] (the arc is sampled once per step; segments close it). */
function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

// ---------------------------------------------------------------------------------------------
// Ballistic reachability (§11.5.11, §11.7.7)
// ---------------------------------------------------------------------------------------------

export interface ReachResult {
  ok: boolean;
  /** Closest approach to the target anchor over the reported probe shot, in px. */
  bestDistance: number;
  /** Charge power of the reported (successful, or closest) probe shot. */
  power: number;
  /** Aim angle of that probe shot, in degrees from straight down (+ = right). */
  thetaDeg: number;
}

/** One candidate shot of the reach search. */
interface Probe {
  power: number;
  thetaDeg: number;
  score: number;
}

/** What one simulated probe shot did: the arc, and the contact that ended it. */
interface ProbeFlight {
  /** One point per fixed step, starting at the launch point and ending at the impact. */
  points: Vec2[];
  contact: Contact | null;
  /** Index of the step that produced `contact` (rest is ignored below `launchLockSteps`, §11.3). */
  contactStep: number;
}

/**
 * Flies one probe shot with the SAME fixed step the player runs (§10.3, §11.4): force fields → velocity
 * → swept move, once per 1/60 s, stopping at the first contact. `predictTrajectory` is the same loop with
 * the contact discarded; the reach rule needs it, so the loop is written out here.
 *
 * The `fields` really are sampled. From Zone 2 the verb of the zone IS a force field (§3.2, §5 nº 8), so
 * a certificate flown in still water would certify a line the current no longer allows — the exact class
 * of "tramo literalmente imposible" that §11.5.11 exists to rule out.
 */
function flyProbe(
  from: Vec2,
  vel: Vec2,
  radius: number,
  solids: readonly SolidEntity[],
  fields: readonly ForceField[],
  t: Tuning,
): ProbeFlight {
  const dt = t.FIXED_DT;
  const flight: ProbeFlight = { points: [{ x: from.x, y: from.y }], contact: null, contactStep: -1 };
  if (!(dt > 0)) return flight;

  const stepMs = dt * 1000;
  const steps = Math.floor(REACH_MAX_SECONDS / dt + 1e-9);
  const lockSteps = launchLockSteps(t);
  let pos: Vec2 = { x: from.x, y: from.y };
  let v: Vec2 = { x: vel.x, y: vel.y };

  for (let i = 0; i < steps; i++) {
    const launched = i < lockSteps;
    const stepped = physicsStep(
      { pos, vel: v, radius, state: launched ? 'LAUNCHED' : 'IDLE' },
      { solids, fields },
      {
        dt,
        timeMs: i * stepMs,
        lateralFriction: t.LATERAL_FRICTION,
        dampingMul: launched ? t.LAUNCH_DAMPING_MUL : 1,
        // One contact is enough: the probe is over at the first thing it touches.
        maxIterations: 1,
      },
      t,
    );
    pos = stepped.pos;
    v = stepped.vel;
    flight.points.push({ x: pos.x, y: pos.y });
    const first = stepped.contacts[0];
    if (first !== undefined) {
      flight.contact = first;
      flight.contactStep = i;
      return flight;
    }
  }
  return flight;
}

/**
 * §2.3 / §11.4 rest capture, asked of a probe shot: the shot ENDS on the bottom face of `ceilingId`,
 * which must be capturable, arriving from below (`approachSpeed` on a bottom face is exactly `-vel.y`
 * at the impact) at no more than REST_CAPTURE_SPEED, and after the LAUNCH_LOCK window — inside it §11.3
 * ignores rest altogether, so a contact there is a bounce, not a landing.
 *
 * This is the whole difference between "the arc passed near the anchor" and "the player lands there".
 */
function capturesOn(flight: ProbeFlight, ceilingId: string, t: Tuning): boolean {
  const contact = flight.contact;
  if (contact === null) return false;
  if (flight.contactStep < launchLockSteps(t)) return false;
  if (contact.bodyId !== ceilingId || contact.face !== 'bottom') return false;
  if (contact.body.type !== 'ceiling' || !contact.body.capturable) return false;
  return contact.approachSpeed >= REACH_MIN_ASCENT_SPEED && contact.approachSpeed <= t.REST_CAPTURE_SPEED;
}

/** Depth reached below the launch point at time `tau` for an initial downward speed `vy0` (§11.4). */
function freeFallDepth(vy0: number, tau: number, terminal: number, damping: number): number {
  return ((vy0 + terminal) / damping) * (1 - Math.exp(-damping * tau)) - terminal * tau;
}

/**
 * Time at which a shot launched at `vy0` comes back UP through `dy` px below the launch point, or null
 * when it never dips that deep. Analytic model of §11.4 (no solids), used only to ORDER the probes.
 */
function ascentCrossingTime(vy0: number, dy: number, terminal: number, damping: number): number | null {
  if (!(vy0 > 0)) return null;
  const tDead = Math.log1p(vy0 / terminal) / damping;
  const deepest = freeFallDepth(vy0, tDead, terminal, damping);
  if (deepest < dy) return null;
  // Past the dead point the depth decreases monotonically towards -inf: bisect for the crossing.
  let lo = tDead;
  let hi = tDead + (deepest - dy) / Math.max(1, terminal * 0.25) + 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (freeFallDepth(vy0, mid, terminal, damping) > dy) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Orders probe shots so the common case finds a line in a handful of simulations. The score is the
 * ANALYTIC horizontal error of the shot at the moment it rises back through the target's depth (§11.4,
 * no solids): the shot must dip PAST the target ceiling and float up under it (§2.3), so that crossing
 * is exactly where the landing happens. Ordering only — every candidate is still simulated if the
 * cheap ones fail.
 */
function orderedProbes(from: Vec2, to: Vec2, radius: number, t: Tuning, launchMul: number): Probe[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cone = t.AIM_CONE_DEG;
  const degrees: number[] = [0];
  for (let d = REACH_THETA_STEP_DEG; d < cone; d += REACH_THETA_STEP_DEG) degrees.push(d, -d);
  degrees.push(cone, -cone);

  const terminal = t.BUOYANCY / t.DAMPING_Y;
  const probes: Probe[] = [];
  for (const power of REACH_POWERS) {
    const speed = impulseMagnitude({ power, radius, stunned: false, externalMul: launchMul }, t);
    for (const thetaDeg of degrees) {
      const theta = degToRad(thetaDeg);
      const vy0 = Math.cos(theta) * speed;
      const vx0 = Math.sin(theta) * speed;
      const tau = ascentCrossingTime(vy0, dy, terminal, t.DAMPING_Y);
      if (tau === null || tau > REACH_MAX_SECONDS) {
        // Never gets deep enough (or not in time): rank by how far short it falls.
        const tDead = Math.log1p(Math.max(0, vy0) / terminal) / t.DAMPING_Y;
        const deepest = freeFallDepth(Math.max(0, vy0), tDead, terminal, t.DAMPING_Y);
        probes.push({ power, thetaDeg, score: 1e6 + Math.abs(dy - deepest) });
        continue;
      }
      const reachedX = (vx0 / t.DAMPING_X) * (1 - Math.exp(-t.DAMPING_X * tau));
      probes.push({ power, thetaDeg, score: Math.abs(reachedX - dx) });
    }
  }
  probes.sort((a, b) => a.score - b.score || a.power - b.power || a.thetaDeg - b.thetaDeg);
  return probes;
}

/**
 * The capturable ceiling a target anchor hangs from: named explicitly by the caller, or recovered from
 * the geometry (an anchor sits exactly one radius under its ceiling's bottom face, §11.2).
 */
function targetCeiling(
  to: Vec2,
  radius: number,
  solids: readonly SolidEntity[],
  explicitId: string | undefined,
): Ceiling | null {
  for (const s of solids) {
    if (s.type !== 'ceiling') continue;
    if (explicitId !== undefined) {
      if (s.id === explicitId) return s;
      continue;
    }
    if (!s.capturable) continue;
    if (Math.abs(restPoseY(s.rect, radius) - to.y) > ANCHOR_PLACEMENT_EPS) continue;
    if (to.x < s.rect.x || to.x > s.rect.x + s.rect.w) continue;
    return s;
  }
  return null;
}

/**
 * Ballistic reachability between two rest anchors (§11.5.11, §11.7.7). Launches from `from` AT REST
 * (velocity 0, the worst case the GDD names) over charge power × aim angle, running the same fixed-step
 * integrator and swept collision the player runs, and reports whether some arc LANDS on the target:
 * §2.3 capture on the bottom face of the target anchor's ceiling, inside `reachTolerance` of the anchor
 * itself. A shot that merely flies past the anchor is not a certificate — it is a miss.
 *
 * `solids` must already be in the same (world) coordinates as the anchors and include the side walls;
 * use the sequence walkers below, or `sideWalls`, to build them. `targetCeilingId` names the ceiling the
 * anchor hangs from; when omitted it is recovered from the geometry.
 *
 * `launchMul` is the impulse multiplier of the surface the shot LEAVES: 1 from a posadero or an
 * impaciente, `REST_STICKY_IMPULSE_MUL` from a pegajosa (§2.3 — `bubbleStep.launch` applies exactly
 * this factor). Certifying a sticky rung at full impulse writes a certificate for a shot the player
 * cannot take: a Zone 1 shot descends 193 px, the same shot off a sticky ledge 86 px.
 */
export function findReachTrajectory(
  from: Vec2,
  to: Vec2,
  zone: ZoneIndex,
  solids: readonly SolidEntity[],
  t: Tuning,
  targetCeilingId?: string,
  fields: readonly ForceField[] = [],
  launchMul = 1,
): ReachResult {
  const radius = zoneRadius(zone, t);
  const target = targetCeiling(to, radius, solids, targetCeilingId);
  let best: ReachResult = { ok: false, bestDistance: Infinity, power: 0, thetaDeg: 0 };

  for (const probe of orderedProbes(from, to, radius, t, launchMul)) {
    const shot = flyOneProbe(from, to, zone, probe, target, solids, fields, t, launchMul);
    if (shot.ok) return { ok: true, bestDistance: shot.closest, power: probe.power, thetaDeg: probe.thetaDeg };
    if (shot.closest < best.bestDistance) {
      best = { ok: false, bestDistance: shot.closest, power: probe.power, thetaDeg: probe.thetaDeg };
    }
  }
  return best;
}

/** One probe shot, flown and judged: did it LAND on the target anchor, and how close did it pass? */
function flyOneProbe(
  from: Vec2,
  to: Vec2,
  zone: ZoneIndex,
  probe: Probe,
  target: Ceiling | null,
  solids: readonly SolidEntity[],
  fields: readonly ForceField[],
  t: Tuning,
  launchMul: number,
): { ok: boolean; closest: number; flight: ProbeFlight } {
  const radius = zoneRadius(zone, t);
  const speed = impulseMagnitude({ power: probe.power, radius, stunned: false, externalMul: launchMul }, t);
  const flight = flyProbe(from, launchVelocity(degToRad(probe.thetaDeg), speed), radius, solids, fields, t);

  let closest = Infinity;
  for (let i = 1; i < flight.points.length; i++) {
    const a = flight.points[i - 1];
    const b = flight.points[i];
    if (a === undefined || b === undefined) continue;
    const d = distanceToSegment(to, a, b);
    if (d < closest) closest = d;
  }

  const landed = flight.points[flight.points.length - 1];
  const ok =
    target !== null &&
    landed !== undefined &&
    capturesOn(flight, target.id, t) &&
    Math.hypot(landed.x - to.x, landed.y - to.y) <= reachTolerance(zone, t);
  return { ok, closest, flight };
}

/** A shot that lands on the target anchor: the charge and aim it needs, and what it meets on the way. */
export interface LandingLine {
  power: number;
  thetaDeg: number;
  /** True when the arc passes through the box of one of `hazards` before it lands. */
  touchesHazard: boolean;
}

/**
 * EVERY shot in the ±AIM_CONE_DEG cone that lands on the target anchor, not just the first one
 * `findReachTrajectory` reports. The reach rule only needs one certificate; a level DESIGN question —
 * does this band change which shot works? does any hazard sit on a line that would otherwise have
 * succeeded? — needs the whole set, and asking it with the same integrator is the only way the answer
 * means anything. Used by the Zone 2 content tests (§3.3.3, §4.2).
 */
export function findLandingLines(
  from: Vec2,
  to: Vec2,
  zone: ZoneIndex,
  solids: readonly SolidEntity[],
  t: Tuning,
  targetCeilingId?: string,
  fields: readonly ForceField[] = [],
  hazards: readonly Hazard[] = [],
  launchMul = 1,
): LandingLine[] {
  const radius = zoneRadius(zone, t);
  const target = targetCeiling(to, radius, solids, targetCeilingId);
  const boxes = hazards.map((h) => sweptRect(h.shape, h.moving?.axis, h.moving?.range ?? 0));
  const out: LandingLine[] = [];
  for (const probe of orderedProbes(from, to, radius, t, launchMul)) {
    const shot = flyOneProbe(from, to, zone, probe, target, solids, fields, t, launchMul);
    if (!shot.ok) continue;
    const touchesHazard = boxes.some((box) => shot.flight.points.some((p) => circleRectOverlap(p, radius, box)));
    out.push({ power: probe.power, thetaDeg: probe.thetaDeg, touchesHazard });
  }
  return out;
}

/**
 * The two solid side walls of the world column. D3 keeps them in every zone — "paredes laterales
 * sólidas en x < 0 y x > WORLD_W en todas las zonas" — now that the column is WORLD_W wide and the
 * view scrolls across it; they are what a lateral shot at the edge of the 90° cone answers to.
 */
export function sideWalls(yTop: number, yBottom: number, t: Tuning): Wall[] {
  const h = Math.max(1, yBottom - yTop);
  return [
    {
      type: 'wall',
      id: 'validator:wall:left',
      rect: { x: -SIDE_WALL_THICKNESS, y: yTop, w: SIDE_WALL_THICKNESS, h },
      restitution: t.RESTITUTION_ROCK,
      material: 'rock',
    },
    {
      type: 'wall',
      id: 'validator:wall:right',
      rect: { x: t.WORLD_W, y: yTop, w: SIDE_WALL_THICKNESS, h },
      restitution: t.RESTITUTION_ROCK,
      material: 'rock',
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Trap escapability (§2.4.5, §5 nº 7: "recurso, no muerte")
// ---------------------------------------------------------------------------------------------

/**
 * How far (px) from the trap's own box a shot must end up before it counts as an escape. Bur's radius
 * plus a whole body: close enough that the number is geometry rather than taste, far enough that the
 * next thing buoyancy does cannot put her back inside the crown.
 */
const TRAP_ESCAPE_CLEAR_PX = 20;

/** The charge that buys the escape (§2.4.5). Same constant the runtime uses, re-declared nowhere. */
const TRAP_ESCAPE_POWER = 0.6;

/** Distance from a point to a rect (0 inside it). */
function distanceToRect(p: Vec2, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * The poses a trap can leave Bur in when it lets go (`game/hazards.ts`): the vent frees her exactly where
 * it pinned her, and the pin is wherever her centre was when the crown closed. That is any point of the
 * crown's box (a corner of her body is enough to arm it, but the box itself is the honest sample) that is
 * not already inside a solid — a crown grown under a shelf's lip has half of its box behind the rock, and
 * Bur was never there.
 */
function trapReleasePoses(crown: Rect, radius: number, solids: readonly SolidEntity[]): Vec2[] {
  const poses: Vec2[] = [];
  for (const fx of [1 / 6, 1 / 2, 5 / 6]) {
    for (const fy of [1 / 6, 1 / 2, 5 / 6]) {
      const p = { x: crown.x + crown.w * fx, y: crown.y + crown.h * fy };
      if (solids.some((s) => circleRectOverlap(p, radius, s.rect))) continue;
      poses.push(p);
    }
  }
  return poses;
}

/**
 * §2.4.5 and §5 nº 7 promise the anemone is "recurso, no muerte": the pip it takes buys a way out. That
 * is a claim about GEOMETRY, not only about code — a crown placed where every shot in the ±AIM_CONE_DEG
 * cone falls straight back inside it costs a pip every time it re-arms, which is a death sentence with
 * extra steps. This flies the escape the player is told to buy (a charge of TRAP_ESCAPE_POWER or more,
 * the same integrator as the reach rule) from each release pose and asks that at least one of them ends
 * clear of the crown.
 *
 * Zone 2 shipped five anemones that failed it, so the rule exists.
 */
function trapEscapes(
  crown: Rect,
  zone: ZoneIndex,
  solids: readonly SolidEntity[],
  fields: readonly ForceField[],
  t: Tuning,
): boolean {
  const radius = zoneRadius(zone, t);
  const powers = REACH_POWERS.filter((p) => p >= TRAP_ESCAPE_POWER - 1e-9);
  const degrees: number[] = [];
  // Widest first: the escape from a crown against a wall, when it exists at all, is a wide-angle shot.
  for (let d = t.AIM_CONE_DEG; d >= 0; d -= REACH_THETA_STEP_DEG) degrees.push(-d, d);

  const poses = trapReleasePoses(crown, radius, solids);
  if (poses.length === 0) return false; // a crown entirely inside rock can never be met, nor left
  return poses.every((from) =>
    powers.some((power) => {
      const speed = impulseMagnitude({ power, radius, stunned: false, externalMul: 1 }, t);
      return degrees.some((thetaDeg) => {
        const flight = flyProbe(from, launchVelocity(degToRad(thetaDeg), speed), radius, solids, fields, t);
        const end = flight.points[flight.points.length - 1];
        return end !== undefined && distanceToRect(end, crown) - radius >= TRAP_ESCAPE_CLEAR_PX;
      });
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Rule 1: single chunk schema (§11.2, §11.5)
// ---------------------------------------------------------------------------------------------

/**
 * Validates a single chunk's schema (§11.2, §11.5): anchors exist and reference capturable ceilings,
 * ceilings w>=20 h>=8, entities inside the CHUNK_W x CHUNK_H box, pushDir 'up' only for catalog 20/21,
 * hazards airCost 1, station chunks have no hazards, and the declared entry / exit anchors open and
 * close the chunk's y-ordered ladder. D3 removed the lane and mouth rules entirely.
 */
export function validateChunk(chunk: Chunk, t: Tuning): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const id = chunk.id;
  const radius = zoneRadius(chunk.zone, t);
  const add = (rule: string, message: string): void => void issues.push(error(rule, message, id));

  if (chunk.id.length === 0) issues.push(error('schema', 'chunk id must not be empty'));
  if (!(chunk.targetTimeS > 0)) add('schema', `targetTimeS must be > 0 (got ${chunk.targetTimeS})`);
  if (chunk.targetTimeS > t.MAX_SEGMENT_S) {
    add('segmentTime', `targetTimeS ${chunk.targetTimeS}s alone exceeds MAX_SEGMENT_S ${t.MAX_SEGMENT_S}s`);
  }
  if (!(chunk.airBudget >= 0)) add('airBudget', `airBudget must be >= 0 (got ${chunk.airBudget})`);

  // --- entity ids, geometry and bounds ---------------------------------------------------------
  const seen = new Set<string>();
  const ceilings = new Map<string, Ceiling>();
  const anchors: Anchor[] = [];
  const solids: SolidEntity[] = [];
  const fields: ForceField[] = [];
  const traps: Hazard[] = [];
  let hazardCount = 0;
  let airFromPickups = 0;

  for (const e of chunk.entities) {
    if (seen.has(e.id)) add('schema', `duplicate entity id '${e.id}'`);
    seen.add(e.id);

    if (e.type === 'ceiling') {
      ceilings.set(e.id, e);
      solids.push(e);
      if (e.rect.w < 20) add('schema', `ceiling '${e.id}' is ${e.rect.w} px wide (§2.3 requires w >= 20)`);
      if (e.rect.h < 8) add('schema', `ceiling '${e.id}' is ${e.rect.h} px thick (§2.3 requires h >= 8)`);
    } else if (e.type === 'wall') {
      solids.push(e);
    } else if (e.type === 'anchor') {
      anchors.push(e);
    } else if (e.type === 'hazard') {
      hazardCount++;
      if (e.airCost !== 1) add('schema', `hazard '${e.id}' costs ${e.airCost} air (§5: never more than 1)`);
      if (e.pushDir === 'up' && e.catalogId !== 20 && e.catalogId !== 21) {
        add('pushDir', `hazard '${e.id}' (catalogId ${e.catalogId}) pushes 'up'; only catalogId 20 and 21 may (§11.7.9)`);
      }
      if (e.catalogId < 1 || e.catalogId > 25) add('schema', `hazard '${e.id}' has catalogId ${e.catalogId} outside 1..25`);
      if (e.trap === true) traps.push(e);
    } else if (e.type === 'forcefield') {
      fields.push(e);
      // §5's direction rule and §11.7.9 are about the PUSH, not about the entity that carries it: a
      // force field with a negative y is an upward push exactly like a hazard with pushDir 'up', and
      // only the Burbuja de Metano (nº 20) and the Fumarola (nº 21) may do it — they open the ascenso
      // window (§4.3), which is what makes them safe in a game that punishes rising.
      if (e.vector.y < 0 && e.catalogId !== 20 && e.catalogId !== 21) {
        add('pushDir', `force field '${e.id}' (catalogId ${e.catalogId ?? 'none'}) accelerates upward (y=${e.vector.y}); only catalogId 20 and 21 may (§11.7.9)`);
      }
    } else if (e.type === 'pickup') {
      if (e.pickupType === 'aire') airFromPickups += e.value;
      if (e.pickupType === 'aireGrande') airFromPickups += e.value;
    }

    const bounds = entityBounds(e, radius);
    if (bounds === null) continue;
    if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.w > t.CHUNK_W || bounds.y + bounds.h > t.CHUNK_H) {
      add('schema', `entity '${e.id}' leaves the ${t.CHUNK_W}x${t.CHUNK_H} chunk box`);
    }
  }

  // --- anchors --------------------------------------------------------------------------------
  if (anchors.length === 0) add('schema', 'chunk declares no Anchor (§11.2: rest points are declared, not inferred)');

  for (const a of anchors) {
    const ceiling = ceilings.get(a.ceilingId);
    if (ceiling === undefined) {
      add('schema', `anchor '${a.id}' references unknown ceiling '${a.ceilingId}'`);
      continue;
    }
    if (!ceiling.capturable) {
      add('schema', `anchor '${a.id}' hangs from non-capturable ceiling '${ceiling.id}' (§2.3: no rest there)`);
    }
    const restY = restPoseY(ceiling.rect, radius);
    if (Math.abs(a.pos.y - restY) > ANCHOR_PLACEMENT_EPS) {
      add('schema', `anchor '${a.id}' is at y=${a.pos.y}; resting under '${ceiling.id}' puts Bur's centre at y=${restY}`);
    }
    // §11.2: an Anchor is "Bur's centre when resting under the ceiling", and §2.4.2 respawns her there.
    // A ceiling that walks away from its own rest point (§5 nº 3, the turtle) has neither, so the
    // containment is checked at BOTH ends of the travel, not only at the base rect.
    if (ceiling.moving?.axis === 'y' && ceiling.moving.range > 0) {
      add('schema', `anchor '${a.id}' hangs from '${ceiling.id}', which oscillates on y: its rest pose is not a fixed point (§11.2)`);
    }
    for (const rect of travelExtremes(ceiling)) {
      if (a.pos.x < rect.x || a.pos.x > rect.x + rect.w) {
        add('schema', `anchor '${a.id}' at x=${a.pos.x} is not under ceiling '${ceiling.id}' (which spans ${rect.x}..${rect.x + rect.w} somewhere in its travel)`);
        break;
      }
    }
  }

  const byId = new Map(anchors.map((a) => [a.id, a] as const));
  const entryAnchor = byId.get(chunk.entryAnchorId);
  const exitAnchor = byId.get(chunk.exitAnchorId);
  if (entryAnchor === undefined) add('schema', `entryAnchorId '${chunk.entryAnchorId}' is not an Anchor of this chunk`);
  if (exitAnchor === undefined) add('schema', `exitAnchorId '${chunk.exitAnchorId}' is not an Anchor of this chunk`);

  // §11.5.11 walks the anchors of a chunk in y order: the entry must open that ladder and the exit close it.
  if (entryAnchor !== undefined && anchors.some((a) => a.pos.y < entryAnchor.pos.y)) {
    add('schema', `entry anchor '${entryAnchor.id}' is not the topmost anchor of the chunk`);
  }
  if (exitAnchor !== undefined && anchors.some((a) => a.pos.y > exitAnchor.pos.y)) {
    add('schema', `exit anchor '${exitAnchor.id}' is not the bottommost anchor of the chunk`);
  }
  // D3: a wide chunk may offer alternative exits. They are candidates for the generator to pick from,
  // so they must be real anchors of this chunk; the certified route is still `exitAnchorId`.
  for (const id of chunk.exitAnchorIds ?? []) {
    if (!byId.has(id)) add('schema', `exitAnchorIds lists '${id}', which is not an Anchor of this chunk`);
  }

  // --- role invariants -------------------------------------------------------------------------
  if (chunk.role === 'station' && hazardCount > 0) {
    add('schema', `station chunk carries ${hazardCount} hazard(s) (§3.3: 4 s sin peligro)`);
  }

  // --- traps are a resource, never a death (§2.4.5, §5 nº 7) --------------------------------------
  if (traps.length > 0) {
    const context = [...solids, ...sideWalls(-REACH_CONTEXT_ABOVE_PX, t.CHUNK_H + REACH_CONTEXT_BELOW_PX, t)];
    for (const trap of traps) {
      const crown = sweptRect(trap.shape, trap.moving?.axis, trap.moving?.range ?? 0);
      if (trapEscapes(crown, chunk.zone, context, fields, t)) continue;
      add(
        'trap',
        `trap '${trap.id}' has no escape: no charge of ${TRAP_ESCAPE_POWER} or more in the ±${t.AIM_CONE_DEG}° cone ` +
          `leaves its crown from the pose it releases Bur in, so venting a pip only feeds it the next one (§2.4.5, §5 nº 7)`,
      );
    }
  }

  if (airFromPickups !== chunk.airBudget) {
    issues.push(
      warning(
        'airBudget',
        `airBudget ${chunk.airBudget} does not match the ${airFromPickups} air the chunk's pickups actually give (§11.5.7)`,
        id,
      ),
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------------------------
// Rule 2: sequence (§11.5.1, 2, 4, 5, 11, 13)
// ---------------------------------------------------------------------------------------------

/** Per-chunk geometry of a sequence, in world coordinates (chunk i placed at y = i * CHUNK_H). */
interface SequenceGeometry {
  solids: SolidEntity[][];
  /** Force fields of each chunk: the reach probes fly through them, exactly as the player does. */
  fields: ForceField[][];
  /** Anchors of each chunk, sorted top-down: the ladder §11.5.11 walks. */
  anchors: Anchor[][];
}

function placeSequence(chunks: readonly Chunk[], t: Tuning): SequenceGeometry {
  const solids: SolidEntity[][] = [];
  const fields: ForceField[][] = [];
  const anchors: Anchor[][] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk === undefined) continue;
    const placed: PlacedChunk = { chunk, index: i, worldY: i * t.CHUNK_H, immersionIndex: 0 };
    const entities = instantiateChunk(placed);
    solids.push(entities.filter((e): e is SolidEntity => e.type === 'ceiling' || e.type === 'wall'));
    fields.push(entities.filter((e): e is ForceField => e.type === 'forcefield'));
    anchors.push(entities.filter((e): e is Anchor => e.type === 'anchor').sort((a, b) => a.pos.y - b.pos.y));
  }
  return { solids, fields, anchors };
}

/** What a probe shot between two anchors can meet: every chunk overlapping the flight band, plus walls. */
interface ReachContext {
  solids: SolidEntity[];
  fields: ForceField[];
}

function reachContext(geometry: SequenceGeometry, from: Vec2, to: Vec2, t: Tuning): ReachContext {
  const top = from.y - REACH_CONTEXT_ABOVE_PX;
  const bottom = to.y + REACH_CONTEXT_BELOW_PX;
  const first = Math.max(0, Math.floor(top / t.CHUNK_H));
  const last = Math.min(geometry.solids.length - 1, Math.floor(bottom / t.CHUNK_H));
  const out: ReachContext = { solids: [...sideWalls(top, bottom, t)], fields: [] };
  for (let i = first; i <= last; i++) {
    const chunkSolids = geometry.solids[i];
    if (chunkSolids !== undefined) out.solids.push(...chunkSolids);
    const chunkFields = geometry.fields[i];
    if (chunkFields !== undefined) out.fields.push(...chunkFields);
  }
  return out;
}

/** One rung of the reach ladder: an anchor in world coordinates and the chunk that declared it. */
interface Rung {
  anchor: Anchor;
  chunk: Chunk;
}

/**
 * The reach ladder of a placed sequence: every chunk's anchors in y order, joined across each seam by
 * `exitAnchor(i) -> entryAnchor(i+1)` (§11.5.11).
 */
function buildLadder(chunks: readonly Chunk[], geometry: SequenceGeometry): Rung[] {
  const ladder: Rung[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const list = geometry.anchors[i];
    if (chunk === undefined || list === undefined) continue;
    const prefix = `${i}:`;
    const entry = list.find((a) => a.id === prefix + chunk.entryAnchorId);
    const exit = list.find((a) => a.id === prefix + chunk.exitAnchorId);
    if (entry === undefined || exit === undefined) continue; // reported by validateChunk
    // Inside a chunk the anchors are walked in y order, with the declared entry opening the ladder and
    // the declared exit closing it (they may be the same one, and `validateChunk` has already checked
    // that no other anchor sits above the entry or below the exit).
    ladder.push({ anchor: entry, chunk });
    for (const anchor of list) {
      if (anchor.id === entry.id || anchor.id === exit.id) continue;
      ladder.push({ anchor, chunk });
    }
    if (exit.id !== entry.id) ladder.push({ anchor: exit, chunk });
  }
  return ladder;
}

/**
 * The three checks of §11.5.11 on one consecutive anchor pair, now that DECISIONS-v1.2 D3 made the
 * world WORLD_W wide and D4 turned the reach rule two-dimensional:
 *   1. the vertical drop against `MAX_HOP_PX[zone]` (and never upward: Bur cannot launch up, D2),
 *   2. the lateral separation `|Δx|` against `MAX_HOP_X_PX[zone]`,
 *   3. a ballistic search from rest (entry velocity zero, the worst case) with the real integrator,
 *      which must END on the target anchor's ceiling (§11.7.7).
 *
 * 1 and 2 are a cheap box around 3, not a second model of it: a pair outside the box is rejected with a
 * message a level author can act on, instead of after 333 simulated shots that were never going to
 * arrive. Both are needed — a 190 px sideways hop with no drop is as unreachable as a 300 px fall.
 */
/**
 * The impulse multiplier a shot leaving `ceilingId` actually gets (§2.3). Only the pegajosa changes
 * it, and `bubbleStep.launch` applies the very same factor: the reach rule is certified "con el MISMO
 * integrador" the player runs, and that includes the ledge she pushes off.
 */
function launchMulOf(ceilingId: string, solids: readonly SolidEntity[], t: Tuning): number {
  for (const s of solids) {
    if (s.type === 'ceiling' && s.id === ceilingId) return s.kind === 'pegajosa' ? t.REST_STICKY_IMPULSE_MUL : 1;
  }
  return 1;
}

function checkRung(a: Rung, b: Rung, geometry: SequenceGeometry, t: Tuning): ValidationIssue[] {
  // Anchors of the SAME ceiling (a wide shelf may declare several) are the same rest, not a hop.
  if (a.anchor.ceilingId === b.anchor.ceilingId) return [];

  const zone = a.chunk.zone;
  const maxHop = t.MAX_HOP_PX[zone] ?? t.MAX_HOP_PX[0] ?? 110;
  const maxHopX = t.MAX_HOP_X_PX[zone] ?? t.MAX_HOP_X_PX[0] ?? 200;
  const dy = b.anchor.pos.y - a.anchor.pos.y;
  const dx = b.anchor.pos.x - a.anchor.pos.x;
  const label = `'${a.anchor.id}' -> '${b.anchor.id}'`;
  if (dy < 0) {
    return [error('reach', `${label}: the next anchor is ${-dy} px ABOVE the previous one; Bur can never launch upward (§2.1)`, b.chunk.id)];
  }
  if (dy > maxHop) {
    return [error('reach', `${label}: vertical gap ${dy} px exceeds MAX_HOP_PX ${maxHop} for zone ${zone} (§11.5.11)`, b.chunk.id)];
  }
  if (Math.abs(dx) > maxHopX) {
    return [
      error(
        'reach',
        `${label}: lateral gap ${Math.abs(dx)} px exceeds MAX_HOP_X_PX ${maxHopX} for zone ${zone} (D4)`,
        b.chunk.id,
      ),
    ];
  }

  const context = reachContext(geometry, a.anchor.pos, b.anchor.pos, t);
  const found = findReachTrajectory(
    a.anchor.pos,
    b.anchor.pos,
    a.chunk.zone,
    context.solids,
    t,
    b.anchor.ceilingId,
    context.fields,
    launchMulOf(a.anchor.ceilingId, context.solids, t),
  );
  if (found.ok) return [];
  return [
    error(
      'reach',
      `${label}: no shot in the ±${t.AIM_CONE_DEG}° cone lands there from rest (closest approach ${found.bestDistance.toFixed(1)} px at power ${found.power}, ${found.thetaDeg}°) (§11.7.7)`,
      b.chunk.id,
    ),
  ];
}

/**
 * Walks a ladder rung by rung, and it is the anchors that SHARE a ceiling that make it more than a
 * `for` loop. They are one rest, not a hop (`checkRung` says so), but they are a rest Bur reaches at
 * whichever of them her arc arrived on — `restPose` clamps her x to where she came in, it never
 * slides her along to the declared anchor. So the hop to the next rung has to be certified from EVERY
 * anchor of the shelf, not only from the one the y order happens to leave next to it: a wide shelf
 * with two anchors would otherwise ship with one of its two exits never checked.
 */
function walkLadder(ladder: readonly Rung[], geometry: SequenceGeometry, t: Tuning): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let shelf: Rung[] = [];
  for (const rung of ladder) {
    const first = shelf[0];
    if (first !== undefined && first.anchor.ceilingId === rung.anchor.ceilingId) {
      shelf.push(rung);
      continue;
    }
    for (const from of shelf) issues.push(...checkRung(from, rung, geometry, t));
    shelf = [rung];
  }
  return issues;
}

/** Walks the whole ladder of a sequence. */
function validateReach(chunks: readonly Chunk[], t: Tuning): ValidationIssue[] {
  const geometry = placeSequence(chunks, t);
  return walkLadder(buildLadder(chunks, geometry), geometry, t);
}

/**
 * The seam between two chunks that are NOT in the same immersion (§11.5.11: "la regla se aplica también
 * a la junta entre chunks"; §11.1 places all 108 chunks in ONE continuous column, so the last chunk of
 * an immersion is followed by the first of the next exactly like any other pair). Since D3 there is no
 * lane and no mouth to check: the seam IS the single anchor pair `exitAnchor(prev) -> entryAnchor(next)`,
 * judged by the same 2D reach rule as any rung inside a chunk, with both chunks' solids in the context.
 */
export function validateJunction(prev: Chunk, next: Chunk, t: Tuning): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const chunks = [prev, next];
  const geometry = placeSequence(chunks, t);
  const ladder = buildLadder(chunks, geometry);
  for (let i = 0; i < ladder.length - 1; i++) {
    const a = ladder[i];
    const b = ladder[i + 1];
    if (a === undefined || b === undefined) continue;
    if (a.chunk === prev && b.chunk === next) issues.push(...checkRung(a, b, geometry, t));
  }
  return issues;
}

/**
 * §11.5.2, anti-repetition. A `chunk.id` may not reappear inside a window of CHUNK_REPEAT_WINDOW, and no
 * three consecutive chunks may share a tag ("dos chunks con el mismo tag no pueden encadenarse más de 2
 * veces seguidas").
 *
 * Reported as WARNINGS, and deliberately: §11.5.12 lists the relaxations the selector is allowed to make
 * when it runs out of candidates, and steps (b) "levantar la regla de tag" and (c) "reducir la ventana
 * anti-repetición 6 → 4 → 2" are exactly this rule — while naming rules 4, 5, 7 and 11 as the four that
 * "nunca se relajan". A hand-authored sequence that trips it is worth saying out loud; it is not illegal.
 *
 * `keep` lets a caller restrict the report to the pairs it owns, so a campaign can
 * check the windows that straddle an immersion boundary without re-reporting what each immersion already
 * reported on its own.
 */
function rotationIssues(chunks: readonly Chunk[], t: Tuning, keep: (i: number, j: number) => boolean): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const a = chunks[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < chunks.length && j - i < t.CHUNK_REPEAT_WINDOW; j++) {
      const b = chunks[j];
      if (b === undefined || b.id !== a.id || !keep(i, j)) continue;
      issues.push(warning('rotation', `chunk '${a.id}' repeats ${j - i} chunks later, inside the window of ${t.CHUNK_REPEAT_WINDOW} (§11.5.2)`, a.id));
    }
  }
  for (let i = 0; i + 2 < chunks.length; i++) {
    const a = chunks[i];
    const b = chunks[i + 1];
    const c = chunks[i + 2];
    if (a === undefined || b === undefined || c === undefined || !keep(i, i + 2)) continue;
    const shared = a.tags.filter((tag) => b.tags.includes(tag) && c.tags.includes(tag));
    for (const tag of shared) {
      issues.push(warning('rotation', `'${a.id}', '${b.id}' and '${c.id}' chain the tag '${tag}' three times (§11.5.2 allows two)`, c.id));
    }
  }
  return issues;
}

/**
 * Every §5 catalogue entity of a chunk, in entity order: the `Hazard`s, plus the `Ceiling`s and
 * `ForceField`s that ARE a catalogue entry (§5 nº 1-3 of Zone 1 cost no Air and are ceilings, nº 8 of
 * Zone 2 is a force field, §11.2). §11.5.5 is a didactic rule about meeting something for the first
 * time, not about damage, so all three count as "peligros".
 */
function catalogEntries(chunk: Chunk): number[] {
  const out: number[] = [];
  for (const e of chunk.entities) {
    if (e.type === 'hazard') out.push(e.catalogId);
    else if ((e.type === 'ceiling' || e.type === 'forcefield') && e.catalogId !== undefined) out.push(e.catalogId);
  }
  return out;
}

/**
 * Validates a hand-authored immersion sequence (§11.5 rules 1, 2, 4, 5, 6, 11, 13 as applicable to fixed content):
 *  - rotation: no repeated id inside CHUNK_REPEAT_WINDOW, no tag chained three times
 *  - breathing: difficulty >= 4 followed by <= 3; at most two >= 4 per immersion
 *  - reach (D4, 2D): between consecutive anchors (within a chunk and across the seam) the drop is
 *           <= MAX_HOP_PX[zone] and |Δx| <= MAX_HOP_X_PX[zone], AND a shot from rest (zero entry
 *           velocity) LANDS on the next anchor — §11.7.7. There is no lane rule since D3.
 *  - segmentTime: sum of targetTimeS between boyas/stations <= MAX_SEGMENT_S
 *  - last chunk must be a station
 * `firstAppearances` lets the caller pass hazard catalog ids already seen in previous immersions (isolation rule).
 * The map is MUTATED so a campaign can chain immersions through it (see `validateCampaign`).
 */
export function validateSequence(
  library: ChunkLibrary,
  sequence: readonly string[],
  t: Tuning,
  firstAppearances?: Map<number, number>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // --- resolve ids ------------------------------------------------------------------------------
  const chunks: Chunk[] = [];
  for (const id of sequence) {
    if (!library.has(id)) {
      issues.push(error('schema', `unknown chunk id '${id}'`));
      continue;
    }
    chunks.push(library.get(id));
  }
  if (chunks.length !== sequence.length) return issues; // nothing further is meaningful with holes
  if (chunks.length === 0) {
    issues.push(error('schema', 'empty immersion sequence'));
    return issues;
  }
  if (chunks.length !== t.IMMERSION_CHUNKS) {
    issues.push(error('schema', `immersion has ${chunks.length} chunks, expected IMMERSION_CHUNKS=${t.IMMERSION_CHUNKS}`));
  }

  // --- station last (§3.1: the station IS the sixth chunk) ---------------------------------------
  const last = chunks[chunks.length - 1];
  if (last !== undefined && last.role !== 'station') {
    issues.push(error('schema', `last chunk '${last.id}' must have role 'station', got '${last.role}'`, last.id));
  }
  for (let i = 0; i < chunks.length - 1; i++) {
    const c = chunks[i];
    if (c !== undefined && c.role === 'station') {
      issues.push(error('schema', `chunk '${c.id}' at index ${i} is a station but only the last one may be`, c.id));
    }
  }

  // --- anti-repetition (§11.5.2) -----------------------------------------------------------------
  issues.push(...rotationIssues(chunks, t, () => true));

  // --- breathing (§4.2.2, §11.5.4) ---------------------------------------------------------------
  let hard = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (c === undefined) continue;
    if (c.difficulty >= 4) {
      hard++;
      const next = chunks[i + 1];
      if (next !== undefined && next.difficulty > 3) {
        issues.push(error('breathing', `'${c.id}' (difficulty ${c.difficulty}) is followed by '${next.id}' (difficulty ${next.difficulty}); must be <= 3`, next.id));
      }
    }
  }
  if (hard > 2) issues.push(error('breathing', `${hard} chunks of difficulty >= 4 in one immersion (max 2)`));

  // --- didactic isolation (§4.2.1, §11.5.5) -------------------------------------------------------
  const appearances = firstAppearances ?? new Map<number, number>();
  for (const c of chunks) {
    const catalogued = catalogEntries(c);
    // "Las dos primeras INSTANCIAS de un catalogId": the counter advances per ENTITY, not per chunk,
    // so a chunk holding two Erizos has already spent both didactic slots of catalogId 6.
    const perCatalog = new Map<number, number>();
    for (const id of catalogued) perCatalog.set(id, (perCatalog.get(id) ?? 0) + 1);
    for (const [catalogId, count] of perCatalog) {
      const before = appearances.get(catalogId) ?? 0;
      if (before < 2 && catalogued.length !== 1) {
        issues.push(
          error(
            'isolation',
            `appearance ${before + 1} of catalogId ${catalogId} shares '${c.id}' with ${catalogued.length - 1} other catalogue entity(ies); the first two must come alone`,
            c.id,
          ),
        );
      }
      appearances.set(catalogId, before + count);
    }
  }

  // --- segment time between breath buoys (§3.1, §11.7.13) ------------------------------------------
  const boundaries = [t.BOYA_AFTER_CHUNK, chunks.length];
  let segmentStart = 0;
  for (const boundary of boundaries) {
    const end = Math.min(boundary, chunks.length);
    if (end <= segmentStart) continue;
    let total = 0;
    for (let i = segmentStart; i < end; i++) total += chunks[i]?.targetTimeS ?? 0;
    if (total > t.MAX_SEGMENT_S) {
      issues.push(error('segmentTime', `chunks ${segmentStart}..${end - 1} sum ${total}s of targetTimeS, over MAX_SEGMENT_S ${t.MAX_SEGMENT_S}s`));
    }
    segmentStart = end;
  }

  // --- reach (§11.5.11, §11.7.7) -------------------------------------------------------------------
  issues.push(...validateReach(chunks, t));

  return issues;
}

// ---------------------------------------------------------------------------------------------
// Rule 3: the whole campaign
// ---------------------------------------------------------------------------------------------

/**
 * Validates all sequences of a campaign in order (so the isolation rule sees the whole game), plus the
 * seams BETWEEN immersions: §11.1 assembles the campaign as one continuous 25.920 px column, so the last
 * chunk of an immersion is followed by the first of the next and §11.5.1 / §11.5.11 apply there too.
 */
export function validateCampaign(library: ChunkLibrary, sequences: readonly (readonly string[])[], t: Tuning): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const appearances = new Map<number, number>();
  const schemaChecked = new Set<string>();
  const flat: Chunk[] = [];
  const flatSequence: number[] = [];

  for (let s = 0; s < sequences.length; s++) {
    const sequence = sequences[s];
    if (sequence === undefined) continue;
    for (const id of sequence) {
      if (!library.has(id)) continue;
      flat.push(library.get(id));
      flatSequence.push(s);
      if (schemaChecked.has(id)) continue;
      schemaChecked.add(id);
      issues.push(...validateChunk(library.get(id), t));
    }
    issues.push(...validateSequence(library, sequence, t, appearances));

    const previous = sequences[s - 1];
    if (previous === undefined) continue;
    const prevId = previous[previous.length - 1];
    const nextId = sequence[0];
    if (prevId === undefined || nextId === undefined || !library.has(prevId) || !library.has(nextId)) continue;
    issues.push(...validateJunction(library.get(prevId), library.get(nextId), t));
  }

  // §11.5.2 across the whole column: each immersion already checked its own windows, so only the ones
  // that straddle an immersion boundary are reported here.
  issues.push(...rotationIssues(flat, t, (i, j) => flatSequence[i] !== flatSequence[j]));

  return issues;
}
