/**
 * Swept circle vs AABB collision and motion resolution (GDD §11.4).
 *
 * All world geometry is axis-aligned rectangles and Bur is a circle, so one exact swept test is enough
 * and tunneling is impossible by construction (no sub-steps, no thick colliders).
 *
 * Face convention (see `ContactFace` in types.ts): the face named is the face OF THE BODY that was hit,
 * and `normal` points away from the body toward the circle. So 'bottom' means Bur arrived from below
 * (normal = (0, +1), i.e. pointing down-screen toward Bur) — that is the only face that can capture rest.
 */
import { clamp } from '../math/vec';
import type { Rect, Vec2 } from '../math/vec';
import type { Contact, ContactFace, MovingSpec, SolidEntity } from '../types';

/** Result of sweeping a circle along a displacement against one AABB. */
export interface SweepHit {
  /** Fraction of the displacement at which contact happens, in [0, 1]. */
  t: number;
  face: ContactFace;
  normal: Vec2;
  point: Vec2;
}

/** Geometric slack in px (and px²): below this a length is treated as zero. */
const EPS = 1e-9;

/** Slack in SECONDS: below this the remaining time of a tick is treated as spent. */
const TIME_EPS = 1e-9;

/** Separation left between the circle and the body after a contact is resolved (px). */
export const CONTACT_EPSILON = 1e-3;

/**
 * Swept circle vs AABB (§11.4 "barrido"): finds the earliest time of impact of a circle of radius `r`
 * moving from `c0` by `delta` against `rect`. Returns null when there is no contact within the sweep.
 * Must be exact for face hits and handle corners (Minkowski expansion: rounded rectangle).
 * A circle already overlapping the rect at t=0 returns t=0 with the normal of the least-penetration face.
 */
export function sweepCircleAabb(c0: Vec2, r: number, delta: Vec2, rect: Rect): SweepHit | null {
  const minX = rect.x;
  const maxX = rect.x + rect.w;
  const minY = rect.y;
  const maxY = rect.y + rect.h;

  // --- t = 0: already overlapping -> least-penetration resolution ------------------------------
  const nearestX = clamp(c0.x, minX, maxX);
  const nearestY = clamp(c0.y, minY, maxY);
  const gapX = c0.x - nearestX;
  const gapY = c0.y - nearestY;
  if (gapX * gapX + gapY * gapY < r * r - EPS) return overlapHit(c0, minX, maxX, minY, maxY);

  let best: SweepHit | null = null;
  const consider = (t: number, face: ContactFace, normal: Vec2, point: Vec2): void => {
    if (!(t >= 0) || t > 1) return;
    if (best === null || t < best.t) best = { t, face, normal, point };
  };

  // --- Face hits: the four planes of the rect expanded by r -------------------------------------
  // The contact is a face hit only when the touch point lies within the face's own extent; otherwise
  // the true first touch is on a corner, handled below.
  if (delta.x > EPS) {
    const t = (minX - r - c0.x) / delta.x;
    const y = c0.y + t * delta.y;
    if (y >= minY && y <= maxY) consider(t, 'left', { x: -1, y: 0 }, { x: minX, y });
  } else if (delta.x < -EPS) {
    const t = (maxX + r - c0.x) / delta.x;
    const y = c0.y + t * delta.y;
    if (y >= minY && y <= maxY) consider(t, 'right', { x: 1, y: 0 }, { x: maxX, y });
  }
  if (delta.y > EPS) {
    const t = (minY - r - c0.y) / delta.y;
    const x = c0.x + t * delta.x;
    if (x >= minX && x <= maxX) consider(t, 'top', { x: 0, y: -1 }, { x, y: minY });
  } else if (delta.y < -EPS) {
    const t = (maxY + r - c0.y) / delta.y;
    const x = c0.x + t * delta.x;
    if (x >= minX && x <= maxX) consider(t, 'bottom', { x: 0, y: 1 }, { x, y: maxY });
  }

  // --- Corner hits: ray vs the four circles of radius r centred on the rect corners ---------------
  const a = delta.x * delta.x + delta.y * delta.y;
  if (a > EPS) {
    // `left`/`up` say which side of the rect the corner is on, so the quadrant guard below never
    // depends on comparing floats (a degenerate zero-width rect would make minX === maxX).
    for (const corner of [
      { x: minX, y: minY, left: true, up: true },
      { x: maxX, y: minY, left: false, up: true },
      { x: minX, y: maxY, left: true, up: false },
      { x: maxX, y: maxY, left: false, up: false },
    ]) {
      const mx = c0.x - corner.x;
      const my = c0.y - corner.y;
      const b = 2 * (mx * delta.x + my * delta.y);
      const c = mx * mx + my * my - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > 1) continue;
      const px = c0.x + t * delta.x;
      const py = c0.y + t * delta.y;
      // The touch must actually be in this corner's quadrant; otherwise a face hit is the real one.
      const outX = corner.left ? px <= minX + EPS : px >= maxX - EPS;
      const outY = corner.up ? py <= minY + EPS : py >= maxY - EPS;
      if (!outX || !outY) continue;
      const nx = px - corner.x;
      const ny = py - corner.y;
      const nlen = Math.hypot(nx, ny);
      if (nlen < EPS) continue;
      const normal = { x: nx / nlen, y: ny / nlen };
      consider(t, faceFromNormal(normal), normal, { x: corner.x, y: corner.y });
    }
  }

  return best;
}

