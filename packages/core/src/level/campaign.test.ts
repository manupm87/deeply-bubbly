import { describe, expect, it, vi } from 'vitest';
import { createTuning } from '../tuning';
import type { Anchor, Ceiling, Chunk, Hazard, Pickup, WorldEntity, ZoneIndex } from '../types';
import type * as DepthModule from './depth';
import { ChunkLibrary } from './library';
import {
  boyaId,
  buildCampaign,
  campaignMarkers,
  chunkIndexAt,
  immersionZoneMismatches,
  instantiateChunk,
  stationId,
} from './campaign';

// `level/depth.ts` is owned by another module and may still be a stub; the zone table itself is normative
// data (§11.1), so the mock is a faithful lookup over the real ZONES array, not an invented behaviour.
vi.mock('./depth', async (importOriginal) => {
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

function makeChunk(id: string, role: Chunk['role'], zone: ZoneIndex = 0, entities: WorldEntity[] = []): Chunk {
  return {
    id,
    zone,
    difficulty: 1,
    verbs: [],
    entryAnchorId: 'a-in',
    exitAnchorId: 'a-out',
    airBudget: 1,
    targetTimeS: 8,
    tags: [],
    role,
    entities,
  };
}

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

const pickup = (id: string, y: number): Pickup => ({
  type: 'pickup',
  id,
  pos: { x: 90, y },
  pickupType: 'aire',
  value: 1,
  radius: 6,
});

const hazard = (id: string, y: number): Hazard => ({
  type: 'hazard',
  id,
  catalogId: 1,
  shape: { x: 10, y, w: 20, h: 20 },
  airCost: 1,
  pushDir: 'lateral',
  moving: { axis: 'x', speed: 10, range: 30 },
});

/** `n` immersions of IMMERSION_CHUNKS chunks each; chunk `<i>-<k>` with the station last. */
function makeLibrary(immersions: number, zoneOf: (i: number) => ZoneIndex = () => 0): ChunkLibrary {
  const chunks: Chunk[] = [];
  for (let i = 0; i < immersions; i++) {
    for (let k = 0; k < t.IMMERSION_CHUNKS; k++) {
      const last = k === t.IMMERSION_CHUNKS - 1;
      chunks.push(
        makeChunk(`${i}-${k}`, last ? 'station' : 'playable', zoneOf(i), [
          ceiling('ceil', 100),
          anchor('a-in', 'ceil', 118),
          pickup('air', 60),
        ]),
      );
    }
  }
  return new ChunkLibrary(chunks);
}

function makeSequences(immersions: number): string[][] {
  return Array.from({ length: immersions }, (_, i) =>
    Array.from({ length: t.IMMERSION_CHUNKS }, (_, k) => `${i}-${k}`),
  );
}

describe('buildCampaign', () => {
  it('places chunks consecutively at index * CHUNK_H', () => {
    const c = buildCampaign(makeLibrary(2), makeSequences(2), t);
    expect(c.placed).toHaveLength(12);
    c.placed.forEach((p, i) => {
      expect(p.index).toBe(i);
      expect(p.worldY).toBe(i * t.CHUNK_H);
      expect(p.immersionIndex).toBe(Math.floor(i / t.IMMERSION_CHUNKS));
    });
    expect(c.bottomY).toBe(12 * t.CHUNK_H);
  });

  it('computes immersion boya and station offsets (§3.1)', () => {
    const c = buildCampaign(makeLibrary(2), makeSequences(2), t);
    const [first, second] = c.immersions;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.startY).toBe(0);
    expect(first?.boyaY).toBe(t.BOYA_AFTER_CHUNK * t.CHUNK_H); // 720
    // §11.1: the station IS the sixth chunk, so its Y is the placed chunk's worldY, not a separate constant.
    expect(first?.stationY).toBe((t.IMMERSION_CHUNKS - 1) * t.CHUNK_H); // 1200
    expect(second?.startY).toBe(t.IMMERSION_CHUNKS * t.CHUNK_H); // 1440
    expect(second?.boyaY).toBe(1440 + 720);
    expect(second?.stationY).toBe(1440 + 1200);
    // The station chunk is the sixth chunk, so the immersion ends exactly at the next start.
    expect((second?.stationY ?? 0) + t.CHUNK_H).toBe(c.bottomY);
  });

  it('takes the immersion zone from its first chunk and copies the chunk ids', () => {
    const zoneOf = (i: number): ZoneIndex => (i === 0 ? 0 : 1);
    const c = buildCampaign(makeLibrary(2, zoneOf), makeSequences(2), t);
    expect(c.immersions.map((i) => i.zone)).toEqual([0, 1]);
    expect(c.immersions[0]?.chunkIds).toEqual(['0-0', '0-1', '0-2', '0-3', '0-4', '0-5']);
  });

  it('rejects sequences that do not have IMMERSION_CHUNKS ids', () => {
    const lib = makeLibrary(1);
    expect(() => buildCampaign(lib, [['0-0', '0-5']], t)).toThrow(/expected 6 chunks, got 2/);
  });

  it('rejects a sequence whose last chunk is not a station', () => {
    const lib = makeLibrary(1);
    const bad = ['0-0', '0-1', '0-2', '0-3', '0-4', '0-0'];
    expect(() => buildCampaign(lib, [bad], t)).toThrow(/must have role 'station'/);
  });

  it('rejects a station placed anywhere but last', () => {
    const lib = makeLibrary(2);
    const bad = ['0-5', '0-1', '0-2', '0-3', '0-4', '1-5'];
    expect(() => buildCampaign(lib, [bad], t)).toThrow(/only the last one may be/);
  });

  it('rejects unknown chunk ids and empty campaigns', () => {
    const lib = makeLibrary(1);
    expect(() => buildCampaign(lib, [['nope', '0-1', '0-2', '0-3', '0-4', '0-5']], t)).toThrow(/unknown chunk id/);
    expect(() => buildCampaign(lib, [], t)).toThrow(/at least one immersion/);
  });
});

describe('instantiateChunk', () => {
  const lib = makeLibrary(1);
  const campaign = buildCampaign(lib, makeSequences(1), t);

  it('offsets every geometry by worldY and prefixes ids with the placed index', () => {
    const placed = campaign.placed[2];
    expect(placed).toBeDefined();
    if (!placed) return;
    const out = instantiateChunk(placed);
    const ids = out.map((e) => e.id);
    expect(ids).toEqual(['2:ceil', '2:a-in', '2:air']);

    const c = out.find((e): e is Ceiling => e.type === 'ceiling');
    const a = out.find((e): e is Anchor => e.type === 'anchor');
    const p = out.find((e): e is Pickup => e.type === 'pickup');
    expect(c?.rect.y).toBe(100 + 2 * t.CHUNK_H);
    expect(c?.rect.x).toBe(20);
    expect(a?.pos.y).toBe(118 + 2 * t.CHUNK_H);
    expect(p?.pos.y).toBe(60 + 2 * t.CHUNK_H);
  });

  it('prefixes references so anchor.ceilingId still resolves', () => {
    const placed = campaign.placed[3];
    if (!placed) throw new Error('fixture');
    const out = instantiateChunk(placed);
    const a = out.find((e): e is Anchor => e.type === 'anchor');
    expect(a?.ceilingId).toBe('3:ceil');
    expect(out.some((e) => e.id === a?.ceilingId)).toBe(true);
  });

  it('never mutates the library and returns independent copies (nested objects included)', () => {
    const placed = campaign.placed[1];
    if (!placed) throw new Error('fixture');
    const first = instantiateChunk(placed);
    const second = instantiateChunk(placed);

    const source = placed.chunk.entities.find((e): e is Ceiling => e.type === 'ceiling');
    expect(source?.id).toBe('ceil');
    expect(source?.rect.y).toBe(100);

    const a = first.find((e): e is Ceiling => e.type === 'ceiling');
    const b = second.find((e): e is Ceiling => e.type === 'ceiling');
    expect(a).not.toBe(b);
    expect(a?.rect).not.toBe(b?.rect);
    if (a) a.rect.y = -999;
    expect(b?.rect.y).toBe(100 + t.CHUNK_H);
    expect(source?.rect.y).toBe(100);
  });

  it('deep-copies optional nested specs (moving) and offsets hazard shapes', () => {
    const lib2 = new ChunkLibrary([
      makeChunk('h-p', 'playable', 0, [hazard('spike', 30)]),
      makeChunk('h-s', 'station', 0, []),
    ]);
    const c2 = buildCampaign(lib2, [['h-p', 'h-p', 'h-p', 'h-p', 'h-p', 'h-s']], t);
    const placed = c2.placed[4];
    if (!placed) throw new Error('fixture');
    const out = instantiateChunk(placed);
    const h = out.find((e): e is Hazard => e.type === 'hazard');
    expect(h?.id).toBe('4:spike');
    expect(h?.shape.y).toBe(30 + 4 * t.CHUNK_H);
    expect(h?.moving).toEqual({ axis: 'x', speed: 10, range: 30 });
    const src = placed.chunk.entities.find((e): e is Hazard => e.type === 'hazard');
    expect(h?.moving).not.toBe(src?.moving);
    // `phase` is optional and absent: it must not appear as an explicit undefined key.
    expect(Object.hasOwn(h?.moving ?? {}, 'phase')).toBe(false);
  });
});

describe('chunkIndexAt', () => {
  const campaign = buildCampaign(makeLibrary(2), makeSequences(2), t);

  it('maps a world Y to its placed chunk', () => {
    expect(chunkIndexAt(campaign, 0, t)).toBe(0);
    expect(chunkIndexAt(campaign, 239.9, t)).toBe(0);
    expect(chunkIndexAt(campaign, 240, t)).toBe(1);
    expect(chunkIndexAt(campaign, 1200, t)).toBe(5);
  });

  it('clamps outside the campaign', () => {
    expect(chunkIndexAt(campaign, -5000, t)).toBe(0);
    expect(chunkIndexAt(campaign, campaign.bottomY, t)).toBe(11);
    expect(chunkIndexAt(campaign, 99999, t)).toBe(11);
  });
});

describe('campaignMarkers', () => {
  it('derives one boya and one station per immersion at the campaign offsets', () => {
    const campaign = buildCampaign(makeLibrary(2), makeSequences(2), t);
    const { boyas, stations } = campaignMarkers(campaign, t);
    expect(boyas.map((b) => b.id)).toEqual([boyaId(0), boyaId(1)]);
    expect(boyas.map((b) => b.worldY)).toEqual([720, 2160]);
    expect(boyas.map((b) => b.immersionIndex)).toEqual([0, 1]);
    expect(stations.map((s) => s.id)).toEqual([stationId(0), stationId(1)]);
    expect(stations.map((s) => s.worldY)).toEqual([1200, 2640]);
  });

  it('reads zoneFrom/zoneTo from the depth table across the station band (§11.1)', () => {
    const campaign = buildCampaign(makeLibrary(2), makeSequences(2), t);
    const { stations } = campaignMarkers(campaign, t);
    expect(stations[0]).toMatchObject({ zoneFrom: 0, zoneTo: 0 });
    // Second station spans 2640..2880: Z1 ends and Z2 starts exactly at 2880 px.
    expect(stations[1]).toMatchObject({ zoneFrom: 0, zoneTo: 1 });
  });

  it('marks a delivery when the next immersion changes zone, and always on the last one', () => {
    const zoneOf = (i: number): ZoneIndex => (i < 2 ? 0 : 1);
    const campaign = buildCampaign(makeLibrary(3, zoneOf), makeSequences(3), t);
    const { stations } = campaignMarkers(campaign, t);
    expect(stations.map((s) => s.isDelivery)).toEqual([false, true, true]);
  });

  it('does not set optional tutorialVerb', () => {
    const campaign = buildCampaign(makeLibrary(1), makeSequences(1), t);
    const { stations } = campaignMarkers(campaign, t);
    expect(Object.hasOwn(stations[0] ?? {}, 'tutorialVerb')).toBe(false);
  });
});

describe('immersion geometry is structural, not a second constant (§11.1)', () => {
  /** Builds one immersion of `n` chunks (station last) under an arbitrary tuning. */
  function oneImmersion(tt: typeof t): ReturnType<typeof buildCampaign> {
    const chunks: Chunk[] = [];
    const seq: string[] = [];
    for (let k = 0; k < tt.IMMERSION_CHUNKS; k++) {
      const id = `c${k}`;
      chunks.push(makeChunk(id, k === tt.IMMERSION_CHUNKS - 1 ? 'station' : 'playable'));
      seq.push(id);
    }
    return buildCampaign(new ChunkLibrary(chunks), [seq], tt);
  }

  it('keeps stationY on the placed station chunk when IMMERSION_PLAYABLE_CHUNKS drifts', () => {
    const drifted = createTuning({ IMMERSION_PLAYABLE_CHUNKS: 4 });
    const c = oneImmersion(drifted);
    const station = c.placed.find((p) => p.chunk.role === 'station');
    expect(station?.worldY).toBe(5 * drifted.CHUNK_H);
    expect(c.immersions[0]?.stationY).toBe(station?.worldY);
  });

  it('keeps stationY on the placed station chunk when the sequence length itself changes', () => {
    const shorter = createTuning({ IMMERSION_CHUNKS: 5 });
    const c = oneImmersion(shorter);
    expect(c.immersions[0]?.stationY).toBe(4 * shorter.CHUNK_H);
    // The immersion still ends exactly where the campaign does: station band + one chunk.
    expect((c.immersions[0]?.stationY ?? 0) + shorter.CHUNK_H).toBe(c.bottomY);
  });

  it('puts every station marker inside its own placed station chunk band under any tuning', () => {
    for (const tt of [t, createTuning({ IMMERSION_PLAYABLE_CHUNKS: 4 }), createTuning({ IMMERSION_CHUNKS: 5 })]) {
      const c = oneImmersion(tt);
      const placedStation = c.placed.find((p) => p.chunk.role === 'station');
      const marker = campaignMarkers(c, tt).stations[0];
      expect(marker?.worldY).toBeGreaterThanOrEqual(placedStation?.worldY ?? -1);
      expect(marker?.worldY).toBeLessThan((placedStation?.worldY ?? -1) + tt.CHUNK_H);
    }
  });

  it('rejects a BOYA_AFTER_CHUNK that would place the boya at or past the station', () => {
    const lib = makeLibrary(1);
    const seq = makeSequences(1);
    expect(() => buildCampaign(lib, seq, createTuning({ BOYA_AFTER_CHUNK: 5 }))).toThrow(/outside the playable/);
    expect(() => buildCampaign(lib, seq, createTuning({ BOYA_AFTER_CHUNK: 0 }))).toThrow(/outside the playable/);
    // The last playable seam is still legal (boya one chunk above the station).
    expect(() => buildCampaign(lib, seq, createTuning({ BOYA_AFTER_CHUNK: 4 }))).not.toThrow();
  });
});

describe('immersionZoneMismatches', () => {
  it('is empty when the authored zone tag agrees with the §11.1 px table', () => {
    const c = buildCampaign(makeLibrary(2), makeSequences(2), t);
    expect(immersionZoneMismatches(c)).toEqual([]);
  });

  it('flags an authored zone tag that does not match the immersion depth', () => {
    // Immersion 1 starts at 1440 px, still Z1 (0..2880), but is authored as Z2.
    const c = buildCampaign(makeLibrary(2, (i) => (i === 0 ? 0 : 1)), makeSequences(2), t);
    expect(immersionZoneMismatches(c)).toEqual([1]);
  });
});
