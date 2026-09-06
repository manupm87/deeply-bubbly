/**
 * The façade end to end, on the real Zone 1 campaign (§12.1). These are the contracts a shell depends
 * on: the fixed-step accumulator (§11.4), determinism (§11.7.14), the checkpoint chain and the death
 * flow (§11.7.6), the resaca (§2.4.2) and the station (§3.3).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, createTuning } from '../tuning';
import { MemoryStore, noopAds, noopTelemetry } from '../ports';
import { SAVE_KEY, defaultSave } from '../run/save';
import { SPAWN_BELOW_ANCHOR_PX } from '../run/respawn';
import { ChunkLibrary } from '../level/library';
import { buildCampaign } from '../level/campaign';
import { Z1_CHUNKS, Z1_SEQUENCES, perch } from '../level/content/z1';
import { GameWorld } from './GameWorld';
import { HARNESS_VIEW_H, ScriptedFinger, buildZ1Campaign, createTestWorld } from './testHarness';
import type { Campaign } from '../level/campaign';
import type { Chunk, GameEvent, PointerInput, WorldSnapshot, ZoneIndex } from '../types';
import type { SaveData } from '../run/save';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;
const CAMPAIGN = buildZ1Campaign(T);
const IMMERSION_0 = CAMPAIGN.immersions[0];
const UP: PointerInput = { down: false, x: 0, y: 0 };

if (IMMERSION_0 === undefined) throw new Error('Z1 campaign has no first immersion');

/**
 * Where the Z1 campaign starts (§8 step 1, §2.3): SPAWN_BELOW_ANCHOR_PX under the declared rest point of
 * the foam raft of `z1-open-1` — the raft is at y = 188 and 10 px thick, so with Bur's 7 px Z1 radius the
 * anchor is (40, 205). Bur is born just below it and rises into it on her own, without crossing the surface.
 */
const Z1_START = { x: 40, y: 205 + SPAWN_BELOW_ANCHOR_PX };

/** Falling free: nothing is holding her and she is fast enough that the camera has to chase her. */
function falling(snap: WorldSnapshot): boolean {
  return snap.bubble.restingOnId === null && snap.bubble.vel.y > 200;
}

/**
 * `charge straight down, release` until Bur is really falling. From the start she is resting under the
 * foam raft and the first shot is often caught by that same raft on the way back up (§2.3), so one round
 * is not enough to get the camera moving.
 */
function fallFromTheRaft(world: GameWorld): WorldSnapshot {
  let snap = world.snapshot();
  for (let round = 0; round < 8 && !falling(snap); round++) {
    for (let i = 0; i < 34; i++) {
      world.update(STEP_MS, { down: true, x: snap.bubble.pos.x, y: snap.bubble.pos.y - snap.camera.y + 45 });
      snap = world.snapshot();
    }
    for (let i = 0; i < 19; i++) {
      world.update(STEP_MS, UP); // release + the LAUNCH_LOCK_MS window, so a press is accepted again
      snap = world.snapshot();
    }
  }
  return snap;
}