/** Least-penetration contact for a circle that already overlaps the rect at t = 0. */
function overlapHit(c0: Vec2, minX: number, maxX: number, minY: number, maxY: number): SweepHit {
  const inside = c0.x >= minX && c0.x <= maxX && c0.y >= minY && c0.y <= maxY;
  if (!inside) {
    // Centre outside: the shortest way out is straight away from the nearest point on the rect.
    const nearestX = clamp(c0.x, minX, maxX);
    const nearestY = clamp(c0.y, minY, maxY);
    const dx = c0.x - nearestX;
    const dy = c0.y - nearestY;
    const d = Math.hypot(dx, dy);
    if (d > EPS) {
      const normal = { x: dx / d, y: dy / d };
      return { t: 0, face: faceFromNormal(normal), normal, point: { x: nearestX, y: nearestY } };
    }
  }
  // Centre inside (or exactly on the border): push out through the face with the least penetration.
  const pLeft = c0.x - minX; // depth if we exit left
  const pRight = maxX - c0.x;
  const pTop = c0.y - minY;
  const pBottom = maxY - c0.y;
  const min = Math.min(pLeft, pRight, pTop, pBottom);
  if (min === pTop) return { t: 0, face: 'top', normal: { x: 0, y: -1 }, point: { x: c0.x, y: minY } };
  if (min === pBottom) return { t: 0, face: 'bottom', normal: { x: 0, y: 1 }, point: { x: c0.x, y: maxY } };
  if (min === pLeft) return { t: 0, face: 'left', normal: { x: -1, y: 0 }, point: { x: minX, y: c0.y } };
  return { t: 0, face: 'right', normal: { x: 1, y: 0 }, point: { x: maxX, y: c0.y } };
}

/** Maps a contact normal (pointing away from the body) to the body face it belongs to. */
function faceFromNormal(n: Vec2): ContactFace {
  if (Math.abs(n.x) >= Math.abs(n.y)) return n.x < 0 ? 'left' : 'right';
  return n.y < 0 ? 'top' : 'bottom';
}

export interface MotionResult {
  pos: Vec2;
  vel: Vec2;
  contacts: Contact[];
}

