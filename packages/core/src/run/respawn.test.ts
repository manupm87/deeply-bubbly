import { describe, expect, it, vi } from 'vitest';
import { createTuning } from '../tuning';
import type { Anchor, Bubble, Camera, Ceiling, Chunk, RunState, WorldEntity, ZoneIndex } from '../types';
import type * as DepthModule from '../level/depth';
import { ChunkLibrary } from '../level/library';
import { boyaId, buildCampaign, instantiateChunk } from '../level/campaign';
import type { Campaign } from '../level/campaign';
import { CAMPAIGN_START_Y, SPAWN_BELOW_ANCHOR_PX, deathRespawnPoint, resacaRespawnPoint } from './respawn';

// `level/depth.ts` belongs to another module and campaign markers read it; mirror the normative §11.1 table.
vi.mock('../level/depth', async (importOriginal) => {
  const actual = await importOriginal<typeof DepthModule>();
  return {
    ...actual,
    zoneAt: (worldY: number) => {
      const zones = actual.ZONES;
      for (const z of zones) if (worldY >= z.startPx && worldY < z.endPx) return z;
      return worldY < 0 ? zones[0] : zones[zones.length - 1];
    },
  };
});

const t = createTuning();

const ceiling = (id: string, y: number): Ceiling => ({
  type: 'ceiling',
  id,
  rect: { x: 20, y, w: 60, h: 10 },
  kind: 'posadero',
  capturable: true,
  restitution: 0.55,
  material: 'rock',
});

const anchor = (id: string, ceilingId: string, y: number): Anchor => ({
  type: 'anchor',
  id,
  ceilingId,
  pos: { x: 50, y },
});

/** Every chunk: an entry ceiling at local y=20 (anchor 'a-in') and a mid ceiling at y=100 (anchor 'a-rest'). */
function makeChunk(id: string, role: Chunk['role']): Chunk {
  return {
    id,
    zone: 0 as ZoneIndex,
    difficulty: 1,
    verbs: [],
    entryAnchorId: 'a-in',
    exitAnchorId: 'a-rest',
    airBudget: 1,
    targetTimeS: 8,
    tags: [],
    role,
    entities: [
      ceiling('ceil-top', 20),
      anchor('a-in', 'ceil-top', 38),
      ceiling('ceil-mid', 100),
      anchor('a-rest', 'ceil-mid', 118),
    ],
  };
}

/** 2 immersions: boyas at 720 / 2160, stations at 1200 / 2640 (mid-band 1320 / 2760). */
function makeCampaign(immersions = 2): Campaign {
  const chunks: Chunk[] = [];
  const sequences: string[][] = [];
  for (let i = 0; i < immersions; i++) {
    const seq: string[] = [];
    for (let k = 0; k < t.IMMERSION_CHUNKS; k++) {
      const id = `${i}-${k}`;
      chunks.push(makeChunk(id, k === t.IMMERSION_CHUNKS - 1 ? 'station' : 'playable'));
      seq.push(id);
    }
    sequences.push(seq);
  }
  return buildCampaign(new ChunkLibrary(chunks), sequences, t);
}

const campaign = makeCampaign();

/**
 * Where a fresh campaign starts (§8 step 1): SPAWN_BELOW_ANCHOR_PX under the entry anchor of the first
 * placed chunk, so Bur rises into it on her own instead of being born above the surface. In this fixture
 * that anchor is 'a-in' of chunk 0, declared at (50, 38) and placed at worldY 0.
 */
const CAMPAIGN_START = { x: 50, y: 38 + SPAWN_BELOW_ANCHOR_PX };

/** Live geometry of a window of placed chunks, exactly as the streamer would produce it. */
function live(indices: readonly number[]): WorldEntity[] {
  return indices.flatMap((i) => {
    const placed = campaign.placed[i];
    if (!placed) throw new Error(`fixture: no chunk ${i}`);
    return instantiateChunk(placed);
  });
}

