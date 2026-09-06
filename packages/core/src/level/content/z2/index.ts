/**
 * Hand-authored Zone 2 chunks, "Borde de arrecife" (GDD §3.2: 200–600 m, world px 2 880–7 200, three
 * immersions = 18 chunks = 15 playable + 3 stations). Chunk-local coordinates: x 0..540, y 0..240 (D3).
 *
 * Every chunk MUST pass `validateChunk`; `Z2_SEQUENCES` MUST pass `validateSequence`, and the whole
 * campaign `Z1_SEQUENCES ++ Z2_SEQUENCES` MUST pass `validateCampaign` — the Z1 → Z2 seam included
 * (§11.5.11: "la regla se aplica también a la junta entre chunks").
 *
 * Pulpa, Guardiana del Arrecife (§5 nº 11) is NOT here: §12.1 keeps her out of the MVP ("Pulpa pasa a
 * H3"), so the zone's last immersion ends on its hardest playable chunk and then the delivery station.
 */
import { Z2_LIBRARY, Z2_LIB_A, Z2_LIB_B, Z2_LIB_C, Z2_LIB_D, Z2_LIB_E, Z2_LIB_F, Z2_LIB_G, Z2_LIB_H, Z2_LIB_I, Z2_LIB_J, Z2_LIB_K, Z2_LIB_L, Z2_LIB_M, Z2_LIB_N } from './libraryChunks';
import { Z2_STATION_1, Z2_STATION_2, Z2_STATION_3 } from './stations';
import { Z2_TUTORIAL } from './tutorial';
import type { Chunk } from '../../../types';

export { Z2, Z2_MAX_HOP, Z2_MAX_HOP_X, Z2_RADIUS } from './builders';
export { Z2_TUTORIAL } from './tutorial';
export { Z2_STATION_1, Z2_STATION_2, Z2_STATION_3 } from './stations';
export {
  Z2_LIBRARY,
  Z2_LIB_A,
  Z2_LIB_B,
  Z2_LIB_C,
  Z2_LIB_D,
  Z2_LIB_E,
  Z2_LIB_F,
  Z2_LIB_G,
  Z2_LIB_H,
  Z2_LIB_I,
  Z2_LIB_J,
  Z2_LIB_K,
  Z2_LIB_L,
  Z2_LIB_M,
  Z2_LIB_N,
} from './libraryChunks';

/** Every authored Zone 2 chunk: the verb tutorial, fourteen playable chunks and three stations. */
export const Z2_CHUNKS: readonly Chunk[] = [
  Z2_TUTORIAL,
  ...Z2_LIBRARY,
  Z2_STATION_1,
  Z2_STATION_2,
  Z2_STATION_3,
];

/**
 * The three immersions of the zone (§11.1: Z2 has 3), each IMMERSION_CHUNKS ids ending with a station.
 *
 * Difficulty flow (§4.2, §11.5.4). The zone walks 1-3 in the first immersion, 2-4 in the second and up
 * to 5 in the third, and the "regla del respiro" holds everywhere: no chunk of difficulty >= 4 is ever
 * followed by another one, and no immersion carries more than two of them.
 *
 *   immersion 3 of the campaign:  1  1  2  3  3  · station
 *   immersion 4 of the campaign:  2  3  4  3  4  · station
 *   immersion 5 of the campaign:  3  3  4  3  5  · station (delivery)
 *
 * The ladder is continuous through the Z1 → Z2 seam as well: every chunk of the game exits on the same
 * cornice column and enters on one of the two entry columns, so `z1-station-2` -> `z2-tut-corriente` is
 * the same 53 px hop as any other (`../ladder.ts`).
 */
export const Z2_SEQUENCES: readonly (readonly string[])[] = [
  [Z2_TUTORIAL.id, Z2_LIB_A.id, Z2_LIB_B.id, Z2_LIB_C.id, Z2_LIB_D.id, Z2_STATION_1.id],
  [Z2_LIB_E.id, Z2_LIB_F.id, Z2_LIB_G.id, Z2_LIB_H.id, Z2_LIB_I.id, Z2_STATION_2.id],
  [Z2_LIB_J.id, Z2_LIB_K.id, Z2_LIB_L.id, Z2_LIB_M.id, Z2_LIB_N.id, Z2_STATION_3.id],
];