export interface MotionOptions {
  /** Fraction of the tangential velocity removed on every bounce (§2.2, LATERAL_FRICTION). */
  lateralFriction: number;
  /** Ids of bodies to ignore this tick (trampoline cooldown, dissolved snow, rest-exit lock). */
  ignoreIds?: ReadonlySet<string>;
  timeMs: number;
  /** Max number of successive contacts resolved within one tick (default 4). */
  maxIterations?: number;
  /** Restitution override per body id (e.g. jellyfish trampoline); default = body.restitution. */
  restitutionById?: ReadonlyMap<string, number>;
  /**
   * Capture hook (§2.3). Called with each contact as it is produced, BEFORE the bounce response.
   * Returning true ends the motion right there, leaving the circle at the contact and the velocity
   * untouched, so the caller can turn an ascending contact with a capturable bottom face into RESTING
   * "en un solo evento" (§2.3: "no hay traqueteo posible") instead of receiving a velocity that has
   * already been reflected and possibly bounced off three more bodies in the same tick.
   */
  stopAtContact?: (contact: Contact) => boolean;
}

const DEFAULT_MAX_ITERATIONS = 4;

/** Passes used to separate a circle that starts the tick already overlapping geometry. */
const DEPENETRATION_PASSES = 4;

/** Zero displacement: `sweepCircleAabb` with it answers "is the circle overlapping right now?". */
const NO_DISPLACEMENT: Vec2 = { x: 0, y: 0 };

/**
 * Moves the circle by vel*dt through `solids`, resolving up to `maxIterations` successive contacts.
 * On each contact: position is placed at the impact point (minus a tiny epsilon), the normal component
 * of velocity is reflected scaled by the body's restitution, the tangential component is scaled by
 * (1 - lateralFriction). Remaining time fraction continues the sweep. No tunneling at any speed.
 *
 * Bodies the circle is ALREADY inside when the tick starts are separated first, before any sweeping
 * (see `depenetrate`); that pass reports a contact per body but consumes no iteration and no time.
 * Only a body it could NOT be separated from — a pocket narrower than the diameter, §2.6 — is then
 * ignored for the rest of the tick, and Bur is treated as pinned against it rather than bouncing.
 * Pass `stopAtContact` to keep the rest-capture decision (§2.3) in the caller: without it the velocity
 * handed back has already been reflected and shaved, and the capture point is gone.
 */
