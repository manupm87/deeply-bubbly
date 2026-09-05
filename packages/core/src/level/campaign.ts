import type { Tuning } from '../tuning';
import type { Immersion, PlacedChunk, WorldEntity } from '../types';
import type { ChunkLibrary } from './library';

export interface Campaign {
  immersions: Immersion[];
  placed: PlacedChunk[];
  /** Total world height covered (last placed chunk bottom). */
  bottomY: number;
}

/**
 * Builds the campaign from hand-authored immersion sequences (MVP §4.1: immersions 1–8 are fixed).
 * Each sequence is IMMERSION_CHUNKS ids whose last chunk has role 'station'. Places chunks consecutively
 * from y = 0, computes boyaY (bottom of chunk BOYA_AFTER_CHUNK) and stationY. Throws on malformed input.
 */
export function buildCampaign(library: ChunkLibrary, sequences: readonly (readonly string[])[], t: Tuning): Campaign {
  void library; void sequences; void t;
  throw new Error('not implemented');
}

/** Copies a chunk's entities into world coordinates (adds worldY, prefixes ids with the placed index). */
export function instantiateChunk(placed: PlacedChunk): WorldEntity[] {
  void placed;
  throw new Error('not implemented');
}

/** Index of the placed chunk containing worldY (clamped). */
export function chunkIndexAt(campaign: Campaign, worldY: number, t: Tuning): number {
  void campaign; void worldY; void t;
  throw new Error('not implemented');
}
