import { describe, expect, it, vi } from 'vitest';
import { createTuning } from '../tuning';
import type { Chunk, ZoneIndex } from '../types';
import type * as DepthModule from './depth';
import { ChunkLibrary } from './library';
import { buildCampaign, campaignMarkers } from './campaign';

// Same normative mock used by campaign.test.ts: a faithful lookup over the real ZONES table (§11.1).
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

function makeChunk(id: string, role: Chunk['role'], zone: ZoneIndex = 0): Chunk {
  return {
    id,
    zone,
    difficulty: 1,
    verbs: [],
    entry: 'C',
    exit: 'C',
    entryAnchorId: 'a-in',
    exitAnchorId: 'a-out',
    airBudget: 1,
    targetTimeS: 8,
    tags: [],
    role,
    entities: [],
  };
}

/**
 * GDD §11.1: "La estación es el sexto chunk de su Inmersión, no un añadido: por eso la aritmética cuadra."
 * `Immersion.stationY` must always land exactly on the worldY of the chunk that was actually validated
 * and placed as that immersion's 'station' chunk (the last id of the sequence). campaign.ts instead
 * derives it from a SECOND, independently-tunable constant (`IMMERSION_PLAYABLE_CHUNKS`) that is never
 * checked against the sequence length / the position of the validated station chunk. The two are only
 * equal by coincidence in DEFAULT_TUNING (5 === 6 - 1); nothing enforces that invariant, so a live-panel
 * tweak of either constant (explicitly a supported use case, §11.6) silently desyncs the checkpoint
 * geometry from the instantiated station chunk.
 */
describe('BUG: Immersion.stationY is a duplicated rule, not derived from the validated station chunk', () => {
  it('desyncs stationY from the actual placed station chunk when IMMERSION_PLAYABLE_CHUNKS drifts from IMMERSION_CHUNKS - 1', () => {
    // Drift only the "how many chunks are playable" constant; IMMERSION_CHUNKS (sequence length) is untouched.
    const t = createTuning({ IMMERSION_PLAYABLE_CHUNKS: 4 });
    const ids = ['a', 'b', 'c', 'd', 'e', 'station'];
    const lib = new ChunkLibrary([
      makeChunk('a', 'playable'),
      makeChunk('b', 'playable'),
      makeChunk('c', 'playable'),
      makeChunk('d', 'playable'),
      makeChunk('e', 'playable'),
      makeChunk('station', 'station'),
    ]);
    const campaign = buildCampaign(lib, [ids], t);

    const actualStationChunk = campaign.placed.find((p) => p.chunk.role === 'station');
    expect(actualStationChunk).toBeDefined();

    // This is the real, load-bearing fact: where the station's geometry (walls, ceilings, the safe band)
    // actually lives in world space, exactly as `instantiateChunk` will offset it.
    const actualStationWorldY = actualStationChunk?.worldY;
    expect(actualStationWorldY).toBe(5 * t.CHUNK_H); // 1200: the 6th chunk (index 5), always true by construction.

    const immersion = campaign.immersions[0];
    expect(immersion).toBeDefined();

    // BUG: stationY (720 = 4 * 240) does not match where the station chunk actually is (1200).
    // Any respawn point or streaming marker built from `immersion.stationY` now floats 480 px
    // (two full chunks) above the real station band, inside chunk 'c' — a playable, possibly
    // hazardous chunk — instead of the safe, hazard-free station band.
    expect(immersion?.stationY).toBe(actualStationWorldY);
  });

  it('places the derived RestStation marker outside the actual station chunk band when the constants drift', () => {
    const t = createTuning({ IMMERSION_PLAYABLE_CHUNKS: 4 });
    const lib = new ChunkLibrary([
      makeChunk('a', 'playable'),
      makeChunk('b', 'playable'),
      makeChunk('c', 'playable'),
      makeChunk('d', 'playable'),
      makeChunk('e', 'playable'),
      makeChunk('station', 'station'),
    ]);
    const campaign = buildCampaign(lib, [['a', 'b', 'c', 'd', 'e', 'station']], t);
    const actualStationChunk = campaign.placed.find((p) => p.chunk.role === 'station');
    if (!actualStationChunk) throw new Error('fixture');

    const { stations } = campaignMarkers(campaign, t);
    const marker = stations[0];
    expect(marker).toBeDefined();

    // The marker's worldY (what the streamer shows and what respawn.ts uses as the checkpoint) should
    // fall inside the station chunk's own 240 px band [worldY, worldY + CHUNK_H). It does not.
    const inBand =
      (marker?.worldY ?? -1) >= actualStationChunk.worldY &&
      (marker?.worldY ?? -1) < actualStationChunk.worldY + t.CHUNK_H;
    expect(inBand).toBe(true);
  });
});