export function moveCircle(
  pos: Vec2,
  vel: Vec2,
  r: number,
  dt: number,
  solids: readonly SolidEntity[],
  opts: MotionOptions,
): MotionResult {
  const maxIterations = Math.max(1, opts.maxIterations ?? DEFAULT_MAX_ITERATIONS);
  const friction = clamp(opts.lateralFriction, 0, 1);
  const result: MotionResult = { pos: { x: pos.x, y: pos.y }, vel: { x: vel.x, y: vel.y }, contacts: [] };
  if (!(dt > 0)) return result;

  // Bodies already resolved at t = 0 this tick: skipping them guarantees the loop makes progress.
  const depenetrated = new Set<string>();

  // --- Phase 1: separate from everything the circle starts the tick inside of ---------------------
  // The overwhelmingly common case is "nothing overlaps", so nothing beyond this probe is allocated.
  const startOverlaps = collectOverlaps(result.pos, r, solids, opts);
  if (startOverlaps.length > 0) {
    const initial = depenetrate(result, r, solids, opts, startOverlaps);
    // Report in `solids` order so the contact list is deterministic whatever the resolution order was.
    for (const solid of solids) {
      const overlap = initial.get(solid.id);
      if (overlap === undefined) continue;
      // The ban exists only to guarantee the tick makes progress, so it applies ONLY to bodies the
      // circle could not be separated from (a wedge). A body it is genuinely clear of stays live and
      // can be hit properly later in the same tick — banning it would let the circle sink into it.
      const jammed = sweepCircleAabb(result.pos, r, NO_DISPLACEMENT, solidRectAt(solid, opts.timeMs)) !== null;
      if (jammed) depenetrated.add(solid.id);
      if (!applyContact(result, solid, overlap.hit, opts.timeMs, friction, opts, jammed)) return result;
    }
  }

  // --- Phase 2: sweep the tick, resolving successive impacts --------------------------------------
  let remaining = dt;

  for (let iteration = 0; iteration < maxIterations && remaining > TIME_EPS; iteration++) {
    const delta = { x: result.vel.x * remaining, y: result.vel.y * remaining };

    let hit: SweepHit | null = null;
    let body: SolidEntity | null = null;
    for (const solid of solids) {
      if (opts.ignoreIds?.has(solid.id)) continue;
      if (depenetrated.has(solid.id)) continue;
      const candidate = sweepCircleAabb(result.pos, r, delta, solidRectAt(solid, opts.timeMs));
      if (candidate === null) continue;
      if (hit === null || candidate.t < hit.t) {
        hit = candidate;
        body = solid;
      }
    }

    if (hit === null || body === null) {
      result.pos.x += delta.x;
      result.pos.y += delta.y;
      return result;
    }

    const normal = hit.normal;
    const elapsed = dt - remaining + remaining * hit.t;

    // Place the circle at the impact, backed off along the normal so it is no longer overlapping.
    // At a genuine impact the gap is already exactly r, so the push is just CONTACT_EPSILON; on a
    // t = 0 hit (the bounce above pushed it into this body) it is whatever it takes to separate them.
    const impactX = result.pos.x + delta.x * hit.t;
    const impactY = result.pos.y + delta.y * hit.t;
    const push = separationDepth(impactX, impactY, r, hit);
    result.pos.x = impactX + normal.x * push;
    result.pos.y = impactY + normal.y * push;

    if (hit.t <= 0) depenetrated.add(body.id);

    if (!applyContact(result, body, hit, opts.timeMs + elapsed * 1000, friction, opts)) return result;

    remaining -= remaining * hit.t;
  }

  return result;
}

/** One body the circle overlaps, with the t = 0 contact that describes how to get out of it. */
interface Overlap {
  body: SolidEntity;
  hit: SweepHit;
}

/**
 * Records a contact, offers it to `stopAtContact`, and applies the velocity response.
 * `jammed` marks a body the circle could not be separated from (a corridor narrower than its
 * diameter, §2.6): being stuck inside geometry is not a bounce, so the inward normal component is
 * CANCELLED rather than reflected, and the tangential component is left alone. That keeps Bur from
 * rattling between two slabs (§2.3 "no hay traqueteo posible"), from drifting through one of them,
 * and — because lateral friction is a bounce cost (§2.2) and never applies here — able to slide out.
 * Returns false when the caller asked to stop the motion at this contact.
 */
function applyContact(
  result: MotionResult,
  body: SolidEntity,
  hit: SweepHit,
  timeMs: number,
  friction: number,
  opts: MotionOptions,
  jammed = false,
): boolean {
  const normal = hit.normal;
  const vn = result.vel.x * normal.x + result.vel.y * normal.y;
  const contact: Contact = {
    bodyId: body.id,
    body,
    face: hit.face,
    normal: { x: normal.x, y: normal.y },
    point: { x: hit.point.x, y: hit.point.y },
    approachSpeed: Math.max(0, -vn),
    timeMs,
  };
  result.contacts.push(contact);
  if (opts.stopAtContact?.(contact) === true) return false;

  if (vn < 0 && jammed) {
    // Pinned: drop the velocity that pushes further in, keep the one that can still get Bur out.
    result.vel = { x: result.vel.x - vn * normal.x, y: result.vel.y - vn * normal.y };
  } else if (vn < 0) {
    // Reflect the normal component (scaled by restitution) and shave the tangential component.
    const restitution = opts.restitutionById?.get(body.id) ?? body.restitution;
    const tx = result.vel.x - vn * normal.x;
    const ty = result.vel.y - vn * normal.y;
    const keep = 1 - friction;
    const bounce = -vn * restitution;
    result.vel = { x: tx * keep + normal.x * bounce, y: ty * keep + normal.y * bounce };
  }
  return true;
}

