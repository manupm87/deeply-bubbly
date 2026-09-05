import { clamp } from '../math/vec';
import type { Tuning } from '../tuning';
import type { Boya, Immersion, PlacedChunk, RestStation, WorldEntity } from '../types';
import { zoneAt } from './depth';
import type { ChunkLibrary } from './library';

export interface Campaign {
  immersions: Immersion[];
  placed: PlacedChunk[];
  /** Total world height covered (last placed chunk bottom). */
  bottomY: number;
}

/** Boyas and rest stations derived from the campaign structure; they are not authored inside chunks. */
export interface CampaignMarkers {
  boyas: Boya[];
  stations: RestStation[];
}

/** Single source of truth for marker ids, shared by the streamer and the respawn chain. */
export function boyaId(immersionIndex: number): string {
  return `boya:${immersionIndex}`;
}

export function stationId(immersionIndex: number): string {
  return `station:${immersionIndex}`;
}

/**
 * Builds the campaign from hand-authored immersion sequences (MVP §4.1: immersions 1–8 are fixed).
 * Each sequence is IMMERSION_CHUNKS ids whose last chunk has role 'station'. Places chunks consecutively
 * from y = 0, computes boyaY (bottom of chunk BOYA_AFTER_CHUNK) and stationY. Throws on malformed input.
 *
 * §11.1: "la estación es el sexto chunk de su Inmersión, no un añadido: por eso la aritmética cuadra".
 * `stationY` is therefore a STRUCTURAL fact — the world position of the chunk that was just validated as
 * this immersion's station — and is read back from `placed`, never recomputed from a second constant.
 * (IMMERSION_PLAYABLE_CHUNKS is a live-tunable design number, §11.6; deriving the checkpoint from it would
 * let a slider tweak float the station marker, and every respawn built on it, into a playable chunk.)
 */
export function buildCampaign(library: ChunkLibrary, sequences: readonly (readonly string[])[], t: Tuning): Campaign {
  if (sequences.length === 0) throw new Error('campaign needs at least one immersion sequence');

  const placed: PlacedChunk[] = [];
  const immersions: Immersion[] = [];

  for (let immersionIndex = 0; immersionIndex < sequences.length; immersionIndex++) {
    const ids = sequences[immersionIndex];
    if (!ids) throw new Error(`immersion ${immersionIndex}: missing sequence`);
    if (ids.length !== t.IMMERSION_CHUNKS) {
      throw new Error(`immersion ${immersionIndex}: expected ${t.IMMERSION_CHUNKS} chunks, got ${ids.length}`);
    }

    const startY = placed.length * t.CHUNK_H;
    let firstZone: Immersion['zone'] | null = null;
    let stationY: number | null = null;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === undefined) throw new Error(`immersion ${immersionIndex}: missing chunk id at ${i}`);
      const chunk = library.get(id); // throws on unknown id
      const isLast = i === ids.length - 1;
      if (isLast && chunk.role !== 'station') {
        throw new Error(`immersion ${immersionIndex}: last chunk '${id}' must have role 'station', got '${chunk.role}'`);
      }
      if (!isLast && chunk.role === 'station') {
        throw new Error(`immersion ${immersionIndex}: chunk '${id}' at ${i} is a station but only the last one may be`);
      }
      if (firstZone === null) firstZone = chunk.zone;
      const index = placed.length;
      const worldY = index * t.CHUNK_H;
      placed.push({ chunk, index, worldY, immersionIndex });
      // The checkpoint is the top of the band that was actually instantiated for the station chunk.
      if (chunk.role === 'station') stationY = worldY;
    }

    if (firstZone === null || stationY === null) throw new Error(`immersion ${immersionIndex}: empty sequence`);

    // The boya lives at the bottom of chunk BOYA_AFTER_CHUNK, which must stay strictly inside the playable
    // part of the immersion (§3.1): at the station seam or beyond it is not a mid-immersion checkpoint.
    const boyaY = startY + t.BOYA_AFTER_CHUNK * t.CHUNK_H;
    if (boyaY <= startY || boyaY >= stationY) {
      throw new Error(
        `immersion ${immersionIndex}: BOYA_AFTER_CHUNK=${t.BOYA_AFTER_CHUNK} puts the boya outside the playable ` +
          `chunks (expected 1..${(stationY - startY) / t.CHUNK_H - 1})`,
      );
    }

    immersions.push({
      index: immersionIndex,
      zone: firstZone,
      chunkIds: [...ids],
      startY,
      boyaY,
      stationY,
    });
  }

  return { immersions, placed, bottomY: placed.length * t.CHUNK_H };
}

