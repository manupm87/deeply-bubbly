/**
 * The fourteen playable library chunks of Zone 2, "Borde de arrecife" (GDD §3.2, §12.1). With the verb
 * tutorial they are the fifteen playable chunks of the zone's three immersions.
 *
 * They are authored in two files — `libEarly.ts` (A–G) and `libLate.ts` (H–N) — so neither runs past the
 * 300-line ceiling of the repo; this module is the single list the campaign and the tests read.
 *
 * **The verb first.** Every chunk that carries a `corriente` (§5 nº 8) puts the band ACROSS a hop and
 * points it at the landing, so the band is never decoration: it is half of the shot. The reach rule
 * certifies those hops with the current sampled (`validator.flyProbe` flies through the fields), so a
 * line that only exists in still water can never ship — and, in `z2-tut-corriente`, a rest point that
 * only exists WITH the current is what the zone opens on. No band spans the column: a review measured
 * the first version and found full-width bands NARROWED the aim instead of offering anything, because
 * there was no water outside them to choose. Every band now leaves a line around it.
 */
import { Z2_LIB_A, Z2_LIB_B, Z2_LIB_C, Z2_LIB_D, Z2_LIB_E, Z2_LIB_F, Z2_LIB_G } from './libEarly';
import { Z2_LIB_H, Z2_LIB_I, Z2_LIB_J, Z2_LIB_K, Z2_LIB_L, Z2_LIB_M, Z2_LIB_N } from './libLate';
import type { Chunk } from '../../../types';

export { Z2_LIB_A, Z2_LIB_B, Z2_LIB_C, Z2_LIB_D, Z2_LIB_E, Z2_LIB_F, Z2_LIB_G } from './libEarly';
export { Z2_LIB_H, Z2_LIB_I, Z2_LIB_J, Z2_LIB_K, Z2_LIB_L, Z2_LIB_M, Z2_LIB_N } from './libLate';

/** The fourteen library chunks, in campaign order (which is also the order §11.5.5 counts in). */
export const Z2_LIBRARY: readonly Chunk[] = [
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
];
