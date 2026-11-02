/**
 * Zone 2, library chunks H–N: the back half of "Borde de arrecife" (GDD §3.2, §12.1). The Pulpo
 * Camuflado (§5 nº 9) is introduced here, and from `z2-lib-j` on the zone is free to mix its whole
 * catalogue — which is what the third immersion is for.
 *
 * Every rule these chunks are built from lives in `pieces.ts`; the geometry lives in `../ladder.ts`.
 * Pulpa, Guardiana del Arrecife (§5 nº 11) is NOT here: §12.1 keeps her out of the MVP, so the zone
 * ends on its hardest playable chunk and then the delivery station.
 */
import {
  ENTRY_LEDGE_Y,
  EXIT_X_EAST,
  EXIT_X_WEST,
  LOWER_Y,
  MID_Y,
  UPPER_Y,
  airPocket,
  anemona,
  currentBand,
  erizo,
  exitRung,
  ladder,
  pearl,
  reefIn,
  rung,
  shell,
} from './builders';
import { guardedRung, lipOf, pulpoRung, rungOf, shoulderOf, topOf, z2Chunk } from './pieces';
import type { Chunk } from '../../../types';

/**
 * z2-lib-h (difficulty 3) — the **Pulpo Camuflado** (§5 nº 9), alone: the second rung is him, and he is
 * indistinguishable from the rock one above until half a second of rest runs out and he tips you off
 * downward. Nothing else in the chunk, because the lesson is "that ledge was not a ledge".
 */
const h = ladder('lh', [rung(220, ENTRY_LEDGE_Y), pulpoRung(325, MID_Y), exitRung(EXIT_X_WEST)], EXIT_X_EAST);

export const Z2_LIB_H: Chunk = z2Chunk({
  id: 'z2-lib-h',
  difficulty: 3,
  targetTimeS: 9,
  tags: ['pulpo', 'camuflaje'],
  airBudget: 2,
  ladder: h,
  entities: [
    ...reefIn('lh', { left: [50, 170], right: [40, 150] }),
    airPocket('lh-air-1', 265, 50),
    airPocket('lh-air-2', 300, 165),
    pearl('lh-pearl', 80, 130),
  ],
});

/**
 * z2-lib-i (difficulty 4) — appearance 2 of the octopus, as the far end of the zone's sweep: the only
 * time the reef sends you out to its eastern wall, and he walks you off before the next line is drawn,
 * so the shot has to be chosen on the way in. Still alone (§11.5.5).
 */
const i = ladder(
  'li',
  [rung(365, ENTRY_LEDGE_Y), pulpoRung(465, UPPER_Y), rung(355, LOWER_Y), exitRung(EXIT_X_WEST)],
  EXIT_X_WEST,
);

export const Z2_LIB_I: Chunk = z2Chunk({
  id: 'z2-lib-i',
  difficulty: 4,
  targetTimeS: 11,
  tags: ['pulpo', 'ritmo'],
  airBudget: 1,
  ladder: i,
  entities: [
    ...reefIn('li', { left: [30, 190], right: [140, 90] }),
    airPocket('li-air', 410, 50),
    pearl('li-pearl', 90, 150),
    shell('li-concha', 472, 110),
  ],
});

/**
 * z2-lib-j (difficulty 3) — the third immersion opens with all three static verbs on one ladder: an
 * anemone contesting the landing, a band on the way out, and an urchin punishing whoever rides it too far.
 */
const j = ladder('lj', [rung(330, ENTRY_LEDGE_Y), guardedRung(215, MID_Y), exitRung(EXIT_X_EAST)], EXIT_X_WEST);

export const Z2_LIB_J: Chunk = z2Chunk({
  id: 'z2-lib-j',
  difficulty: 3,
  targetTimeS: 9,
  tags: ['erizo', 'anemona'],
  airBudget: 2,
  ladder: j,
  entities: [
    ...reefIn('lj', { left: [30, 170], right: [60, 150] }),
    erizo('lj-erizo', shoulderOf(rungOf(j, 2)), topOf(rungOf(j, 2))),
    anemona('lj-anemona', lipOf(rungOf(j, 1)), topOf(rungOf(j, 1)), 'lip'),
    currentBand('lj-corriente', 180, 122, 200, 40, 1),
    airPocket('lj-air-1', 280, 50),
    airPocket('lj-air-2', 225, 170),
    pearl('lj-pearl', 472, 60),
    shell('lj-concha', 80, 195),
  ],
});

/**
 * z2-lib-k (difficulty 3) — the octopus at the end of a band: he hands Bur back to the water at once, so
 * the shot that leaves him has to be drawn before she arrives. The cornice under him is guarded twice
 * over — one urchin on its shoulder for the overshoot, one under its lip for the corner.
 */