/** Structural deep copy of plain data (no Date.now / structuredClone in core; chunks are JSON-shaped). */
function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v: unknown) => deepCopy(v)) as unknown as T;
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepCopy(v);
    return out as unknown as T;
  }
  return value;
}

/** Copies a chunk's entities into world coordinates (adds worldY, prefixes ids with the placed index). */
export function instantiateChunk(placed: PlacedChunk): WorldEntity[] {
  const prefix = `${placed.index}:`;
  const dy = placed.worldY;
  return placed.chunk.entities.map((source) => {
    // Deep copy first: the library is shared and must never be mutated by instantiation.
    const e = deepCopy(source);
    e.id = prefix + e.id;
    switch (e.type) {
      case 'ceiling':
      case 'wall':
      case 'forcefield':
        e.rect.y += dy;
        break;
      case 'hazard':
        e.shape.y += dy;
        break;
      case 'anchor':
        e.pos.y += dy;
        e.ceilingId = prefix + e.ceilingId; // references must stay valid after prefixing
        break;
      case 'pickup':
        e.pos.y += dy;
        break;
      case 'boya':
      case 'station':
        e.worldY += dy;
        break;
    }
    return e;
  });
}

/** Index of the placed chunk containing worldY (clamped). */
export function chunkIndexAt(campaign: Campaign, worldY: number, t: Tuning): number {
  return clamp(Math.floor(worldY / t.CHUNK_H), 0, campaign.placed.length - 1);
}

/**
 * Boyas and stations of the campaign (§3.1). A boya sits at the bottom of the third chunk of its immersion;
 * a station is the 240 px band of the sixth chunk. `isDelivery` marks the last station of a zone (§3.3.6):
 * the next immersion belongs to a different zone, or this is the last immersion of the campaign.
 */
export function campaignMarkers(campaign: Campaign, t: Tuning): CampaignMarkers {
  const boyas: Boya[] = [];
  const stations: RestStation[] = [];
  for (const imm of campaign.immersions) {
    boyas.push({ type: 'boya', id: boyaId(imm.index), worldY: imm.boyaY, immersionIndex: imm.index });
    const next = campaign.immersions[imm.index + 1];
    stations.push({
      type: 'station',
      id: stationId(imm.index),
      worldY: imm.stationY,
      zoneFrom: zoneAt(imm.stationY).index,
      zoneTo: zoneAt(imm.stationY + t.CHUNK_H).index,
      isDelivery: next === undefined || next.zone !== imm.zone,
      immersionIndex: imm.index,
    });
  }
  return { boyas, stations };
}

/**
 * Immersions whose authored `chunk.zone` tag (§4.1) disagrees with the zone their startY actually falls in
 * per the normative px table (§11.1). `buildCampaign` keeps `Immersion.zone` as authored — the tag is what
 * drives content selection and `isDelivery` — and does NOT throw here, because the two only line up when a
 * campaign follows the canonical per-zone immersion counts of the §11.1 table (a full 108-chunk run).
 * Content pipelines (`level/validator.ts`) and tests use this to catch an authored sequence that has drifted.
 */
export function immersionZoneMismatches(campaign: Campaign): number[] {
  return campaign.immersions.filter((imm) => imm.zone !== zoneAt(imm.startY).index).map((imm) => imm.index);
}
