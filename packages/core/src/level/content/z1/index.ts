import type { Chunk } from '../../../types';

/**
 * Hand-authored Zone 1 chunks (GDD §12.1: opening x3, verb tutorial, 6 library chunks with all difficulty
 * levels present, boss "Don Hinchón", stations). Chunk-local coordinates: x 0..180, y 0..240.
 * Every chunk MUST pass validateChunk; every sequence in Z1_SEQUENCES MUST pass validateSequence.
 */
export const Z1_CHUNKS: readonly Chunk[] = [];

/** Two immersions (§11.1: Z1 has 2 immersions), each IMMERSION_CHUNKS ids ending with a station chunk. */
export const Z1_SEQUENCES: readonly (readonly string[])[] = [];