const k = ladder('lk', [rung(215, ENTRY_LEDGE_Y), pulpoRung(325, MID_Y), exitRung(EXIT_X_WEST)], EXIT_X_EAST);

export const Z2_LIB_K: Chunk = z2Chunk({
  id: 'z2-lib-k',
  difficulty: 3,
  targetTimeS: 9,
  tags: ['pulpo', 'corriente'],
  airBudget: 2,
  ladder: k,
  entities: [
    ...reefIn('lk', { left: [60, 150], right: [30, 180] }),
    currentBand('lk-corriente', 180, 40, 200, 110, 1),
    erizo('lk-erizo', shoulderOf(rungOf(k, 2)), topOf(rungOf(k, 2))),
    erizo('lk-erizo-2', lipOf(rungOf(k, 2)), topOf(rungOf(k, 2)), 'lip'),
    airPocket('lk-air-1', 270, 55),
    airPocket('lk-air-2', 320, 150),
    pearl('lk-pearl', 80, 120),
  ],
});

/** z2-lib-l (difficulty 4) — a leftward band that delivers Bur straight onto an anemone, then an urchin. */
const l = ladder('ll', [rung(320, ENTRY_LEDGE_Y), guardedRung(215, MID_Y), exitRung(EXIT_X_EAST)], EXIT_X_WEST);

export const Z2_LIB_L: Chunk = z2Chunk({
  id: 'z2-lib-l',
  difficulty: 4,
  targetTimeS: 10,
  tags: ['anemona', 'erizo'],
  airBudget: 2,
  ladder: l,
  entities: [
    ...reefIn('ll', { left: [150, 90], right: [20, 170] }),
    currentBand('ll-corriente', 240, 40, 130, 60, -1),
    anemona('ll-anemona', lipOf(rungOf(l, 1)), topOf(rungOf(l, 1)), 'lip'),
    erizo('ll-erizo', shoulderOf(rungOf(l, 2)), topOf(rungOf(l, 2))),
    airPocket('ll-air-1', 285, 55),
    airPocket('ll-air-2', 240, 165),
    pearl('ll-pearl', 472, 150),
    shell('ll-concha', 60, 200),
  ],
});

/**
 * z2-lib-m (difficulty 3) — the breather before the last chunk (§11.5.4): the octopus and a band on the
 * way out, and nothing that can take a pip. It is the only Zone 2 chunk with no crown at all among its
 * neighbours, which is what "respiro" means when the zone's difficulty is measured in Air.
 */
const m = ladder('lm', [rung(220, ENTRY_LEDGE_Y), pulpoRung(325, MID_Y), exitRung(EXIT_X_WEST)], EXIT_X_EAST);

export const Z2_LIB_M: Chunk = z2Chunk({
  id: 'z2-lib-m',
  difficulty: 3,
  targetTimeS: 9,
  tags: ['corriente', 'pulpo'],
  airBudget: 2,
  ladder: m,
  entities: [
    ...reefIn('lm', { left: [40, 160], right: [60, 150] }),
    currentBand('lm-corriente', 190, 122, 190, 40, -1),
    airPocket('lm-air-1', 265, 55),
    airPocket('lm-air-2', 320, 170),
    pearl('lm-pearl', 472, 195),
  ],
});

/**
 * z2-lib-n (difficulty 5) — the hardest line of the zone and its last playable chunk: two guarded rungs
 * in a row, a crown on each of their lips, and a leftward band to shoot into on the way between them.
 */
const n = ladder(
  'ln',
  [rung(345, ENTRY_LEDGE_Y), guardedRung(265, UPPER_Y), guardedRung(355, LOWER_Y), exitRung(EXIT_X_WEST)],
  EXIT_X_WEST,
);

export const Z2_LIB_N: Chunk = z2Chunk({
  id: 'z2-lib-n',
  difficulty: 5,
  targetTimeS: 11,
  tags: ['preciso', 'erizo'],
  airBudget: 1,
  ladder: n,
  entities: [
    ...reefIn('ln', { left: [30, 190], right: [140, 90] }),
    currentBand('ln-corriente', 240, 85, 170, 85, -1),
    erizo('ln-erizo', lipOf(rungOf(n, 1)), topOf(rungOf(n, 1)), 'lip'),
    anemona('ln-anemona', lipOf(rungOf(n, 2)), topOf(rungOf(n, 2)), 'lip'),
    airPocket('ln-air', 300, 165),
    pearl('ln-pearl', 90, 60),
    shell('ln-concha', 472, 190),
  ],
});