function makeBubble(overrides: Partial<Bubble> = {}): Bubble {
  return {
    pos: { x: 90, y: 1300 },
    vel: { x: 0, y: 0 },
    radius: 7,
    air: 3,
    airMax: 8,
    state: 'IDLE',
    restMs: 0,
    launchedMs: 0,
    deadMs: 0,
    lastLaunchPower: 0,
    aimOrigin: null,
    pullDist: 0,
    pullTheta: 0,
    aimMs: 0,
    aimValid: true,
    cancelZone: false,
    airLaunchesUsed: 0,
    restingOnId: null,
    lastRestingCeilingId: null,
    bounceChain: 0,
    bounceChainBodies: [],
    bounceChainRewardedInChunk: null,
    pressureDrainMs: 0,
    flags: { invulnUntil: 0, stunUntil: 0, reinflateUntil: 0, ascensoUntil: 0, resacaUntil: 0, trapVentAt: 0 },
    ...overrides,
  };
}

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    x: 0,
    y: 1200,
    maxY: 1200,
    recallPx: t.CAM_RECALL_PX,
    zoom: 1,
    zoomPunchUntil: 0,
    shakePx: 0,
    shakeUntil: 0,
    viewW: t.VIEW_W,
    viewH: 360,
    lookaheadPx: 0,
    renderY: 1200,
    ...overrides,
  };
}

function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    seed: 1,
    mode: 'expedicion',
    immersionIndex: 0,
    lastBoyaId: null,
    lastStationIndex: -1,
    maxProgressY: 0,
    pearls: 0,
    shells: 0,
    failCountThisImmersion: 0,
    mercyLevel: 0,
    shieldAvailable: true,
    elapsedMs: 0,
    ...overrides,
  };
}

describe('resacaRespawnPoint (a) last resting ceiling', () => {
  it('uses the declared anchor of the last resting ceiling when it is live and inside the recall band', () => {
    const bubble = makeBubble({ lastRestingCeilingId: '5:ceil-mid' });
    const run = makeRun({ maxProgressY: 1318, lastBoyaId: boyaId(0) });
    const p = resacaRespawnPoint(bubble, run, makeCamera(), live([4, 5, 6, 7]), campaign, t);
    expect(p).toEqual({ kind: 'ceiling', pos: { x: 50, y: 118 + 5 * t.CHUNK_H } });
  });

  it('falls back to the geometric bottom face when the ceiling has no anchor', () => {
    const entities = live([4, 5, 6, 7]).filter((e) => e.id !== '5:a-rest');
    const bubble = makeBubble({ lastRestingCeilingId: '5:ceil-mid' });
    const run = makeRun({ maxProgressY: 1318 });
    const p = resacaRespawnPoint(bubble, run, makeCamera(), entities, campaign, t);
    // x = rect centre, y = rect bottom + radius
    expect(p.kind).toBe('ceiling');
    expect(p.pos).toEqual({ x: 50, y: 100 + 10 + 7 + 5 * t.CHUNK_H });
  });

  it('skips the ceiling when it is no longer instantiated', () => {
    const bubble = makeBubble({ lastRestingCeilingId: '5:ceil-mid', pos: { x: 90, y: 1500 } });
    const run = makeRun({ maxProgressY: 1500 });
    const p = resacaRespawnPoint(bubble, run, makeCamera(), live([6, 7, 8]), campaign, t);
    expect(p).toEqual({ kind: 'chunkEntry', pos: { x: 50, y: 38 + 6 * t.CHUNK_H } });
  });

  it('skips the ceiling when it sits outside [maxY - recallPx, maxY + viewH]', () => {
    const bubble = makeBubble({ lastRestingCeilingId: '5:ceil-mid', pos: { x: 90, y: 1500 } });
    const run = makeRun({ maxProgressY: 1500 });
    const entities = live([4, 5, 6, 7]);
    // Camera has ratcheted far below: 1318 is above maxY - recallPx = 1504.
    const above = resacaRespawnPoint(bubble, run, makeCamera({ maxY: 1600 }), entities, campaign, t);
    expect(above.kind).toBe('chunkEntry');
    // ...and far above: 1318 is below maxY + viewH = 400 + 360.
    const below = resacaRespawnPoint(bubble, run, makeCamera({ maxY: 400 }), entities, campaign, t);
    expect(below.kind).toBe('chunkEntry');
    // Exactly on the band edge it is still accepted (progress floor kept below it so it cannot interfere).
    const shallowRun = makeRun({ maxProgressY: 1318 });
    const edge = resacaRespawnPoint(
      bubble,
      shallowRun,
      makeCamera({ maxY: 1318 + t.CAM_RECALL_PX }),
      entities,
      campaign,
      t,
    );
    expect(edge.kind).toBe('ceiling');
  });
});

