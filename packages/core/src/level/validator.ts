import type { Tuning } from '../tuning';
import type { Chunk } from '../types';
import type { ChunkLibrary } from './library';

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  rule: string; // e.g. 'lanes', 'breathing', 'isolation', 'reach', 'schema', 'segmentTime', 'airBudget', 'pushDir'
  chunkId?: string;
  message: string;
}

/**
 * Validates a single chunk's schema (§11.2, §11.5): anchors exist and reference capturable ceilings,
 * ceilings w>=20 h>=8, entities inside chunk bounds, mouth width, pushDir 'up' only for catalog 20/21,
 * hazards airCost 1, station chunks have no hazards, entry/exit anchors in the declared lanes.
 */
export function validateChunk(chunk: Chunk, t: Tuning): ValidationIssue[] {
  void chunk; void t;
  throw new Error('not implemented');
}

/**
 * Validates a hand-authored immersion sequence (§11.5 rules 1, 4, 5, 6, 11, 13 as applicable to fixed content):
 *  - lanes: exit(i) === entry(i+1) or adjacent (L↔C, C↔R)
 *  - breathing: difficulty >= 4 followed by <= 3; at most two >= 4 per immersion
 *  - reach: vertical gap between consecutive anchors (within a chunk and across the seam) <= MAX_HOP_PX[zone],
 *           AND ballistic reachability with the real integrator from rest (zero entry velocity) — §11.7.7
 *  - segmentTime: sum of targetTimeS between boyas/stations <= MAX_SEGMENT_S
 *  - last chunk must be a station
 * `firstAppearances` lets the caller pass hazard catalog ids already seen in previous immersions (isolation rule).
 */
export function validateSequence(
  library: ChunkLibrary,
  sequence: readonly string[],
  t: Tuning,
  firstAppearances?: Map<number, number>,
): ValidationIssue[] {
  void library; void sequence; void t; void firstAppearances;
  throw new Error('not implemented');
}

/** Validates all sequences of a campaign in order (so the isolation rule sees the whole game). */
export function validateCampaign(library: ChunkLibrary, sequences: readonly (readonly string[])[], t: Tuning): ValidationIssue[] {
  void library; void sequences; void t;
  throw new Error('not implemented');
}
