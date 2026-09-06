/**
 * Zone 2 end to end: the three mechanics the zone introduces, played through the real `GameWorld`, plus
 * a headless bot that has to reach the zone's first breath buoy (GDD §12.3.2, §11.7.14).
 *
 * The unit-level contracts of the trap already live in `game/hazards.test.ts`; what is checked HERE is
 * the wiring — that authored Zone 2 content, `GameWorld`'s step order and the tuning of §11.6 add up to
 * the sentences §5 nº 7, nº 8 and nº 9 actually promise.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../../tuning';
import { MemoryStore, noopAds, noopTelemetry } from '../../../ports';
import { zoneRadius } from '../../../control/charge';
import { physicsStep } from '../../../physics/step';
import { NEUTRAL_ENV, sampleForceFields } from '../../../physics/forceFields';
import { integrateVelocity } from '../../../physics/integrator';
import { buildCampaign } from '../../campaign';
import { ChunkLibrary } from '../../library';
import { GameWorld } from '../../../game/GameWorld';
import { HARNESS_VIEW_H, POINTER_UP, buildMvpCampaign, createMvpWorld, pullGesture } from '../../../game/testHarness';
import { CURRENT_DRIFT, PULPO_REST_MS } from '../builders';
import { anemona, currentBand } from './builders';
import { Z2, z2Perch, z2Pulpo } from './builders';
import type { Campaign } from '../../campaign';
import type { Vec2 } from '../../../math/vec';
import type { Chunk, GameEvent, PointerInput, WorldEntity, WorldSnapshot } from '../../../types';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;


const RADIUS = zoneRadius(Z2, T);

/**
 * A D2 pull, in viewport coordinates, from an origin frozen at the pointerdown. The slingshot launches
 * Bur in the direction OPPOSITE to the drag (`pullGesture`), so "shoot straight down" is a finger that
 * travels UP the screen — which is exactly the sign a hand-written fixture gets wrong.
 */
function drag(origin: Vec2, power: number, thetaDeg = 0): PointerInput {
  const pull = pullGesture(power, thetaDeg, T);
  return { down: true, x: origin.x + pull.x, y: origin.y + pull.y };
}

/** The viewport point under Bur: where a finger that wants to shoot from where she is would press. */
const screenOf = (s: WorldSnapshot): Vec2 => ({ x: s.bubble.pos.x - s.camera.x, y: s.bubble.pos.y - s.camera.y });

/** A one-immersion campaign whose five playable chunks are all `body`, so Bur is born inside it. */
function campaignOf(body: WorldEntity[], entryAnchorId: string): Campaign {
  const chunks: Chunk[] = [];
  for (let i = 0; i < T.IMMERSION_CHUNKS; i++) {
    chunks.push({
      id: `fx-${i}`,
      zone: Z2,
      difficulty: 1,
      verbs: ['corriente'],
      entryAnchorId,
      exitAnchorId: entryAnchorId,
      airBudget: 0,
      targetTimeS: 8,
      tags: [],
      role: i === T.IMMERSION_CHUNKS - 1 ? 'station' : 'playable',
      entities: body,
    });
  }
  return buildCampaign(new ChunkLibrary(chunks), [chunks.map((c) => c.id)], T);
}

function worldOn(campaign: Campaign): GameWorld {
  return new GameWorld({
    campaign,
    tuning: T,
    telemetry: noopTelemetry,
    ads: noopAds,
    store: new MemoryStore(),
    viewH: HARNESS_VIEW_H,
    seed: 1,
  });
}

/** Steps the world for `ms`, collecting every event; `pointer` may vary with the step index. */
function run(world: GameWorld, ms: number, pointer: (i: number, s: WorldSnapshot) => PointerInput): GameEvent[] {
  const events: GameEvent[] = [];
  let snap = world.snapshot();
  for (let i = 0; i < Math.round(ms / STEP_MS); i++) {
    world.update(STEP_MS, pointer(i, snap));
    snap = world.snapshot();
    events.push(...snap.events);
  }
  return events;
}

