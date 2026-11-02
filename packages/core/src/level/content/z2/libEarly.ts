/**
 * Zone 2, library chunks A–G: the first two immersions of "Borde de arrecife" (GDD §3.2, §12.1).
 * `pieces.ts` owns every rule these chunks are built from — where a crown may grow, why a guarded rung
 * has a deeper inset, what a band can physically do over one hop — and `../ladder.ts` owns the geometry.
 *
 * **Didactic isolation (§4.2.1, §11.5.5).** The first two appearances of each catalogue entry come alone
 * in their chunk, in campaign order: nº 8 Corriente in `z2-tut-corriente` and `z2-lib-a`, nº 6 Erizo in
 * `z2-lib-b` and `z2-lib-c`, nº 7 Anémona in `z2-lib-e` and `z2-lib-f`, nº 9 Pulpo in `z2-lib-h` and
 * `z2-lib-i` (`libLate.ts`). Everything from the third appearance on is free to mix.
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
import { guardedRung, lipOf, rungOf, shoulderOf, topOf, z2Chunk } from './pieces';
import type { Chunk } from '../../../types';

/**
 * z2-lib-a (difficulty 1) — appearance 2 of the Corriente, still alone. The band runs along the long hop
 * and points RIGHT, which is exactly where the landing is: ride it and the shot only has to fall. Both
 * sides of the world are still water, so the choice to enter is visible.
 */
const a = ladder('la', [rung(215, ENTRY_LEDGE_Y), rung(325, MID_Y), exitRung(EXIT_X_WEST)], EXIT_X_EAST);

export const Z2_LIB_A: Chunk = z2Chunk({
  id: 'z2-lib-a',
  difficulty: 1,
  targetTimeS: 8,
  tags: ['corriente', 'calma'],
  airBudget: 2,
  ladder: a,
  entities: [
    ...reefIn('la', { left: [40, 180], right: [30, 130] }),
    currentBand('la-corriente', 180, 40, 200, 110, 1),
    airPocket('la-air-1', 270, 60),
    airPocket('la-air-2', 300, 165),
    pearl('la-pearl', 480, 100),
    shell('la-concha', 70, 60),
  ],
});

/**
 * z2-lib-b (difficulty 2) — the **Erizo Coralino** (§5 nº 6), alone and static, on the SHOULDER of the
 * second rung: the shot that sails over the shelf pays a pip, the one that arrives from below never
 * touches him. No current here; §11.5.5 gives him the chunk to himself.
 */
const b = ladder('lb', [rung(325, ENTRY_LEDGE_Y), rung(215, MID_Y), exitRung(EXIT_X_EAST)], EXIT_X_WEST);

export const Z2_LIB_B: Chunk = z2Chunk({
  id: 'z2-lib-b',
  difficulty: 2,
  targetTimeS: 8,
  tags: ['erizo', 'punteria'],
  airBudget: 2,
  ladder: b,
  entities: [
    ...reefIn('lb', { left: [60, 160], right: [140, 90] }),
    erizo('lb-erizo', shoulderOf(rungOf(b, 1)), topOf(rungOf(b, 1))),
    airPocket('lb-air-1', 280, 50),
    airPocket('lb-air-2', 240, 160),
    pearl('lb-pearl', 70, 110),
    pearl('lb-pearl-2', 472, 190),
  ],
});

/**
 * z2-lib-c (difficulty 3) — appearance 2 of the urchin, and the first one that contests a landing: he
 * hangs under the LIP of the second rung, in the corridor the arc dips through, with the rest point
 * 24 px behind him. Cut the corner and you pay; arrive a body's width out and he is never there.
 */
const c = ladder('lc', [rung(210, ENTRY_LEDGE_Y), guardedRung(325, MID_Y), exitRung(EXIT_X_WEST)], EXIT_X_EAST);

export const Z2_LIB_C: Chunk = z2Chunk({
  id: 'z2-lib-c',
  difficulty: 3,
  targetTimeS: 9,
  tags: ['punteria', 'repisa'],
  airBudget: 2,
  ladder: c,
  entities: [
    ...reefIn('lc', { left: [30, 190], right: [50, 140] }),
    erizo('lc-erizo', lipOf(rungOf(c, 1)), topOf(rungOf(c, 1)), 'lip'),
    airPocket('lc-air-1', 265, 55),
    airPocket('lc-air-2', 300, 165),
    pearl('lc-pearl', 90, 150),
    shell('lc-concha', 472, 60),
  ],
});

