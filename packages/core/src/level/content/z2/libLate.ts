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
  ENTRY_X_LEFT,
  ENTRY_X_RIGHT,
  RUNG_Y_4,
  RUNG_Y_5,
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

const y4 = (i: number): number => RUNG_Y_4[i] ?? 18;
const y5 = (i: number): number => RUNG_Y_5[i] ?? 18;

/**
 * z2-lib-h (difficulty 3) — the **Pulpo Camuflado** (§5 nº 9), alone: the second rung is him, and he is
 * indistinguishable from the rock one above until half a second of rest runs out and he tips you off
 * downward. Nothing else in the chunk, because the lesson is "that ledge was not a ledge".
 */
const h = ladder('lh', [rung(ENTRY_X_LEFT, y4(0)), pulpoRung(340, y4(1)), rung(410, y4(2)), exitRung()]);

export const Z2_LIB_H: Chunk = z2Chunk({
  id: 'z2-lib-h',
  difficulty: 3,
  targetTimeS: 11,
  tags: ['pulpo', 'camuflaje'],
  airBudget: 2,
  ladder: h,
  entities: [
    ...reefIn('lh', { left: [50, 170], right: [40, 150] }),
    airPocket('lh-air-1', 240, 46),
    airPocket('lh-air-2', 250, 190),
    pearl('lh-pearl', 80, 130),
  ],
});

/**
 * z2-lib-i (difficulty 4) — appearance 2 of the octopus, this time as the rung a long left-hand sweep
 * lands on: he walks you off before the next line is drawn, so the shot has to be chosen in the air on
 * the way in. Still alone (§11.5.5).
 */
const i = ladder('li', [rung(ENTRY_X_RIGHT, y4(0)), pulpoRung(250, y4(1)), rung(380, y4(2)), exitRung()]);

export const Z2_LIB_I: Chunk = z2Chunk({
  id: 'z2-lib-i',
  difficulty: 4,
  targetTimeS: 12,
  tags: ['pulpo', 'ritmo'],
  airBudget: 1,
  ladder: i,
  entities: [
    ...reefIn('li', { left: [30, 190], right: [140, 90] }),
    airPocket('li-air', 330, 46),
    pearl('li-pearl', 90, 150),
    shell('li-concha', 472, 110),
  ],
});

/**
 * z2-lib-j (difficulty 3) — the third immersion opens with all three static verbs on one ladder: an
 * urchin punishing the overshoot, an anemone contesting the landing after it, and a band on the way out.
 */
const j = ladder('lj', [
  rung(ENTRY_X_LEFT, y5(0)),
  rung(330, y5(1)),
  guardedRung(210, y5(2)),
  rung(390, y5(3)),
  exitRung(),
]);

export const Z2_LIB_J: Chunk = z2Chunk({
  id: 'z2-lib-j',
  difficulty: 3,
  targetTimeS: 11,
  tags: ['erizo', 'anemona'],
  airBudget: 2,
  ladder: j,
  entities: [
    ...reefIn('lj', { left: [30, 170], right: [60, 150] }),
    erizo('lj-erizo', shoulderOf(rungOf(j, 1)), topOf(rungOf(j, 1))),
    anemona('lj-anemona', lipOf(rungOf(j, 2)), topOf(rungOf(j, 2)), 'lip'),
    currentBand('lj-corriente', 180, 125, 280, 60, 1),
    airPocket('lj-air-1', 250, 40),
    airPocket('lj-air-2', 300, 195),
    pearl('lj-pearl', 472, 60),
    shell('lj-concha', 80, 195),
  ],
});

/**
 * z2-lib-k (difficulty 3) — the octopus riding a band: he hands Bur back to the water mid-drift, so the
 * shot that leaves him has to be the one the current was already going to take. The rung it lands on is
 * guarded twice over — one urchin on its shoulder for the overshoot, one under its lip for the corner.
 */
const k = ladder('lk', [rung(ENTRY_X_RIGHT, y4(0)), pulpoRung(260, y4(1)), guardedRung(420, y4(2)), exitRung()]);

