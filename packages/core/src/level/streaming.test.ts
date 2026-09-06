import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTuning } from '../tuning';
import type { Boya, Ceiling, Chunk, Pickup, RestStation, WorldEntity, ZoneIndex } from '../types';
import type * as DepthModule from './depth';
import { ChunkLibrary } from './library';
import { boyaId, buildCampaign, stationId } from './campaign';
import type { Campaign } from './campaign';
import { WorldStreamer } from './streaming';

// See campaign.test.ts: `depth.zoneAt` is another module's file; the mock mirrors the normative §11.1 table.
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

function makeChunk(id: string, role: Chunk['role'], entities: WorldEntity[]): Chunk {
  return {
    id,
    zone: 0 as ZoneIndex,
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

const ceiling = (id: string): Ceiling => ({
  type: 'ceiling',
  id,
  rect: { x: 20, y: 120, w: 60, h: 10 },
  kind: 'posadero',
  capturable: true,
  restitution: 0.55,
  material: 'rock',
});

const pickup = (id: string): Pickup => ({
  type: 'pickup',
  id,
  pos: { x: 90, y: 60 },
  pickupType: 'aire',
  value: 1,
  radius: 6,
});

/** 3 immersions => 18 placed chunks, bottomY 4320. Every chunk carries one pickup named 'air'. */
function makeCampaign(immersions = 3): Campaign {
  const chunks: Chunk[] = [];
  const sequences: string[][] = [];
  for (let i = 0; i < immersions; i++) {
    const seq: string[] = [];
    for (let k = 0; k < t.IMMERSION_CHUNKS; k++) {
      const id = `${i}-${k}`;
      const last = k === t.IMMERSION_CHUNKS - 1;
      chunks.push(makeChunk(id, last ? 'station' : 'playable', [ceiling('ceil'), pickup('air')]));
      seq.push(id);
    }
    sequences.push(seq);
  }
  return buildCampaign(new ChunkLibrary(chunks), sequences, t);
}

const yOfChunk = (index: number, offset = 10): number => index * t.CHUNK_H + offset;
const chunkIdsOf = (entities: readonly WorldEntity[]): number[] =>
  [...new Set(entities.filter((e) => e.type === 'pickup').map((e) => Number(e.id.split(':')[0])))].sort(
    (a, b) => a - b,
  );

describe('WorldStreamer window (§11.5.10)', () => {
  let campaign: Campaign;
  let s: WorldStreamer;
  beforeEach(() => {
    campaign = makeCampaign();
    s = new WorldStreamer(campaign, t);
  });

  it('starts at chunk 0 with the window clamped to the top of the world', () => {
    expect(s.currentChunk().index).toBe(0);
    expect(s.loadedIndices()).toEqual([0, 1, 2]);
  });

  it('keeps previous, current, next and next+1 in mid-world', () => {
    s.update(yOfChunk(5), false);
    expect(s.currentChunk().index).toBe(5);
    expect(s.loadedIndices()).toEqual([4, 5, 6, 7]);
    expect(s.loadedIndices()).toHaveLength(t.STREAM_CHUNKS);
    expect(chunkIdsOf(s.entities())).toEqual([4, 5, 6, 7]);
  });

  it('adds one more chunk above while ascenso is active', () => {
    s.update(yOfChunk(5), true);
    expect(s.loadedIndices()).toEqual([3, 4, 5, 6, 7]);
    expect(s.loadedIndices()).toHaveLength(t.STREAM_CHUNKS_ASCENSO);
    s.update(yOfChunk(5), false);
    expect(s.loadedIndices()).toEqual([4, 5, 6, 7]);
  });

  it('clamps at the bottom of the campaign', () => {
    s.update(yOfChunk(17), false);
    expect(s.currentChunk().index).toBe(17);
    expect(s.loadedIndices()).toEqual([16, 17]);
    s.update(999999, false);
    expect(s.currentChunk().index).toBe(17);
  });

  it('drops entities of chunks that left the window', () => {
    s.update(yOfChunk(1), false);
    expect(chunkIdsOf(s.entities())).toEqual([0, 1, 2, 3]);
    s.update(yOfChunk(10), false);
    expect(chunkIdsOf(s.entities())).toEqual([9, 10, 11, 12]);
    expect(s.entities().some((e) => e.id.startsWith('0:'))).toBe(false);
  });

  it('is stable (same object identity) when the current chunk did not change', () => {
    s.update(yOfChunk(5, 10), false);
    const first = s.entities();
    s.update(yOfChunk(5, 200), false);
    expect(s.entities()).toBe(first);
  });
});

describe('WorldStreamer markers', () => {
  const campaign = makeCampaign();

  it('includes only the boyas and stations inside the window band', () => {
    const s = new WorldStreamer(campaign, t);
    s.update(yOfChunk(5), false); // window 4..7 => y ∈ [960, 1920)
    const markerIds = s.entities().filter((e) => e.type === 'boya' || e.type === 'station').map((e) => e.id);
    expect(markerIds).toEqual([stationId(0)]); // boya 0 at y=720 is above the window
    const station = s.entities().find((e): e is RestStation => e.type === 'station');
    expect(station?.worldY).toBe(1200);
  });

  it('shows the boya of the immersion Bur is descending through', () => {
    const s = new WorldStreamer(campaign, t);
    s.update(yOfChunk(3), false); // window 2..5 => y ∈ [480, 1440)
    const markerIds = s.entities().filter((e) => e.type === 'boya' || e.type === 'station').map((e) => e.id);
    expect(markerIds).toEqual([boyaId(0), stationId(0)]);
    const boya = s.entities().find((e): e is Boya => e.type === 'boya');
    expect(boya?.worldY).toBe(720);
    expect(boya?.immersionIndex).toBe(0);
  });
});

describe('WorldStreamer consumed ids', () => {
  it('keeps consumed pickups gone when the chunk is re-instantiated after a respawn', () => {
    const campaign = makeCampaign();
    const s = new WorldStreamer(campaign, t);
    s.update(yOfChunk(5), false);
    expect(s.entities().some((e) => e.id === '5:air')).toBe(true);

    s.consume('5:air');
    expect(s.entities().some((e) => e.id === '5:air')).toBe(false);
    // Still hidden while the chunk stays in the window.
    s.update(yOfChunk(6), false);
    expect(s.entities().some((e) => e.id === '5:air')).toBe(false);

    // Leave the window entirely and come back (respawn can re-enter a chunk).
    s.update(yOfChunk(15), false);
    expect(s.entities().some((e) => e.id.startsWith('5:'))).toBe(false);
    s.update(yOfChunk(5), false);
    expect(s.entities().some((e) => e.id === '5:ceil')).toBe(true); // the chunk itself came back
    expect(s.entities().some((e) => e.id === '5:air')).toBe(false);
    // Neighbouring chunks are untouched by the consumption.
    expect(s.entities().some((e) => e.id === '4:air')).toBe(true);
  });

  it('ignores a repeated consume of the same id', () => {
    const s = new WorldStreamer(makeCampaign(), t);
    s.update(yOfChunk(2), false);
    s.consume('2:air');
    const after = s.entities();
    s.consume('2:air');
    expect(s.entities()).toBe(after);
  });

  it('reset() clears consumed state and re-instantiates the window', () => {
    const campaign = makeCampaign();
    const s = new WorldStreamer(campaign, t);
    s.update(yOfChunk(5), false);
    s.consume('5:air');
    s.consume('6:air');
    expect(s.entities().some((e) => e.id.endsWith(':air') && e.id.startsWith('5:'))).toBe(false);

    s.reset();
    expect(s.entities().some((e) => e.id === '5:air')).toBe(true);
    expect(s.entities().some((e) => e.id === '6:air')).toBe(true);
    expect(s.loadedIndices()).toEqual([4, 5, 6, 7]);
    expect(s.currentChunk().index).toBe(5);
  });

  it('reset() hands out pristine copies even if gameplay mutated the live entities', () => {
    const s = new WorldStreamer(makeCampaign(), t);
    s.update(yOfChunk(2), false);
    const p = s.entities().find((e): e is Pickup => e.id === '2:air');
    expect(p).toBeDefined();
    if (p) p.pos.y = -1;
    s.reset();
    const fresh = s.entities().find((e): e is Pickup => e.id === '2:air');
    expect(fresh?.pos.y).toBe(60 + 2 * t.CHUNK_H);
  });
});