/**
 * z2-lib-d (difficulty 3) — the first chunk allowed to mix (§11.5.5), and one of the zigzags that keeps
 * its exit: a band along the hop that opens the climb back, and an urchin on the lip it delivers you to.
 * The band lengthens the shot for free (§5 nº 8) and the crown is what the free length costs if you take
 * it too tight.
 */
const d = ladder(
  'ld',
  [rung(345, ENTRY_LEDGE_Y), rung(265, UPPER_Y), guardedRung(355, LOWER_Y), exitRung(EXIT_X_WEST)],
  EXIT_X_WEST,
);

export const Z2_LIB_D: Chunk = z2Chunk({
  id: 'z2-lib-d',
  difficulty: 3,
  targetTimeS: 10,
  tags: ['corriente', 'erizo'],
  airBudget: 2,
  ladder: d,
  entities: [
    ...reefIn('ld', { left: [80, 150], right: [20, 170] }),
    currentBand('ld-corriente', 240, 85, 170, 85, 1),
    erizo('ld-erizo', lipOf(rungOf(d, 2)), topOf(rungOf(d, 2)), 'lip'),
    airPocket('ld-air-1', 310, 60),
    airPocket('ld-air-2', 300, 165),
    pearl('ld-pearl', 90, 60),
    shell('ld-concha', 472, 130),
  ],
});

/**
 * z2-lib-e (difficulty 2) — the **Anémona Pegajosa** (§5 nº 7), alone, on the lip of the second rung.
 * She is "recurso, no muerte": the pip she takes buys a downward launch out of her crown, which is why
 * a trap may only ever grow where there is open water underneath (`validator.trapEscapes`).
 */
const e = ladder('le', [rung(330, ENTRY_LEDGE_Y), guardedRung(215, MID_Y), exitRung(EXIT_X_EAST)], EXIT_X_WEST);

export const Z2_LIB_E: Chunk = z2Chunk({
  id: 'z2-lib-e',
  difficulty: 2,
  targetTimeS: 8,
  tags: ['anemona', 'trampa'],
  airBudget: 2,
  ladder: e,
  entities: [
    ...reefIn('le', { left: [40, 170], right: [60, 140] }),
    anemona('le-anemona', lipOf(rungOf(e, 1)), topOf(rungOf(e, 1)), 'lip'),
    airPocket('le-air-1', 285, 50),
    airPocket('le-air-2', 300, 165),
    pearl('le-pearl', 480, 130),
    shell('le-concha', 80, 110),
  ],
});

/** z2-lib-f (difficulty 3) — appearance 2 of the anemone, mirrored: she now guards the eastern landing. */
const f = ladder('lf', [rung(210, ENTRY_LEDGE_Y), guardedRung(325, MID_Y), exitRung(EXIT_X_WEST)], EXIT_X_EAST);

export const Z2_LIB_F: Chunk = z2Chunk({
  id: 'z2-lib-f',
  difficulty: 3,
  targetTimeS: 9,
  tags: ['anemona', 'repisa'],
  airBudget: 2,
  ladder: f,
  entities: [
    ...reefIn('lf', { left: [150, 80], right: [30, 160] }),
    anemona('lf-anemona', lipOf(rungOf(f, 1)), topOf(rungOf(f, 1)), 'lip'),
    airPocket('lf-air-1', 260, 55),
    airPocket('lf-air-2', 300, 165),
    pearl('lf-pearl', 472, 110),
  ],
});

/**
 * z2-lib-g (difficulty 4) — bands and crowns on the same ladder, and the hardest descent of the second
 * immersion: a band that carries you into the urchin under the lip of the rung it delivers you to, and
 * another on the cornice for whoever overshoots the way out. Reading the current and cutting the corner
 * are the same decision twice.
 */
const g = ladder('lg', [rung(320, ENTRY_LEDGE_Y), guardedRung(215, MID_Y), exitRung(EXIT_X_EAST)], EXIT_X_WEST);

export const Z2_LIB_G: Chunk = z2Chunk({
  id: 'z2-lib-g',
  difficulty: 4,
  targetTimeS: 10,
  tags: ['erizo', 'corriente'],
  airBudget: 2,
  ladder: g,
  entities: [
    ...reefIn('lg', { left: [30, 180], right: [150, 80] }),
    currentBand('lg-corriente', 240, 40, 130, 60, -1),
    erizo('lg-erizo', lipOf(rungOf(g, 1)), topOf(rungOf(g, 1)), 'lip'),
    erizo('lg-erizo-2', shoulderOf(rungOf(g, 2)), topOf(rungOf(g, 2))),
    airPocket('lg-air-1', 285, 55),
    airPocket('lg-air-2', 240, 165),
    pearl('lg-pearl', 472, 60),
    shell('lg-concha', 70, 200),
  ],
});