// ---------------------------------------------------------------------------------------------
// §5 nº 7 — Anémona Pegajosa
// ---------------------------------------------------------------------------------------------

/**
 * A ledge with an anemone growing where Bur rests. She is born SPAWN_BELOW_ANCHOR_PX under the anchor
 * and floats up into it on her own (§8 step 1), which is the cheapest honest way to put the real
 * `GameWorld` inside the trap without scripting a landing.
 */
function anemoneFixture(): { entities: WorldEntity[]; anchorId: string } {
  const [ledge, anchor] = z2Perch({ id: 'fx-ledge', x: 66, y: 60, w: 48, anchorX: 90 });
  // Her box straddles the rest pose (60 + 10 + 6,44 = 76,44), which is exactly where a landing ends.
  return { entities: [ledge, anchor, anemona('fx-anemona', 90, 84)], anchorId: anchor.id };
}

describe('Anémona Pegajosa end to end (§5 nº 7, §2.4.5)', () => {
  it('holds Bur, suppresses her input for TRAP_HOLD_MS and vents one pip at TRAP_VENT_MS', () => {
    const fx = anemoneFixture();
    const world = worldOn(campaignOf(fx.entities, fx.anchorId));
    const before = world.snapshot().bubble.air;

    // She floats up off the spawn point into the anemone on her own (§8 step 1), hands off the glass.
    const caught = run(world, 700, () => POINTER_UP);
    const trapped = world.snapshot();
    expect(trapped.bubble.flags.trapVentAt).toBeGreaterThan(0); // armed: she is inside her
    expect(caught.some((e) => e.type === 'airLost')).toBe(false); // the anemone never hits, she vents

    // A finger pressed hard on the glass while the pin runs must do nothing at all (§5 nº 7).
    const held: PointerInput = { down: true, x: 90, y: 200 };
    run(world, 200, () => held);
    expect(world.snapshot().bubble.state).not.toBe('CHARGING');
    expect(world.snapshot().bubble.air).toBe(before);

    const rest = run(world, 1600, () => POINTER_UP);
    const vent = rest.filter((e) => e.type === 'airLost' && e.reason === 'trap');
    expect(vent).toHaveLength(1);
    expect(world.snapshot().bubble.air).toBe(before - 1);
    expect(world.snapshot().bubble.flags.trapVentAt).toBe(0); // venting also frees her
  });

  it('a charge of 60 % or more buys the way out before the vent, and costs neither pip nor double jump', () => {
    const fx = anemoneFixture();
    const world = worldOn(campaignOf(fx.entities, fx.anchorId));
    const before = world.snapshot().bubble.air;

    // Float into her, then read the deadline she armed: `trapVentAt` IS the 1.500 ms of §2.4.5, and the
    // pin ends TRAP_HOLD_MS after the catch, i.e. 700 ms before it.
    run(world, 700, () => POINTER_UP);
    const ventAt = world.snapshot().bubble.flags.trapVentAt;
    expect(ventAt).toBeGreaterThan(0);
    const caughtAt = ventAt - T.TRAP_VENT_MS;
    const startHoldAt = caughtAt + T.TRAP_HOLD_MS + STEP_MS;

    // Draw the sling for 420 ms and let go before the vent. D2 measures the power as the DRAG, so the
    // origin is frozen at the pointerdown and the finger walks away from it; the window closes just past
    // `ventAt`, because leaving her in the water longer would only prove that an anemone catches a
    // bubble that floats straight back into her, which is a different sentence.
    let origin: Vec2 | null = null;
    const events = run(world, ventAt + 100 - world.snapshot().timeMs, (_i, s) => {
      const holding = s.timeMs >= startHoldAt && s.timeMs < startHoldAt + 420;
      if (!holding) {
        origin = null;
        return POINTER_UP;
      }
      if (origin === null) {
        origin = screenOf(s);
        return { down: true, x: origin.x, y: origin.y };
      }
      return drag(origin, 0.9);
    });

    const launch = events.find((e) => e.type === 'launch');
    expect(launch).toBeDefined();
    expect(launch?.type === 'launch' && launch.power).toBeGreaterThanOrEqual(0.6);
    expect(world.snapshot().timeMs).toBeGreaterThan(ventAt); // the original deadline came and went
    expect(events.some((e) => e.type === 'airLost' && e.reason === 'trap')).toBe(false);
    // The escape is NOT the D1 double jump, and that is the whole of "recurso, NO muerte". A pinned
    // Bur is held against a surface, not adrift, so `bubbleStep` reads the crown's own stamp
    // (`flags.trapVentAt`) and prices the shot as a rest launch: no pip, no budget spent. Charging it
    // to the double jump would make an anemone met on the last pip an unavoidable death — D1 refuses a
    // mid-air launch there — which is the opposite of what §2.4.5 and §5 nº 7 promise.
    expect(launch?.type === 'launch' && launch.airLaunch).toBe(false);
    expect(events.filter((e) => e.type === 'airLost')).toHaveLength(0);
    expect(world.snapshot().bubble.air).toBe(before);
    expect(world.snapshot().bubble.airLaunchesUsed).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// §5 nº 8 — Corriente de Arrecife
// ---------------------------------------------------------------------------------------------

describe('Corriente de Arrecife end to end (§5 nº 8)', () => {
  it('settles Bur at ±90 px/s of lateral drift, which is what v_term = a / DAMPING_X buys', () => {
    // The derivation the content is authored against, run through the REAL integrator: an authored band
    // and nothing else. The discrete 1/60 s fixed point sits 0,25 % above the continuous limit.
    const band = currentBand('drift', 0, 0, 180, 240, 1);
    const fields = [band];
    let body = { pos: { x: 20, y: 100 }, vel: { x: 0, y: 0 }, radius: RADIUS, state: 'IDLE' as const };
    let vx = 0;
    // 3 000 steps = 50 s = 15 time constants of DAMPING_X: the exponential is gone to 1 part in 10^6.
    for (let i = 0; i < 3000; i++) {
      const stepped = physicsStep(
        body,
        { solids: [], fields },
        { dt: T.FIXED_DT, timeMs: i * STEP_MS, lateralFriction: T.LATERAL_FRICTION, dampingMul: 1 },
        T,
      );
      // Keep her in open water: only the horizontal axis is under test.
      body = { ...body, pos: { x: 90, y: 100 }, vel: { x: stepped.vel.x, y: 0 } };
      vx = stepped.vel.x;
    }
    // The band really is being sampled at that position; a silent miss would read as "no drift".
    expect(sampleForceFields(body.pos, body.radius, fields).force.x).toBeCloseTo(band.vector.x, 10);
    expect(vx).toBeGreaterThan(CURRENT_DRIFT * 0.99);
    expect(vx).toBeLessThan(CURRENT_DRIFT * 1.01);

    const leftward = currentBand('drift-l', 0, 0, 180, 240, -1);
    expect(leftward.vector.x).toBeCloseTo(-band.vector.x, 10);
  });

  it('carries Bur sideways in the real world, without touching her Air or opening ASCENSO (§4.3)', () => {
    const [ledge, anchor] = z2Perch({ id: 'fx-ledge', x: 66, y: 20, w: 48, anchorX: 90 });
    const entities: WorldEntity[] = [ledge, anchor, currentBand('fx-corriente', 0, 60, 180, 160, 1)];
    const world = worldOn(campaignOf(entities, anchor.id));
    const before = world.snapshot().bubble.air;

    // One full pull straight down out of the rest pose, then hands off: the band does the rest.
    let origin: Vec2 | null = null;
    const events = run(world, 3000, (i, s) => {
      if (i < 30 || i >= 60) {
        origin = null;
        return POINTER_UP;
      }
      if (origin === null) {
        origin = screenOf(s);
        return { down: true, x: origin.x, y: origin.y };
      }
      return drag(origin, 1);
    });
    const snap = world.snapshot();
    expect(snap.bubble.pos.x).toBeGreaterThan(120); // launched from x = 90 and pushed right
    expect(snap.bubble.pos.x).toBeLessThanOrEqual(T.WORLD_W);
    expect(snap.bubble.air).toBe(before);
    expect(events.some((e) => e.type === 'ascensoStart')).toBe(false);
    expect(snap.bubble.flags.ascensoUntil).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// §5 nº 9 — Pulpo Camuflado
// ---------------------------------------------------------------------------------------------

describe('Pulpo Camuflado end to end (§5 nº 9)', () => {
  it('tips Bur off downward at 0,5 s with restRelease("timeout"), never up and never for a pip', () => {
    const [pulpo, anchor] = z2Pulpo('fx-pulpo', 66, 60, 48, 90);
    const world = worldOn(campaignOf([pulpo, anchor], anchor.id));
    const before = world.snapshot().bubble.air;

    // She floats up into him and rests; PULPO_REST_MS later he displaces her.
    const events = run(world, 2500, () => POINTER_UP);
    const releases = events.filter((e) => e.type === 'restRelease' && e.reason === 'timeout');
    expect(releases.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === 'rest' && e.kind === 'impaciente')).toBe(true);
    expect(events.some((e) => e.type === 'airLost')).toBe(false);
    expect(world.snapshot().bubble.air).toBe(before); // "desplaza suave": he is not a Hazard
    expect(PULPO_REST_MS).toBe(500);
  });

  it('pushes DOWN at REST_RELEASE_PUSH, and a plain posadero of the same shape holds six times longer', () => {
    const [pulpo, pulpoAnchor] = z2Pulpo('fx-pulpo', 66, 60, 48, 90);
    const [rock, rockAnchor] = z2Perch({ id: 'fx-rock', x: 66, y: 60, w: 48, anchorX: 90 });

    const restMsUntilRelease = (entities: WorldEntity[], anchorId: string): number => {
      const world = worldOn(campaignOf(entities, anchorId));
      let resting = 0;
      for (let i = 0; i < 60 * 8; i++) {
        world.update(STEP_MS, POINTER_UP);
        const snap = world.snapshot();
        if (snap.bubble.state === 'RESTING') resting = snap.bubble.restMs;
        if (snap.events.some((e) => e.type === 'restRelease' && e.reason === 'timeout')) {
          // REST_RELEASE_PUSH is assigned inside the step and then integrated once before the snapshot
          // (§11.4 order), so what the shell sees is 90 px/s put through exactly one free step.
          const expected = integrateVelocity(
            { x: 0, y: T.REST_RELEASE_PUSH },
            T.FIXED_DT,
            { state: 'IDLE', env: NEUTRAL_ENV, dampingMul: 1 },
            T,
          ).y;
          expect(snap.bubble.vel.y).toBeCloseTo(expected, 6); // positive = DOWN (§11.6), never up
          expect(snap.bubble.vel.y).toBeGreaterThan(0);
          return resting;
        }
      }
      return -1;
    };

    const onPulpo = restMsUntilRelease([pulpo, pulpoAnchor], pulpoAnchor.id);
    const onRock = restMsUntilRelease([rock, rockAnchor], rockAnchor.id);
    expect(onPulpo).toBeGreaterThan(0);
    expect(onPulpo).toBeLessThan(PULPO_REST_MS + 2 * STEP_MS);
    expect(onRock).toBeGreaterThan(T.REST_MAX_MS.posadero - 2 * STEP_MS);
  });

  it('reaches the shell as a creature ledge, not as a rock one (§8: silhouette first)', () => {
    const world = createMvpWorld({ startStationIndex: 1 });
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      world.update(STEP_MS, POINTER_UP);
      for (const e of world.snapshot().entities) seen.add(e.type);
    }
    // The catalogId + material pair is the whole contract with the renderer; it survives instantiation.
    const authored = buildMvpCampaign(T).placed.flatMap((p) => p.chunk.entities);
    const octopus = authored.filter((e) => e.type === 'ceiling' && e.catalogId === 9);
    expect(octopus.length).toBeGreaterThanOrEqual(4);
    for (const c of octopus) expect(c.type === 'ceiling' && c.material).toBe('creature');
    expect(seen.has('ceiling')).toBe(true);
  });
});