export const Z2_LIB_K: Chunk = z2Chunk({
  id: 'z2-lib-k',
  difficulty: 3,
  targetTimeS: 11,
  tags: ['pulpo', 'corriente'],
  airBudget: 2,
  ladder: k,
  entities: [
    ...reefIn('lk', { left: [60, 150], right: [30, 180] }),
    currentBand('lk-corriente', 230, 90, 260, 60, 1),
    erizo('lk-erizo', shoulderOf(rungOf(k, 2)), topOf(rungOf(k, 2))),
    erizo('lk-erizo-2', lipOf(rungOf(k, 2)), topOf(rungOf(k, 2)), 'lip'),
    airPocket('lk-air-1', 340, 46),
    airPocket('lk-air-2', 200, 190),
    pearl('lk-pearl', 80, 120),
  ],
});

/**
 * z2-lib-l (difficulty 4) — the widest sweep of the zone, opened by a leftward band that drops Bur
 * against the reef, then two crowns on the way back across.
 */
const l = ladder('ll', [
  rung(ENTRY_X_LEFT, y5(0)),
  rung(100, y5(1)),
  guardedRung(260, y5(2)),
  rung(410, y5(3)),
  exitRung(),
]);

export const Z2_LIB_L: Chunk = z2Chunk({
  id: 'z2-lib-l',
  difficulty: 4,
  targetTimeS: 12,
  tags: ['anemona', 'erizo'],
  airBudget: 2,
  ladder: l,
  entities: [
    ...reefIn('ll', { left: [150, 90], right: [20, 170] }),
    currentBand('ll-corriente', 40, 30, 260, 60, -1),
    anemona('ll-anemona', lipOf(rungOf(l, 2)), topOf(rungOf(l, 2)), 'lip'),
    erizo('ll-erizo', shoulderOf(rungOf(l, 3)), topOf(rungOf(l, 3))),
    airPocket('ll-air-1', 330, 40),
    airPocket('ll-air-2', 210, 195),
    pearl('ll-pearl', 472, 150),
    shell('ll-concha', 60, 200),
  ],
});

/**
 * z2-lib-m (difficulty 3) — the breather before the last chunk (§11.5.4): the octopus and a band across
 * the middle, and nothing that can take a pip. It is the only Zone 2 chunk with no crown at all, which
 * is what "respiro" means when the zone's difficulty is measured in Air.
 */
const m = ladder('lm', [
  rung(ENTRY_X_RIGHT, y5(0)),
  pulpoRung(220, y5(1)),
  rung(340, y5(2)),
  rung(430, y5(3)),
  exitRung(),
]);

export const Z2_LIB_M: Chunk = z2Chunk({
  id: 'z2-lib-m',
  difficulty: 3,
  targetTimeS: 11,
  tags: ['corriente', 'pulpo'],
  airBudget: 2,
  ladder: m,
  entities: [
    ...reefIn('lm', { left: [40, 160], right: [60, 150] }),
    currentBand('lm-corriente', 180, 80, 260, 60, 1),
    airPocket('lm-air-1', 130, 60),
    airPocket('lm-air-2', 280, 195),
    pearl('lm-pearl', 472, 195),
  ],
});

/**
 * z2-lib-n (difficulty 5) — the hardest line of the zone and its last playable chunk: two guarded rungs
 * in a row, a crown on each of their lips, and a leftward band pulling against the whole descent.
 */
const n = ladder('ln', [
  rung(ENTRY_X_LEFT, y4(0)),
  guardedRung(350, y4(1)),
  guardedRung(440, y4(2)),
  exitRung(),
]);

export const Z2_LIB_N: Chunk = z2Chunk({
  id: 'z2-lib-n',
  difficulty: 5,
  targetTimeS: 12,
  tags: ['preciso', 'erizo'],
  airBudget: 1,
  ladder: n,
  entities: [
    ...reefIn('ln', { left: [30, 190], right: [140, 90] }),
    currentBand('ln-corriente', 150, 40, 280, 70, -1),
    erizo('ln-erizo', lipOf(rungOf(n, 1)), topOf(rungOf(n, 1)), 'lip'),
    anemona('ln-anemona', lipOf(rungOf(n, 2)), topOf(rungOf(n, 2)), 'lip'),
    airPocket('ln-air', 250, 190),
    pearl('ln-pearl', 90, 60),
    shell('ln-concha', 472, 190),
  ],
});