/** How far along the contact normal the circle must move from (x, y) to clear the body. */
function separationDepth(x: number, y: number, r: number, hit: SweepHit): number {
  const gap = (x - hit.point.x) * hit.normal.x + (y - hit.point.y) * hit.normal.y;
  return Math.max(0, r - gap) + CONTACT_EPSILON;
}

/** Bodies the circle is inside at `p`, in `solids` order (a zero-length sweep only hits overlaps). */
function collectOverlaps(
  p: Vec2,
  r: number,
  solids: readonly SolidEntity[],
  opts: MotionOptions,
): Overlap[] {
  const out: Overlap[] = [];
  for (const solid of solids) {
    if (opts.ignoreIds?.has(solid.id)) continue;
    const hit = sweepCircleAabb(p, r, NO_DISPLACEMENT, solidRectAt(solid, opts.timeMs));
    if (hit !== null) out.push({ body: solid, hit });
  }
  return out;
}

/** Deepest overlap of the circle at `p` into any body (0 when it is clear of all of them). */
function worstPenetration(p: Vec2, r: number, solids: readonly SolidEntity[], opts: MotionOptions): number {
  let worst = 0;
  for (const solid of solids) {
    if (opts.ignoreIds?.has(solid.id)) continue;
    const rect = solidRectAt(solid, opts.timeMs);
    const dx = p.x - clamp(p.x, rect.x, rect.x + rect.w);
    const dy = p.y - clamp(p.y, rect.y, rect.y + rect.h);
    worst = Math.max(worst, r - Math.hypot(dx, dy));
  }
  return worst;
}

/**
 * Places a circle that starts the tick already overlapping geometry, and returns the bodies it had to
 * resolve (they are ignored for the rest of the tick, so the tick always makes progress).
 *
 * Sequential (Gauss-Seidel) pushes resolve every FEASIBLE configuration exactly. When they do not,
 * the pocket is narrower than the diameter — §2.6 makes that a designed situation, not a corner case:
 * "en Z6 reinflar te impide pasar por las rendijas", and the moving ceilings of §5 (nº 3, nº 24) close
 * on a Bur that is already against a wall. No position is then free of every body, so pushing out of
 * the last body resolved just buries the circle in the previous one, permanently (a stable sink).
 * The fallback picks the position of LEAST MAXIMUM penetration instead — the middle of the corridor —
 * which is symmetric, stable tick after tick, and the shallowest wrong answer available.
 */
function depenetrate(
  result: MotionResult,
  r: number,
  solids: readonly SolidEntity[],
  opts: MotionOptions,
  startOverlaps: readonly Overlap[],
): Map<string, Overlap> {
  const touched = new Map<string, Overlap>();
  const start = { x: result.pos.x, y: result.pos.y };
  let overlaps: readonly Overlap[] = startOverlaps;
  remember(touched, overlaps);

  for (let pass = 0; pass < DEPENETRATION_PASSES && overlaps.length > 0; pass++) {
    for (const overlap of overlaps) {
      // Re-test: an earlier push in this pass may already have cleared this body.
      const live = sweepCircleAabb(result.pos, r, NO_DISPLACEMENT, solidRectAt(overlap.body, opts.timeMs));
      if (live === null) continue;
      const depth = separationDepth(result.pos.x, result.pos.y, r, live);
      result.pos.x += live.normal.x * depth;
      result.pos.y += live.normal.y * depth;
    }
    overlaps = collectOverlaps(result.pos, r, solids, opts);
    remember(touched, overlaps);
  }

  if (overlaps.length > 0) {
    const settled = leastPenetratingPlace(start, r, solids, opts, touched);
    result.pos.x = settled.x;
    result.pos.y = settled.y;
  }
  return touched;
}

