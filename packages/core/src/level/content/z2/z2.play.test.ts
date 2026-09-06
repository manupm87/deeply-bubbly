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
import { HARNESS_VIEW_H, POINTER_UP, ScriptedFinger, buildMvpCampaign, createMvpWorld } from '../../../game/testHarness';
import { CURRENT_DRIFT, PULPO_REST_MS } from '../builders';
import { anemona, currentBand } from './builders';
import { Z2, z2Perch, z2Pulpo } from './builders';
import type { Campaign } from '../../campaign';
import type { Chunk, GameEvent, PointerInput, WorldEntity, WorldSnapshot } from '../../../types';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;
const RADIUS = zoneRadius(Z2, T);

/** A one-immersion campaign whose five playable chunks are all `body`, so Bur is born inside it. */
function campaignOf(body: WorldEntity[], entryAnchorId: string): Campaign {
  const chunks: Chunk[] = [];
  for (let i = 0; i < T.IMMERSION_CHUNKS; i++) {
    chunks.push({
      id: `fx-${i}`,
      zone: Z2,
      difficulty: 1,
      verbs: ['corriente'],
      entry: 'C',
      exit: 'C',
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

  it('a charge of 60 % or more buys the way out before the vent, and costs no Air', () => {
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

    // Hold 420 ms — over the ≈330 ms §2.4.5 prices the 60 % charge at — and release before the vent.
    // The window closes just past `ventAt`: leaving her in the water longer would only prove that an
    // anemone catches a bubble that floats straight back into her, which is a different sentence.
    const events = run(world, ventAt + 100 - world.snapshot().timeMs, (_i, s) => {
      const holding = s.timeMs >= startHoldAt && s.timeMs < startHoldAt + 420;
      return holding ? { down: true, x: s.bubble.pos.x, y: s.bubble.pos.y - s.camera.y + 45 } : POINTER_UP;
    });

    const launch = events.find((e) => e.type === 'launch');
    expect(launch).toBeDefined();
    expect(launch?.type === 'launch' && launch.power).toBeGreaterThanOrEqual(0.6);
    expect(world.snapshot().timeMs).toBeGreaterThan(ventAt); // the original deadline came and went
    expect(events.some((e) => e.type === 'airLost' && e.reason === 'trap')).toBe(false);
    expect(world.snapshot().bubble.air).toBe(before);
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

    // One shot straight down out of the rest pose, then hands off: the band does the rest.
    const events = run(world, 3000, (i, s) =>
      i >= 30 && i < 60 ? { down: true, x: s.bubble.pos.x, y: s.bubble.pos.y - s.camera.y + 45 } : POINTER_UP,
    );
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

// ---------------------------------------------------------------------------------------------
// The zone, played
// ---------------------------------------------------------------------------------------------

describe('Zone 2 is playable (§12.1, §12.3.2)', () => {
  it('a bot dropped at the Z1 -> Z2 station reaches the zone`s first breath buoy with Air to spare', () => {
    const world = createMvpWorld({ startStationIndex: 1 });
    const campaign = buildMvpCampaign(T);
    const finger = new ScriptedFinger(400, 140, 45, 16);
    const events: GameEvent[] = [];
    let snap = world.snapshot();
    let maxZone = snap.zone;
    let frames = 0;

    // Generous: §3.1 budgets a segment at 35 s, and the bot is a metronome, not a player.
    for (; frames < 300 * 60; frames++) {
      const pointer = finger.next(STEP_MS, snap.bubble.pos.x, snap.bubble.pos.y, snap.camera.y);
      world.update(STEP_MS, pointer);
      snap = world.snapshot();
      events.push(...snap.events);
      maxZone = Math.max(maxZone, snap.zone) as typeof maxZone;
      if (snap.run.lastBoyaId === 'boya:2') break;
      if (snap.phase === 'station') world.continueDescent();
      if (snap.phase === 'dead') world.restart();
    }

    expect(snap.run.lastBoyaId).toBe('boya:2');
    expect(frames).toBeLessThan(300 * 60);
    expect(maxZone).toBe(1);
    expect(snap.bubble.pos.y).toBeGreaterThanOrEqual(campaign.immersions[2]!.boyaY);
    expect(snap.bubble.air).toBeGreaterThan(0);
    // §11.7.12: the zone change is announced once, and Zone 2's capacity is still 8 pips.
    const zoneChanges = events.filter((e) => e.type === 'zoneChange');
    expect(zoneChanges).toHaveLength(1);
    expect(zoneChanges[0]).toEqual({ type: 'zoneChange', from: 0, to: 1 });
    expect(snap.bubble.airMax).toBe(T.ZONE_AIR_MAX[1]);
    expect(snap.bubble.radius).toBeCloseTo(RADIUS, 10);
  });

  it('never kills a naive bot, whatever its cadence, while the hazards still bite (§5 nº 7)', () => {
    // The regression this zone was rebuilt around. A review swept a metronome bot over 27 cadences and
    // 9 of them DIED, every death trap-driven: the anemone vented, dropped Bur a few px above her own
    // crown, and the escape — a downward launch — put her straight back in, one pip every TRAP_VENT_MS
    // until the bar was empty. Two things fixed it, and this sweep is what watches both: a vent now
    // leaves the crown open for TRAP_REARM_MS (`game/hazards.ts`), and no crown may sit anywhere a
    // 60 % charge cannot leave (`validator.trapEscapes`, checked per chunk in `z2.test.ts`).
    let deaths = 0;
    let trapPips = 0;
    let deepest = 0;
    for (const [hold, release, lateral] of [
      [300, 400, 40],
      [400, 300, 40],
      [400, 450, 40],
      [500, 300, 0],
      [500, 400, 40],
      [300, 450, 40],
    ] as const) {
      for (const startStationIndex of [1, 2]) {
        const world = createMvpWorld({ startStationIndex });
        const finger = new ScriptedFinger(hold, release, 45, lateral);
        let snap = world.snapshot();
        for (let i = 0; i < 90 * 60; i++) {
          world.update(STEP_MS, finger.next(STEP_MS, snap.bubble.pos.x, snap.bubble.pos.y, snap.camera.y));
          snap = world.snapshot();
          for (const e of snap.events) {
            if (e.type === 'gameOver') deaths++;
            if (e.type === 'airLost' && e.reason === 'trap') trapPips++;
          }
          deepest = Math.max(deepest, snap.run.maxProgressY);
          if (snap.phase === 'campaignComplete') break;
          if (snap.phase === 'station') world.continueDescent();
          if (snap.phase === 'dead') world.restart();
        }
      }
    }
    expect(deaths, 'a naive bot must never be killed by Zone 2').toBe(0);
    expect(trapPips, 'the anemone must still cost pips: a harmless trap is not a fix').toBeGreaterThan(0);
    expect(deepest).toBeGreaterThanOrEqual(7200 - T.CHUNK_H); // some cadence crosses the whole zone
  });

  it('a bot that keeps going crosses the whole zone and ends the campaign at the delivery station', () => {
    const world = createMvpWorld({ startStationIndex: 1 });
    const finger = new ScriptedFinger(400, 140, 45, 16);
    let snap = world.snapshot();
    let monotonic = true;
    let previous = -Infinity;
    let deepest = 0;
    const zones = new Set<number>();

    for (let i = 0; i < 600 * 60; i++) {
      const pointer = finger.next(STEP_MS, snap.bubble.pos.x, snap.bubble.pos.y, snap.camera.y);
      world.update(STEP_MS, pointer);
      snap = world.snapshot();
      for (const e of snap.events) if (e.type === 'zoneChange') zones.add(e.to);
      if (snap.run.maxProgressY < previous) monotonic = false;
      previous = snap.run.maxProgressY;
      deepest = Math.max(deepest, snap.run.maxProgressY);
      if (snap.phase === 'campaignComplete') break;
      if (snap.phase === 'station') world.continueDescent();
      if (snap.phase === 'dead') world.restart();
      expect(snap.bubble.pos.x).toBeGreaterThanOrEqual(0);
      expect(snap.bubble.pos.x).toBeLessThanOrEqual(T.WORLD_W);
    }

    expect(monotonic).toBe(true);
    expect(snap.phase).toBe('campaignComplete');
    // The column ends exactly on the Z2/Z3 border (§11.1), and the last fall crosses it before
    // `campaignComplete` fires. The run must never announce a zone it does not contain: a naive bot used
    // to report a `zoneChange` into Zone 3 and the shell repainted to its palette for a frame.
    expect(zones.has(2)).toBe(false);
    expect(zones.has(1)).toBe(true);
    expect(deepest).toBeGreaterThanOrEqual(6960); // into the last station band of the zone
    expect(snap.run.lastStationIndex).toBe(4);
  });
});