describe('resacaRespawnPoint (b) chunk entry anchor', () => {
  it('uses the entry anchor of the chunk containing bubble.pos when there is no resting ceiling', () => {
    const bubble = makeBubble({ pos: { x: 12, y: 2 * t.CHUNK_H + 200 } });
    const run = makeRun({ maxProgressY: 2 * t.CHUNK_H + 200 });
    const p = resacaRespawnPoint(bubble, run, makeCamera({ maxY: 480 }), live([1, 2, 3, 4]), campaign, t);
    expect(p).toEqual({ kind: 'chunkEntry', pos: { x: 50, y: 38 + 2 * t.CHUNK_H } });
  });

  it('falls through to the checkpoint when the chunk entry anchor is not instantiated', () => {
    const bubble = makeBubble({ pos: { x: 90, y: 1500 } });
    const run = makeRun({ maxProgressY: 1500, lastBoyaId: boyaId(0), lastStationIndex: 0 });
    const p = resacaRespawnPoint(bubble, run, makeCamera(), [], campaign, t);
    expect(p).toEqual({ kind: 'station', pos: { x: t.WORLD_W / 2, y: 1200 + t.CHUNK_H / 2 } });
  });
});

describe('resacaRespawnPoint (c) boya / station', () => {
  it('uses the last boya when no station has been reached yet', () => {
    const bubble = makeBubble({ pos: { x: 90, y: 900 } });
    const run = makeRun({ maxProgressY: 900, lastBoyaId: boyaId(0) });
    const p = resacaRespawnPoint(bubble, run, makeCamera({ maxY: 800 }), [], campaign, t);
    expect(p).toEqual({ kind: 'boya', pos: { x: t.WORLD_W / 2, y: 720 } });
  });

  it('uses the campaign start only before the first checkpoint of the run', () => {
    const bubble = makeBubble({ pos: { x: 90, y: 100 } });
    const run = makeRun({ maxProgressY: 100 });
    const p = resacaRespawnPoint(bubble, run, makeCamera({ maxY: 0 }), [], campaign, t);
    expect(p).toEqual({ kind: 'chunkEntry', pos: CAMPAIGN_START });
  });
});

describe('respawn never gives back conquered depth (§2.4.2, §4.3)', () => {
  it('replaces a shallower candidate with the deepest checkpoint maxProgressY has passed', () => {
    const bubble = makeBubble({ lastRestingCeilingId: '1:ceil-mid', pos: { x: 90, y: 358 } });
    const run = makeRun({ maxProgressY: 1500, lastBoyaId: boyaId(0), lastStationIndex: 0 });
    const cam = makeCamera({ maxY: 300, viewH: 400 });
    const p = resacaRespawnPoint(bubble, run, cam, live([0, 1, 2, 3]), campaign, t);
    expect(p).toEqual({ kind: 'station', pos: { x: t.WORLD_W / 2, y: 1320 } });
  });

  it('keeps a candidate that is already deeper than the reached checkpoint', () => {
    const bubble = makeBubble({ lastRestingCeilingId: '7:ceil-mid', pos: { x: 90, y: 1700 } });
    const run = makeRun({ maxProgressY: 1700, lastBoyaId: boyaId(0), lastStationIndex: 0 });
    const cam = makeCamera({ maxY: 1680, viewH: 400 });
    const p = resacaRespawnPoint(bubble, run, cam, live([6, 7, 8, 9]), campaign, t);
    expect(p).toEqual({ kind: 'ceiling', pos: { x: 50, y: 118 + 7 * t.CHUNK_H } });
  });

  it('honours the progress ratchet even when run.lastBoyaId lags behind', () => {
    const run = makeRun({ maxProgressY: 2200, lastBoyaId: boyaId(0) });
    expect(deathRespawnPoint(run, campaign, t)).toEqual({ kind: 'boya', pos: { x: t.WORLD_W / 2, y: 2160 } });
  });
});

