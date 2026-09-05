import { Z1_BOSS } from './boss';
import { Z1_LIB_A, Z1_LIB_B, Z1_LIB_C, Z1_LIB_D, Z1_LIB_E, Z1_LIB_F } from './libraryChunks';
import { Z1_OPEN_1, Z1_OPEN_2, Z1_OPEN_3 } from './openings';
import { Z1_STATION_1, Z1_STATION_2 } from './stations';
import type { Chunk } from '../../../types';

export * from './builders';
export { Z1_OPEN_1, Z1_OPEN_2, Z1_OPEN_3 } from './openings';
export { Z1_LIB_A, Z1_LIB_B, Z1_LIB_C, Z1_LIB_D, Z1_LIB_E, Z1_LIB_F } from './libraryChunks';
export { Z1_BOSS } from './boss';
export { Z1_STATION_1, Z1_STATION_2 } from './stations';

/**
 * Hand-authored Zone 1 chunks (GDD §12.1: opening x3, verb tutorial, 6 library chunks with all difficulty
 * levels present, boss "Don Hinchón", stations). Chunk-local coordinates: x 0..180, y 0..240.
 * Every chunk MUST pass validateChunk; every sequence in Z1_SEQUENCES MUST pass validateSequence.
 */
export const Z1_CHUNKS: readonly Chunk[] = [
  Z1_OPEN_1,
  Z1_OPEN_2,
  Z1_OPEN_3,
  Z1_LIB_A,
  Z1_LIB_B,
  Z1_LIB_C,
  Z1_LIB_D,
  Z1_LIB_E,
  Z1_LIB_F,
  Z1_BOSS,
  Z1_STATION_1,
  Z1_STATION_2,
];

/**
 * Two immersions (§11.1: Z1 has 2 immersions), each IMMERSION_CHUNKS ids ending with a station chunk.
 *
 * Difficulty flow (§11.5.4, "regla del respiro"): the first immersion stays at 1 and lifts to a 3 just
 * before the station; the second walks 2 → 4 → 3 → 5 → 3, so every chunk of difficulty >= 4 is followed
 * by one of <= 3 and there are never more than two of them in an immersion.
 */
export const Z1_SEQUENCES: readonly (readonly string[])[] = [
  [Z1_OPEN_1.id, Z1_OPEN_2.id, Z1_OPEN_3.id, Z1_LIB_A.id, Z1_LIB_B.id, Z1_STATION_1.id],
  [Z1_LIB_C.id, Z1_LIB_D.id, Z1_LIB_E.id, Z1_LIB_F.id, Z1_BOSS.id, Z1_STATION_2.id],
];