/** First contact seen per body wins: it is the one measured at the circle's real start position. */
function remember(touched: Map<string, Overlap>, overlaps: readonly Overlap[]): void {
  for (const overlap of overlaps) if (!touched.has(overlap.body.id)) touched.set(overlap.body.id, overlap);
}

/**
 * Wedged pocket: searches for the position with the smallest deepest-overlap. Averaged (Jacobi) pushes
 * settle exactly on the middle of a corridor whose two walls both overlap the circle; when only one
 * wall overlaps at a time the pushes ping-pong between the two walls, and the midpoint of consecutive
 * candidates is that same middle — so both are offered to the search, which keeps the best one.
 */
function leastPenetratingPlace(
  start: Vec2,
  r: number,
  solids: readonly SolidEntity[],
  opts: MotionOptions,
  touched: Map<string, Overlap>,
): Vec2 {
  let best = { x: start.x, y: start.y };
  let bestPenetration = worstPenetration(best, r, solids, opts);
  let current = { x: start.x, y: start.y };

  for (let pass = 0; pass < DEPENETRATION_PASSES; pass++) {
    const overlaps = collectOverlaps(current, r, solids, opts);
    if (overlaps.length === 0) return current;
    remember(touched, overlaps);

    let dx = 0;
    let dy = 0;
    for (const overlap of overlaps) {
      const depth = separationDepth(current.x, current.y, r, overlap.hit);
      dx += overlap.hit.normal.x * depth;
      dy += overlap.hit.normal.y * depth;
    }
    dx /= overlaps.length;
    dy /= overlaps.length;
    // A zero average means every push cancels out: this IS the least-penetration place.
    if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) break;

    const next = { x: current.x + dx, y: current.y + dy };
    const middle = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
    for (const candidate of [next, middle]) {
      const penetration = worstPenetration(candidate, r, solids, opts);
      if (penetration < bestPenetration - EPS) {
        bestPenetration = penetration;
        best = candidate;
      }
    }
    current = next;
  }

  return best;
}

/**
 * Current rect of a rectangle carried by a `MovingSpec` at simulation time `timeMs` (§11.2). The
 * oscillation is a rule, not a property of solids: `Hazard.shape` moves under the very same spec, and
 * §11.7.14 (determinism) only holds while the two are literally the same arithmetic — a second copy in
 * `game/` would sample a moving anemone on a different curve from the ledge beside it.
 * `moving === undefined` (or a degenerate spec) returns a copy of the base rect.
 */
export function movingRectAt(rect: Rect, moving: MovingSpec | undefined, timeMs: number): Rect {
  if (moving === undefined || !(moving.range > 0) || !(moving.speed > 0)) {
    return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  }
  // A full cycle travels 2 * range px (half-range out, range back, half-range home) at `speed`.
  const periodS = (2 * moving.range) / moving.speed;
  const u = (timeMs / 1000 / periodS + (moving.phase ?? 0)) % 1;
  const offset = (moving.range / 2) * triangleWave(u);
  return moving.axis === 'x'
    ? { x: rect.x + offset, y: rect.y, w: rect.w, h: rect.h }
    : { x: rect.x, y: rect.y + offset, w: rect.w, h: rect.h };
}

/** Current rect of a possibly-moving solid at simulation time `timeMs` (kinematic oscillation). */
export function solidRectAt(solid: SolidEntity, timeMs: number): Rect {
  return movingRectAt(solid.rect, solid.type === 'ceiling' ? solid.moving : undefined, timeMs);
}

/**
 * Triangle wave in [-1, 1] with tri(0) = 0 (the base rect is the centre of the travel, §11.2),
 * peaking at +1 at u = 0.25 and at -1 at u = 0.75. Accepts any real `u` (including negatives).
 */
function triangleWave(u: number): number {
  const phase = (((u + 0.25) % 1) + 1) % 1;
  return 1 - 4 * Math.abs(phase - 0.5);
}