/** A world on a campaign of our own; `createTestWorld` always builds the shipped Z1 one. */
function createWorldOn(campaign: Campaign): GameWorld {
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

/** The ledge every open-water chunk carries, and the rest point `perch` declares under it (§11.2). */
const [OPEN_LEDGE, OPEN_REST] = perch({ id: 'ow-ledge', x: 140, y: 60, w: 36, anchorX: 158 });

/**
 * A one-immersion campaign of open water: every chunk is that single narrow ledge on the right, with
 * nothing at all over the other two thirds of the 180 px column. Bur is born under the first ledge and
 * rests there exactly as she does on the real Z1 opening; what the real content never offers is the
 * second half — ONE shot into the open column leaves her with no ceiling above her head, and buoyancy
 * alone then carries her out of the top of the view, which is the resaca of §2.4.2 / §4.3.
 */
function openWaterCampaign(): Campaign {
  const chunks: Chunk[] = [];
  for (let i = 0; i < T.IMMERSION_CHUNKS; i++) {
    chunks.push({
      id: `ow-${i}`,
      zone: 0 as ZoneIndex,
      difficulty: 1,
      verbs: ['cargar', 'soltar', 'reposar'],
      entry: 'R',
      exit: 'R',
      entryAnchorId: OPEN_REST.id,
      exitAnchorId: OPEN_REST.id,
      airBudget: 0,
      targetTimeS: 8,
      tags: [],
      role: i === T.IMMERSION_CHUNKS - 1 ? 'station' : 'playable',
      // `instantiateChunk` deep-copies and prefixes with the placed index, so sharing the two entity
      // objects between chunks is safe: every placement gets its own '<index>:ow-ledge'.
      entities: [OPEN_LEDGE, OPEN_REST],
    });
  }
  return buildCampaign(new ChunkLibrary(chunks), [chunks.map((c) => c.id)], T);
}

/**
 * Bur off her ledge and into the open column: let her rise into the ledge and rest, then a hold aimed
 * down and to the left, released. Chunk 0 sits at worldY 0, so its local anchor IS the world anchor.
 */
function shootIntoTheOpen(world: GameWorld): void {
  let snap = world.snapshot();
  for (let i = 0; i < 90; i++) {
    world.update(STEP_MS, UP);
    snap = world.snapshot();
  }
  expect(snap.bubble.restingOnId).toBe(`0:${OPEN_LEDGE.id}`);
  for (let i = 0; i < 40; i++) {
    world.update(STEP_MS, { down: true, x: snap.bubble.pos.x - 80, y: snap.bubble.pos.y - snap.camera.y + 45 });
    snap = world.snapshot();
  }
  for (let i = 0; i < 5; i++) {
    world.update(STEP_MS, UP); // release
    snap = world.snapshot();
  }
  expect(snap.bubble.restingOnId).toBeNull();
}

/**
 * Runs the "charge, release, repeat" bot of §11.7.14 for `seconds`, answering the two prompts a player
 * would ("Seguir bajando", "Otra vez"), and reports everything the assertions below need.
 */
function playBot(
  world: GameWorld,
  seconds: number,
  options: { stopAt?: (s: WorldSnapshot) => boolean; restart?: boolean } = {},
): { snap: WorldSnapshot; events: GameEvent[]; monotonic: boolean; frames: number; xInsideColumn: boolean } {
  const finger = new ScriptedFinger(400, 140, 45, 16);
  const events: GameEvent[] = [];
  let snap = world.snapshot();
  let monotonic = true;
  let xInsideColumn = true;
  let previous = -Infinity;
  let frames = 0;

  for (; frames < Math.round(seconds * 60); frames++) {
    const pointer = finger.next(STEP_MS, snap.bubble.pos.x, snap.bubble.pos.y, snap.camera.y);
    world.update(STEP_MS, pointer);
    snap = world.snapshot();
    events.push(...snap.events);
    if (snap.run.maxProgressY < previous) monotonic = false;
    previous = snap.run.maxProgressY;
    if (snap.bubble.pos.x < 0 || snap.bubble.pos.x > T.WORLD_W) xInsideColumn = false;
    if (options.stopAt?.(snap) === true) break;
    if (snap.phase === 'station') world.continueDescent();
    if (snap.phase === 'dead' && options.restart !== false) world.restart();
  }
  return { snap, events, monotonic, frames, xInsideColumn };
}

/** Everything a determinism comparison must cover; JSON so a diff is readable when it fails. */
function digest(snap: WorldSnapshot): string {
  return JSON.stringify({
    timeMs: snap.timeMs,
    phase: snap.phase,
    zone: snap.zone,
    bubble: snap.bubble,
    camera: snap.camera,
    run: snap.run,
    hud: snap.hud,
    trajectory: snap.trajectory,
    events: snap.events,
    entities: snap.entities.map((e) => e.id),
  });
}

describe('the first immersion is playable (§12.1, §12.3.2)', () => {
  it('a bot that charges 400 ms and releases reaches the first boya well inside the pillar-3 budget', () => {
    const world = createTestWorld();
    const run = playBot(world, 90, { stopAt: (s) => s.run.lastBoyaId !== null });

    expect(run.snap.run.lastBoyaId).toBe('boya:0');
    expect(run.events.some((e) => e.type === 'boya' && e.boyaId === 'boya:0')).toBe(true);
    expect(run.snap.bubble.pos.y).toBeGreaterThanOrEqual(IMMERSION_0.boyaY);
    expect(run.frames).toBeLessThan(90 * 60);
    expect(run.monotonic).toBe(true);
    expect(run.snap.bubble.air).toBeGreaterThan(0);
  });

  it('progress never goes back and Bur never leaves the 180 px column (§4.3)', () => {
    const world = createTestWorld();
    const run = playBot(world, 60);
    expect(run.monotonic).toBe(true);
    expect(run.xInsideColumn).toBe(true);
    expect(run.snap.run.maxProgressY).toBeGreaterThan(IMMERSION_0.stationY);
  });

  it('collects each pickup exactly once, even across a re-entered chunk', () => {
    const world = createTestWorld();
    const run = playBot(world, 60);
    const ids = run.events.flatMap((e) => (e.type === 'pickup' ? [e.pickup.id] : []));
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(run.snap.entities.some((e) => e.id === id)).toBe(false);
  });

  it('reaches the station, recharges to the zone capacity and waits for the player (§3.3)', () => {
    const world = createTestWorld();
    const run = playBot(world, 90, { stopAt: (s) => s.phase === 'station' });

    expect(run.snap.phase).toBe('station');
    expect(run.snap.bubble.pos.y).toBeGreaterThanOrEqual(IMMERSION_0.stationY);
    expect(run.snap.bubble.air).toBe(T.ZONE_AIR_MAX[0]);
    expect(run.snap.bubble.airMax).toBe(T.ZONE_AIR_MAX[0]);
    expect(run.snap.run.lastStationIndex).toBe(0);
    expect(run.snap.run.immersionIndex).toBe(1);
    expect(run.events.some((e) => e.type === 'immersionComplete' && e.immersionIndex === 0)).toBe(true);

    // Input is ignored until "Seguir bajando": a station is a pause, not a level.
    const held: PointerInput = { down: true, x: 90, y: 200 };
    for (let i = 0; i < 120; i++) world.update(STEP_MS, held);
    expect(world.snapshot().bubble.state).not.toBe('CHARGING');
    expect(world.snapshot().phase).toBe('station');

    world.continueDescent();
    expect(world.snapshot().phase).toBe('playing');
  });

  it('unlocks the checkpoint in the save on the way through the station', () => {
    const store = new MemoryStore();
    const world = createTestWorld({ store });
    playBot(world, 90, { stopAt: (s) => s.phase === 'station' });
    const saved = JSON.parse(store.get(SAVE_KEY) ?? '{}') as { unlockedStation: number; bestDepthM: number };
    expect(saved.unlockedStation).toBe(0);
    expect(saved.bestDepthM).toBeGreaterThan(0);
  });

  it('ends the campaign past the bottom of the last chunk', () => {
    const world = createTestWorld();
    const run = playBot(world, 120, { stopAt: (s) => s.phase === 'campaignComplete' });
    expect(run.snap.phase).toBe('campaignComplete');
    expect(run.snap.bubble.pos.y).toBeGreaterThanOrEqual(CAMPAIGN.bottomY);
  });
});

describe('fixed-step accumulator (§11.4)', () => {
  it('runs whole steps only and keeps the remainder', () => {
    const world = createTestWorld();
    world.update(STEP_MS / 2, UP);
    expect(world.snapshot().timeMs).toBe(0);
    world.update(STEP_MS / 2, UP);
    expect(world.snapshot().timeMs).toBeCloseTo(STEP_MS, 9);
    world.update(STEP_MS * 3, UP);
    expect(world.snapshot().timeMs).toBeCloseTo(STEP_MS * 4, 9);
  });

  it('drops the excess of a long frame instead of spiralling (§11.4)', () => {
    const world = createTestWorld();
    world.update(10_000, UP);
    expect(world.snapshot().timeMs).toBeCloseTo(STEP_MS * T.MAX_STEPS_PER_FRAME, 9);
    // The 9.9 s that were dropped must not be waiting in the accumulator.
    world.update(0, UP);
    expect(world.snapshot().timeMs).toBeCloseTo(STEP_MS * T.MAX_STEPS_PER_FRAME, 9);
  });

  it('survives a nonsense frame delta', () => {
    const world = createTestWorld();
    world.update(Number.NaN, UP);
    world.update(-100, UP);
    expect(world.snapshot().timeMs).toBe(0);
    expect(Number.isFinite(world.snapshot().bubble.pos.y)).toBe(true);
  });
});

describe('determinism (§11.7.14)', () => {
  it('two worlds with the same seed and the same input are identical after 10 000 steps', () => {
    const a = createTestWorld({ seed: 42 });
    const b = createTestWorld({ seed: 42 });
    const fingerA = new ScriptedFinger(300, 200, 45, 16);
    const fingerB = new ScriptedFinger(300, 200, 45, 16);
    let snapA = a.snapshot();
    let snapB = b.snapshot();

    for (let i = 0; i < 10_000; i++) {
      a.update(STEP_MS, fingerA.next(STEP_MS, snapA.bubble.pos.x, snapA.bubble.pos.y, snapA.camera.y));
      b.update(STEP_MS, fingerB.next(STEP_MS, snapB.bubble.pos.x, snapB.bubble.pos.y, snapB.camera.y));
      snapA = a.snapshot();
      snapB = b.snapshot();
      if (snapA.phase === 'station') a.continueDescent();
      if (snapB.phase === 'station') b.continueDescent();
      if (snapA.phase === 'dead') a.restart();
      if (snapB.phase === 'dead') b.restart();
      if (i % 500 === 0) expect(digest(snapA)).toBe(digest(snapB));
    }
    expect(digest(snapA)).toBe(digest(snapB));
    expect(snapA.timeMs).toBeCloseTo(10_000 * STEP_MS, 6);
  });

  it('is the same world under two accumulator orders (§11.7.14: "dos órdenes de acumulador")', () => {
    const oneAtATime = createTestWorld({ seed: 9 });
    const sixAtATime = createTestWorld({ seed: 9 });
    const held: PointerInput = { down: true, x: 120, y: 260 };

    for (let i = 0; i < 600; i++) oneAtATime.update(STEP_MS, held);
    for (let i = 0; i < 100; i++) sixAtATime.update(STEP_MS * 6, held);

    const first = oneAtATime.snapshot();
    const second = sixAtATime.snapshot();
    expect(first.timeMs).toBeCloseTo(second.timeMs, 6);
    expect(digest(first)).toBe(digest(second));
  });

  it('has no wall clock in it: an idle world advances only when told to', () => {
    const world = createTestWorld();
    const before = digest(world.snapshot());
    expect(digest(world.snapshot())).toBe(before);
  });
});

describe('death flow (§2.4, §11.7.6)', () => {
  /** Tuning that makes a hold vent the whole bar: the only deterministic way to die on hazard-free Z1. */
  const LETHAL = createTuning({
    OVERCHARGE_MS: 60,
    OVERCHARGE_MS_RESTING: 60,
    OVERCHARGE_DRAIN_MS: 60,
    OVERCHARGE_MIN_AIR: 0,
    OVERCHARGE_MAX_DRAIN: 32,
    AUTO_RELEASE_MS: 60_000,
  });

  function drown(world: GameWorld): WorldSnapshot {
    world.setTuning(LETHAL);
    for (let i = 0; i < 10; i++) world.update(STEP_MS, UP); // let go, so the next press is a new hold
    const held: PointerInput = { down: true, x: 90, y: 200 };
    let snap = world.snapshot();
    for (let i = 0; i < 60 * 20 && snap.phase !== 'dead'; i++) {
      world.update(STEP_MS, held);
      snap = world.snapshot();
    }
    return snap;
  }

  it('deflates for DEFLATE_MS before the end screen, and only the player leaves it', () => {
    const world = createTestWorld();
    const snap = drown(world);

    expect(snap.phase).toBe('dead');
    expect(snap.bubble.state).toBe('DEAD');
    expect(snap.bubble.air).toBe(0);
    expect(snap.bubble.deadMs + 1e-6).toBeGreaterThanOrEqual(T.DEFLATE_MS);
    expect(snap.run.failCountThisImmersion).toBe(1);

    // 8 s of inactivity is the SHELL's timer (§11.3): the world stays dead until restart() is called.
    for (let i = 0; i < 60 * 12; i++) world.update(STEP_MS, UP);
    expect(world.snapshot().phase).toBe('dead');
    expect(world.snapshot().bubble.state).toBe('DEAD');
  });

  it('restarts at the last boya, never above it, with a camera that already frames it', () => {
    const world = createTestWorld();
    playBot(world, 90, { stopAt: (s) => s.run.lastBoyaId !== null });
    drown(world);
    const conquered = world.snapshot().run.maxProgressY;
    expect(conquered).toBeGreaterThanOrEqual(IMMERSION_0.boyaY);

    world.restart();
    const snap = world.snapshot();
    expect(snap.phase).toBe('playing');
    expect(snap.bubble.state).toBe('IDLE');
    expect(snap.bubble.pos).toEqual({ x: T.WORLD_W / 2, y: IMMERSION_0.boyaY });
    expect(snap.bubble.vel).toEqual({ x: 0, y: 0 });
    expect(snap.bubble.air).toBe(T.AIR_START);
    expect(snap.bubble.flags.invulnUntil).toBeGreaterThan(snap.timeMs);
    expect(snap.camera.y).toBeCloseTo(IMMERSION_0.boyaY - snap.camera.viewH * T.CAM_ANCHOR, 9);
    expect(snap.run.maxProgressY).toBe(conquered); // conquered depth is never given back (§4.3)
    expect(snap.events.some((e) => e.type === 'respawn' && e.anchorKind === 'boya')).toBe(true);
  });

  it('starts at the campaign start when no checkpoint has been reached yet (§2.4)', () => {
    const world = createTestWorld();
    drown(world);
    world.restart();
    expect(world.snapshot().bubble.pos).toEqual(Z1_START);
  });

  it('restarts from a station checkpoint when the world was started at one', () => {
    const world = createTestWorld({ startStationIndex: 0 });
    expect(world.snapshot().bubble.pos.y).toBe(IMMERSION_0.stationY + T.CHUNK_H / 2);
    drown(world);
    world.restart();
    expect(world.snapshot().bubble.pos.y).toBe(IMMERSION_0.stationY + T.CHUNK_H / 2);
    expect(world.snapshot().run.lastStationIndex).toBe(0);
  });

  it('ignores restart() while the run is alive', () => {
    const world = createTestWorld();
    playBot(world, 3);
    const before = digest(world.snapshot());
    world.restart();
    expect(digest(world.snapshot())).toBe(before);
  });

  it('restartImmersion() restarts a LIVING run from the last checkpoint (§8 pause menu)', () => {
    const world = createTestWorld();
    // Far enough down that conquered depth is worth something, and stopped short of the first boya so
    // the last checkpoint really is the campaign start (the bot crosses boya:0 at about 5 s).
    playBot(world, 6, { stopAt: (s) => s.run.maxProgressY > 400 });
    const before = world.snapshot();
    const progress = before.run.maxProgressY;
    expect(before.phase).toBe('playing');
    expect(before.run.lastBoyaId).toBeNull();
    expect(progress).toBeGreaterThan(Z1_START.y);

    const seen: GameEvent[] = [];
    const off = world.onEvent((e) => seen.push(e));
    world.restartImmersion();
    off();

    const snap = world.snapshot();
    expect(snap.phase).toBe('playing');
    expect(snap.bubble.state).toBe('IDLE');
    expect(snap.bubble.air).toBe(T.AIR_START);
    expect(snap.bubble.vel).toEqual({ x: 0, y: 0 });
    expect(snap.bubble.pos).toEqual(Z1_START); // no boya reached yet
    expect(snap.camera.y).toBeCloseTo(Z1_START.y - snap.camera.viewH * T.CAM_ANCHOR, 9);
    expect(snap.run.maxProgressY).toBe(progress); // conquered depth is never given back (§4.3)
    // The respawn is announced to BOTH channels: a shell that only listens must still see it.
    expect(seen.some((e) => e.type === 'respawn')).toBe(true);
    expect(snap.events.some((e) => e.type === 'respawn')).toBe(true);
  });

  it('restartImmersion() does nothing once the campaign is over (the shell starts a new run)', () => {
    const world = createTestWorld();
    playBot(world, 3);
    const before = digest(world.snapshot());
    (world as unknown as { phase: string }).phase = 'campaignComplete';
    world.restartImmersion();
    (world as unknown as { phase: string }).phase = 'playing';
    expect(digest(world.snapshot())).toBe(before);
  });
});

describe('resaca (§2.4.2, §4.3)', () => {
  it('warns, charges one pip and puts Bur back on an anchor, never above her progress', () => {
    const world = createWorldOn(openWaterCampaign());
    shootIntoTheOpen(world); // from here nothing is above her head and buoyancy takes her out of the view
    const events: GameEvent[] = [];
    let snap = world.snapshot();
    for (let i = 0; i < 60 * 20; i++) {
      world.update(STEP_MS, UP); // no input at all
      snap = world.snapshot();
      events.push(...snap.events);
      if (events.some((e) => e.type === 'respawn')) break;
    }

    const warning = events.findIndex((e) => e.type === 'resacaWarning');
    const lost = events.findIndex((e) => e.type === 'airLost' && e.reason === 'resaca');
    const respawn = events.find((e) => e.type === 'respawn');
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(lost).toBeGreaterThan(warning);
    expect(respawn).toBeDefined();
    expect(snap.bubble.air).toBe(T.AIR_START - 1);
    expect(snap.bubble.vel).toEqual({ x: 0, y: 0 });
    expect(snap.bubble.flags.resacaUntil).toBe(0);
    // (a) of the chain: the declared rest point of the ceiling she last hung from, never above her progress.
    expect(respawn).toMatchObject({ type: 'respawn', anchorKind: 'ceiling' });
    expect(snap.bubble.pos).toEqual(OPEN_REST.pos);
    expect(snap.run.maxProgressY).toBeGreaterThanOrEqual(snap.bubble.pos.y);
  });

  it('takes exactly RESACA_GRACE_MS of warning before charging the pip', () => {
    const world = createWorldOn(openWaterCampaign());
    shootIntoTheOpen(world);
    let warnedAt = -1;
    let lostAt = -1;
    for (let i = 0; i < 60 * 20 && lostAt < 0; i++) {
      world.update(STEP_MS, UP);
      const snap = world.snapshot();
      for (const e of snap.events) {
        if (e.type === 'resacaWarning' && warnedAt < 0) warnedAt = snap.timeMs;
        if (e.type === 'airLost' && e.reason === 'resaca') lostAt = snap.timeMs;
      }
    }
    expect(warnedAt).toBeGreaterThan(0);
    expect(lostAt - warnedAt).toBeGreaterThanOrEqual(T.RESACA_GRACE_MS);
    expect(lostAt - warnedAt).toBeLessThan(T.RESACA_GRACE_MS + 2 * STEP_MS);
  });

  it('never fires on the Z1 opening: 6 s of nobody touching the glass is a rest, not a penalty (§8)', () => {
    const world = createTestWorld();
    expect(world.snapshot().bubble.pos).toEqual(Z1_START);

    const events: GameEvent[] = [];
    let snap = world.snapshot();
    for (let i = 0; i < 60 * 6; i++) {
      world.update(STEP_MS, UP);
      snap = world.snapshot();
      events.push(...snap.events);
    }

    expect(events.some((e) => e.type === 'resacaWarning')).toBe(false);
    expect(events.some((e) => e.type === 'airLost')).toBe(false);
    expect(snap.bubble.air).toBe(T.AIR_START);
    // §8 step 1: "Bur sube sola y se queda quieta bajo un techo de espuma" — the raft of `z1-open-1`,
    // which she is still hanging from 6 s in (the 3 s anti-camping clock drops her and she rises back).
    expect(snap.bubble.state).toBe('RESTING');
    expect(snap.bubble.restingOnId).toContain('o1-foam');
  });
});

describe('snapshot and events', () => {
  it('drains the queue on read and delivers the same events to a listener', () => {
    const world = createTestWorld();
    const heard: GameEvent[] = [];
    const off = world.onEvent((e) => heard.push(e));

    const finger = new ScriptedFinger(400, 140, 45, 16);
    const seen: GameEvent[] = [];
    let snap = world.snapshot();
    for (let i = 0; i < 300; i++) {
      world.update(STEP_MS, finger.next(STEP_MS, snap.bubble.pos.x, snap.bubble.pos.y, snap.camera.y));
      snap = world.snapshot();
      seen.push(...snap.events);
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(heard).toEqual(seen);
    expect(world.snapshot().events).toHaveLength(0); // drained

    off();
    const before = heard.length;
    world.update(STEP_MS * 60, UP);
    expect(heard).toHaveLength(before);
  });

  it('reports the HUD of §8: depth, capacity, charge and fine tune', () => {
    const world = createTestWorld();
    const held: PointerInput = { down: true, x: 110, y: 240 };
    for (let i = 0; i < 20; i++) world.update(STEP_MS, held);
    const snap = world.snapshot();

    expect(snap.hud.zone).toBe(0);
    expect(snap.hud.airMaxBase).toBe(T.AIR_MAX_BASE);
    expect(snap.hud.air).toBe(snap.bubble.air);
    expect(snap.hud.depthM).toBeGreaterThan(0);
    expect(snap.bubble.state).toBe('CHARGING');
    expect(snap.hud.chargePower).toBeGreaterThan(0);
    expect(snap.hud.fineTune).toBeGreaterThanOrEqual(-1);
    expect(snap.hud.fineTune).toBeLessThanOrEqual(1);
    expect(snap.trajectoryDots).toBe(T.TRAJECTORY_DOTS[0]);
    expect(snap.trajectory).toHaveLength(T.TRAJECTORY_DOTS[0] ?? 0);
  });

  it('draws no guide when there is no hold (§2.7)', () => {
    const world = createTestWorld();
    world.update(STEP_MS, UP);
    expect(world.snapshot().trajectory).toHaveLength(0);
  });

  it('follows a live resize and a live tuning swap', () => {
    const world = createTestWorld({ viewH: 400 });
    world.setViewHeight(320);
    expect(world.snapshot().camera.viewH).toBe(320);
    world.setViewHeight(Number.NaN);
    expect(world.snapshot().camera.viewH).toBe(320);

    world.setTuning(createTuning({ TRAJECTORY_DOTS: [3, 3, 3, 3, 3, 3] }));
    expect(world.snapshot().trajectoryDots).toBe(3);
  });
});

describe('the pointer the simulation sees (§2.1, §3.3, §2.2)', () => {
  /**
   * §2.1: "Con el origen congelado, dedo quieto = tiro quieto". The origin is frozen in WORLD
   * coordinates and the finger is sampled in VIEWPORT ones, so the conversion between them has to be
   * frozen too: adding the live `camera.y` every step would rotate the shot under a still thumb by
   * exactly the distance the camera scrolled while Bur charges.
   */
  it('freezes the viewport→world conversion for the whole contact', () => {
    const world = createTestWorld();
    // Charges released straight down until she is falling, so the camera is chasing a descending Bur.
    let snap = fallFromTheRaft(world);
    expect(snap.bubble.vel.y).toBeGreaterThan(200);
    expect(snap.bubble.restingOnId).toBeNull();
    const camBefore = snap.camera.y;

    const still: PointerInput = { down: true, x: snap.bubble.pos.x + 10, y: snap.bubble.pos.y - snap.camera.y + 45 };
    const thetas: number[] = [];
    const drags: number[] = [];
    for (let i = 0; i < 30; i++) {
      world.update(STEP_MS, still);
      snap = world.snapshot();
      thetas.push(snap.bubble.aimTheta);
      drags.push(snap.bubble.dragDist);
    }

    expect(snap.bubble.state).toBe('CHARGING');
    expect(Math.abs(snap.camera.y - camBefore)).toBeGreaterThan(20); // the world really did scroll
    for (const theta of thetas) expect(theta).toBeCloseTo(thetas[0] ?? 0, 12);
    for (const drag of drags) expect(drag).toBeCloseTo(drags[0] ?? 0, 12);
  });

  it('a finger held through the station summary must lift before it charges again (§2.2, §3.3)', () => {
    const world = createTestWorld();
    playBot(world, 90, { stopAt: (s) => s.phase === 'station' });

    // The glass is never released: the summary is a pause, and §2.2 gives one hold per CONTACT.
    const held: PointerInput = { down: true, x: 90, y: 200 };
    const events: GameEvent[] = [];
    for (let i = 0; i < 120; i++) {
      world.update(STEP_MS, held);
      events.push(...world.snapshot().events);
    }
    expect(events.some((e) => e.type === 'chargeStart')).toBe(false);
    expect(events.some((e) => e.type === 'launch')).toBe(false);

    world.continueDescent();
    for (let i = 0; i < 30; i++) {
      world.update(STEP_MS, held);
      events.push(...world.snapshot().events);
    }
    expect(world.snapshot().bubble.state).not.toBe('CHARGING');
    expect(events.some((e) => e.type === 'chargeStart')).toBe(false);

    // Lifting the finger is what arms the next hold.
    world.update(STEP_MS, UP);
    world.snapshot();
    world.update(STEP_MS, held);
    expect(world.snapshot().events.some((e) => e.type === 'chargeStart')).toBe(true);
  });
});

describe('the save is meta-progression, not a run report (§6.1, §12.1)', () => {
  it('adds what the run earned to what was already banked', () => {
    const store = new MemoryStore();
    store.set(SAVE_KEY, JSON.stringify({ ...defaultSave(), pearls: 500, bestDepthM: 120 }));

    const world = createTestWorld({ store });
    const run = playBot(world, 120, { stopAt: (s) => s.phase === 'campaignComplete' });
    const saved = JSON.parse(store.get(SAVE_KEY) ?? '{}') as SaveData;

    expect(run.snap.run.lastStationIndex).toBeGreaterThanOrEqual(0); // `persist` really ran
    expect(run.snap.run.pearls).toBeLessThan(500);
    expect(saved.pearls).toBe(500 + run.snap.run.pearls);
    expect(saved.bestDepthM).toBeGreaterThan(120);
  });
});

describe('the event queue is bounded (§11.5.10)', () => {
  it('does not grow without end when the shell only subscribes', () => {
    // The Z1 sequences twice over: 200 s of play must never run out of column, because a finished
    // campaign ignores input and stops producing the events this test is counting.
    const world = createWorldOn(buildCampaign(new ChunkLibrary(Z1_CHUNKS), [...Z1_SEQUENCES, ...Z1_SEQUENCES], T));
    const heard: GameEvent[] = [];
    world.onEvent((e) => heard.push(e));

    // 200 s of play with no `snapshot()` at all: the listener sees everything, the queue does not keep it.
    for (let i = 0; i < 12_000; i++) {
      const cycle = i % 32;
      world.update(STEP_MS, cycle < 24 ? { down: true, x: 90, y: 300 } : UP);
      // The two prompts, answered blind: reading the phase would take a `snapshot()`, and that would
      // drain the very queue under test. Both calls are no-ops outside their own phase.
      world.continueDescent();
      world.restart();
    }
    expect(heard.length).toBeGreaterThan(600);
    expect(world.snapshot().events.length).toBeLessThanOrEqual(512);
  });
});
