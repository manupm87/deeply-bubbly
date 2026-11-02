/**
 * Where a shot ends: the same `physicsStep` the release will run, carried past the 2.5 s of core's dotted
 * guide until Bur touches something. It answers the one question a first-time player cannot answer from
 * the arc alone: "does this land?". Core decides nothing here and is told nothing; the forecast only
 * reads the snapshot, and stops at the first contact because that is as far as the guide is exact (§2.7).
 */
import {
  aimImpulse,
  circleRectOverlap,
  hazardActiveAt,
  hazardRectAt,
  launchLockSteps,
  launchVelocity,
  physicsStep,
  sampleForceFields,
  sideWalls,
} from '@deeply-bubbly/core';
import type { Ceiling, ForceField, Hazard, SolidEntity, Tuning, Vec2, WorldSnapshot } from '@deeply-bubbly/core';

const MAX_SECONDS = 8;
/** Below this, a landing is the ledge she left or one beside it, not a step down. */
const PROGRESS_MIN_PX = 12;
/** How far around Bur the world's two column walls are built: more than any shot can travel. */
const WALL_SPAN_PX = 800;

export interface ShotForecast {
  /** One point per fixed step, from Bur to the end of the flight. */
  path: Vec2[];
  /** The ledge that captures her, or null if she bounces off something or floats away first. */
  ceiling: Ceiling | null;
  /** True when the ledge is deeper than the one she is leaving. */
  progress: boolean;
  /** First point of the path inside a hazard that will be armed then: a rhythm gate opens and shuts it. */
  hazardAt: Vec2 | null;
}

interface WorldParts {
  solids: SolidEntity[];
  fields: ForceField[];
  hazards: Hazard[];
}

function partsOf(snapshot: WorldSnapshot, t: Tuning): WorldParts {
  const y = snapshot.bubble.pos.y;
  const solids: SolidEntity[] = sideWalls(y - WALL_SPAN_PX, y + WALL_SPAN_PX, t);
  const fields: ForceField[] = [];
  const hazards: Hazard[] = [];
  for (const e of snapshot.entities) {
    if (e.type === 'ceiling' || e.type === 'wall') solids.push(e);
    else if (e.type === 'forcefield') fields.push(e);
    else if (e.type === 'hazard') hazards.push(e);
  }
  return { solids, fields, hazards };
}

/** Flies one shot from `start`. The ledge she leaves is ignored while the launch lock lasts, as in core. */
export function forecastFlight(snapshot: WorldSnapshot, start: Vec2, vel: Vec2, t: Tuning): ShotForecast {
  const { solids, fields, hazards } = partsOf(snapshot, t);
  const radius = snapshot.bubble.radius;
  const dt = t.FIXED_DT;
  const lock = launchLockSteps(t);
  const passThrough = new Set<string>();
  for (const entry of snapshot.bubble.passThrough ?? []) {
    if (entry.until > snapshot.timeMs) passThrough.add(entry.id);
  }
  const inLock = new Set(passThrough);
  if (snapshot.bubble.restingOnId !== null) inLock.add(snapshot.bubble.restingOnId);
  const path: Vec2[] = [{ x: start.x, y: start.y }];
  const out: ShotForecast = { path, ceiling: null, progress: false, hazardAt: null };
  let pos = start;
  let v = vel;
  const steps = Math.floor(MAX_SECONDS / dt);
  for (let i = 0; i < steps; i++) {
    const timeMs = snapshot.timeMs + i * dt * 1000;
    const launched = i < lock;
    const stepped = physicsStep(
      { pos, vel: v, radius, state: launched ? 'LAUNCHED' : 'IDLE' },
      { solids, fields },
      {
        dt,
        timeMs,
        lateralFriction: t.LATERAL_FRICTION,
        dampingMul: launched ? t.LAUNCH_DAMPING_MUL : 1,
        maxIterations: 1,
        ignoreIds: launched ? inLock : passThrough,
      },
      t,
    );
    pos = stepped.pos;
    v = stepped.vel;
    path.push({ x: pos.x, y: pos.y });
    if (out.hazardAt === null && hazards.some((h) => hazardActiveAt(h, timeMs) && circleRectOverlap(pos, radius, hazardRectAt(h, timeMs)))) {
      out.hazardAt = { x: pos.x, y: pos.y };
    }
    const contact = stepped.contacts[0];
    if (contact === undefined) continue;
    const body = contact.body;
    const captured =
      !launched &&
      contact.face === 'bottom' &&
      body.type === 'ceiling' &&
      body.capturable &&
      contact.approachSpeed > 0 &&
      contact.approachSpeed <= t.REST_CAPTURE_SPEED;
    if (captured) {
      out.ceiling = body;
      out.progress = pos.y > start.y + PROGRESS_MIN_PX;
    }
    break;
  }
  return out;
}

/** The forecast of the pull being held right now, or null when no shot would leave. */
export function forecastAim(snapshot: WorldSnapshot, t: Tuning): ShotForecast | null {
  const b = snapshot.bubble;
  if (b.aimOrigin === null || b.cancelZone) return null;
  const { solids, fields } = partsOf(snapshot, t);
  const env = sampleForceFields(b.pos, b.radius, fields);
  return forecastFlight(snapshot, b.pos, launchVelocity(b.pullTheta, aimImpulse(b, solids, env, snapshot.timeMs, t)), t);
}

/** The next rest point down: what a player should be looking for, in the bot's own words (`pickShot`). */
export function nextTarget(snapshot: WorldSnapshot): Vec2 | null {
  const y = snapshot.bubble.pos.y + PROGRESS_MIN_PX;
  let best: Vec2 | null = null;
  for (const e of snapshot.entities) {
    if (e.type !== 'anchor' || e.pos.y <= y) continue;
    if (best === null || e.pos.y < best.y) best = e.pos;
  }
  return best;
}