describe('deathRespawnPoint', () => {
  it('picks the deeper of the last boya and the last station', () => {
    const boyaDeeper = makeRun({ maxProgressY: 2200, lastBoyaId: boyaId(1), lastStationIndex: 0 });
    expect(deathRespawnPoint(boyaDeeper, campaign, t)).toEqual({
      kind: 'boya',
      pos: { x: t.WORLD_W / 2, y: 2160 },
    });

    const stationDeeper = makeRun({ maxProgressY: 1400, lastBoyaId: boyaId(0), lastStationIndex: 0 });
    expect(deathRespawnPoint(stationDeeper, campaign, t)).toEqual({
      kind: 'station',
      pos: { x: t.WORLD_W / 2, y: 1320 },
    });
  });

  it('falls back to the campaign start only when nothing has been reached (first immersion, before the first boya)', () => {
    const run = makeRun();
    expect(deathRespawnPoint(run, campaign, t)).toEqual({ kind: 'chunkEntry', pos: CAMPAIGN_START });
  });

  it('falls back to CAMPAIGN_START_Y when the first chunk declares no entry anchor', () => {
    const chunks: Chunk[] = [];
    const seq: string[] = [];
    for (let k = 0; k < t.IMMERSION_CHUNKS; k++) {
      const chunk = makeChunk(`n${k}`, k === t.IMMERSION_CHUNKS - 1 ? 'station' : 'playable');
      // Only the FIRST chunk loses its entry anchor: the fallback is about the very first spawn.
      chunks.push(k === 0 ? { ...chunk, entryAnchorId: 'no-such-anchor' } : chunk);
      seq.push(chunk.id);
    }
    const anchorless = buildCampaign(new ChunkLibrary(chunks), [seq], t);
    expect(deathRespawnPoint(makeRun(), anchorless, t)).toEqual({
      kind: 'chunkEntry',
      pos: { x: t.WORLD_W / 2, y: CAMPAIGN_START_Y },
    });
  });

  it('never returns a point above the last boya reached', () => {
    const run = makeRun({ maxProgressY: 2600, lastBoyaId: boyaId(1), lastStationIndex: 1 });
    const p = deathRespawnPoint(run, campaign, t);
    expect(p.pos.y).toBeGreaterThanOrEqual(2160);
  });

  it('is pure: repeated calls return equal but independent points', () => {
    const run = makeRun({ maxProgressY: 800, lastBoyaId: boyaId(0) });
    const a = deathRespawnPoint(run, campaign, t);
    const b = deathRespawnPoint(run, campaign, t);
    expect(a).toEqual(b);
    expect(a.pos).not.toBe(b.pos);
  });

  it('uses DEFAULT_TUNING when no tuning is supplied', () => {
    const run = makeRun({ maxProgressY: 1400, lastStationIndex: 0 });
    // D3: a station respawn is centred on the WORLD, which is WORLD_W (540) wide now.
    expect(deathRespawnPoint(run, campaign)).toEqual({ kind: 'station', pos: { x: t.WORLD_W / 2, y: 1320 } });
  });
});

describe('station respawn tracks the real station chunk geometry (§11.1)', () => {
  /**
   * §11.1: the station IS the sixth chunk, so the checkpoint must sit inside the band that was actually
   * instantiated for it, whatever the (live-tunable, §11.6) chunk-count constants say.
   */
  it('lands inside the placed station chunk band even when IMMERSION_PLAYABLE_CHUNKS drifts', () => {
    const drifted = createTuning({ IMMERSION_PLAYABLE_CHUNKS: 4 });
    const chunks: Chunk[] = [];
    const seq: string[] = [];
    for (let k = 0; k < drifted.IMMERSION_CHUNKS; k++) {
      const id = `d${k}`;
      chunks.push(makeChunk(id, k === drifted.IMMERSION_CHUNKS - 1 ? 'station' : 'playable'));
      seq.push(id);
    }
    const drift = buildCampaign(new ChunkLibrary(chunks), [seq], drifted);
    const placedStation = drift.placed.find((p) => p.chunk.role === 'station');
    if (!placedStation) throw new Error('fixture');

    const run = makeRun({ lastStationIndex: 0, maxProgressY: drift.bottomY });
    const p = deathRespawnPoint(run, drift, drifted);
    expect(p.kind).toBe('station');
    expect(p.pos.y).toBeGreaterThanOrEqual(placedStation.worldY);
    expect(p.pos.y).toBeLessThan(placedStation.worldY + drifted.CHUNK_H);
  });
});
