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
import { guardedRung, lipOf, rungOf, shoulderOf, topOf, z2Chunk } from './pieces';
import type { Chunk } from '../../../types';

const y4 = (i: number): number => RUNG_Y_4[i] ?? 18;
const y5 = (i: number): number => RUNG_Y_5[i] ?? 18;

/**
 * z2-lib-a (difficulty 1) — appearance 2 of the Corriente, still alone. The band covers the left two
 * thirds of the first hop and points LEFT, which is exactly where the landing is: ride it and the shot
 * only has to fall. The right third of the world is still water, so the choice to enter is visible.
 */
const a = ladder('la', [rung(ENTRY_X_RIGHT, y4(0)), rung(230, y4(1)), rung(390, y4(2)), exitRung()]);

export const Z2_LIB_A: Chunk = z2Chunk({
  id: 'z2-lib-a',
  difficulty: 1,
  targetTimeS: 10,
  tags: ['corriente', 'calma'],
  airBudget: 2,
  ladder: a,
  entities: [
    ...reefIn('la', { left: [40, 180], right: [30, 130] }),
    currentBand('la-corriente', 120, 40, 280, 70, -1),
    airPocket('la-air-1', 320, 46),
    airPocket('la-air-2', 300, 186),
    pearl('la-pearl', 480, 100),
    shell('la-concha', 70, 60),
  ],
});

/**
 * z2-lib-b (difficulty 2) — the **Erizo Coralino** (§5 nº 6), alone and static, on the SHOULDER of the
 * second rung: the shot that sails over the shelf pays a pip, the one that arrives from below never
 * touches him. No current here; §11.5.5 gives him the chunk to himself.
 */
const b = ladder('lb', [rung(ENTRY_X_LEFT, y4(0)), rung(300, y4(1)), rung(430, y4(2)), exitRung()]);

export const Z2_LIB_B: Chunk = z2Chunk({
  id: 'z2-lib-b',
  difficulty: 2,
  targetTimeS: 10,
  tags: ['erizo', 'punteria'],
  airBudget: 2,
  ladder: b,
  entities: [
    ...reefIn('lb', { left: [60, 160], right: [140, 90] }),
    erizo('lb-erizo', shoulderOf(rungOf(b, 1)), topOf(rungOf(b, 1))),
    airPocket('lb-air-1', 240, 46),
    airPocket('lb-air-2', 210, 186),
    pearl('lb-pearl', 70, 110),
    pearl('lb-pearl-2', 472, 190),
  ],
});

/**
 * z2-lib-c (difficulty 3) — appearance 2 of the urchin, and the first one that contests a landing: he
 * hangs under the LIP of the second rung, in the corridor the arc dips through, with the rest point
 * 24 px behind him. Cut the corner and you pay; arrive a body's width out and he is never there.
 */
const c = ladder('lc', [rung(ENTRY_X_RIGHT, y4(0)), guardedRung(240, y4(1)), rung(410, y4(2)), exitRung()]);

export const Z2_LIB_C: Chunk = z2Chunk({
  id: 'z2-lib-c',
  difficulty: 3,
  targetTimeS: 11,
  tags: ['punteria', 'repisa'],
  airBudget: 2,
  ladder: c,
  entities: [
    ...reefIn('lc', { left: [30, 190], right: [50, 140] }),
    erizo('lc-erizo', lipOf(rungOf(c, 1)), topOf(rungOf(c, 1)), 'lip'),
    airPocket('lc-air-1', 330, 46),
    airPocket('lc-air-2', 300, 186),
    pearl('lc-pearl', 90, 150),
    shell('lc-concha', 472, 60),
  ],
});

/**
 * z2-lib-d (difficulty 3) — the first chunk allowed to mix (§11.5.5): a band across the opening hop and
 * an urchin on the lip it delivers you to. The band lengthens the shot for free (§5 nº 8) and the crown
 * is what the free length costs if you take it too tight.
 */
const d = ladder('ld', [rung(ENTRY_X_LEFT, y4(0)), guardedRung(330, y4(1)), rung(420, y4(2)), exitRung()]);

export const Z2_LIB_D: Chunk = z2Chunk({
  id: 'z2-lib-d',
  difficulty: 3,
  targetTimeS: 11,
  tags: ['corriente', 'erizo'],
  airBudget: 2,
  ladder: d,
  entities: [
    ...reefIn('ld', { left: [80, 150], right: [20, 170] }),
    currentBand('ld-corriente', 150, 40, 280, 70, 1),
    erizo('ld-erizo', lipOf(rungOf(d, 1)), topOf(rungOf(d, 1)), 'lip'),
    airPocket('ld-air-1', 240, 116),
    airPocket('ld-air-2', 250, 190),
    pearl('ld-pearl', 90, 60),
    shell('ld-concha', 472, 130),
  ],
});

/**
 * z2-lib-e (difficulty 2) — the **Anémona Pegajosa** (§5 nº 7), alone, on the lip of the second rung.
 * She is "recurso, no muerte": the pip she takes buys a downward launch out of her crown, which is why
 * a trap may only ever grow where there is open water underneath (`validator.trapEscapes`).
 */
const e = ladder('le', [rung(ENTRY_X_RIGHT, y4(0)), guardedRung(220, y4(1)), rung(390, y4(2)), exitRung()]);

export const Z2_LIB_E: Chunk = z2Chunk({
  id: 'z2-lib-e',
  difficulty: 2,
  targetTimeS: 10,
  tags: ['anemona', 'trampa'],
  airBudget: 2,
  ladder: e,
  entities: [
    ...reefIn('le', { left: [40, 170], right: [60, 140] }),
    anemona('le-anemona', lipOf(rungOf(e, 1)), topOf(rungOf(e, 1)), 'lip'),
    airPocket('le-air-1', 330, 46),
    airPocket('le-air-2', 300, 186),
    pearl('le-pearl', 480, 130),
    shell('le-concha', 80, 110),
  ],
});

/**
 * z2-lib-f (difficulty 3) — appearance 2 of the anemone, on the widest ladder of the zone: five rest
 * points that cross the world twice. She sits on the third one, the only rung you cannot approach from
 * the far side.
 */
const f = ladder('lf', [
  rung(ENTRY_X_LEFT, y5(0)),
  rung(90, y5(1)),
  guardedRung(250, y5(2)),
  rung(ENTRY_X_RIGHT, y5(3)),
  exitRung(),
]);

export const Z2_LIB_F: Chunk = z2Chunk({
  id: 'z2-lib-f',
  difficulty: 3,
  targetTimeS: 11,
  tags: ['anemona', 'repisa'],
  airBudget: 2,
  ladder: f,
  entities: [
    ...reefIn('lf', { left: [150, 80], right: [30, 160] }),
    anemona('lf-anemona', lipOf(rungOf(f, 2)), topOf(rungOf(f, 2)), 'lip'),
    airPocket('lf-air-1', 330, 40),
    airPocket('lf-air-2', 200, 190),
    pearl('lf-pearl', 472, 110),
  ],
});

/**
 * z2-lib-g (difficulty 4) — bands and crowns on the same ladder, and the hardest descent of the second
 * immersion: an urchin on the shoulder the band pushes you over, and another under the lip of the rung
 * it delivers you to, so reading the current and cutting the corner are the same decision twice.
 */
const g = ladder('lg', [
  rung(ENTRY_X_RIGHT, y5(0)),
  rung(230, y5(1)),
  guardedRung(360, y5(2)),
  rung(440, y5(3)),
  exitRung(),
]);

export const Z2_LIB_G: Chunk = z2Chunk({
  id: 'z2-lib-g',
  difficulty: 4,
  targetTimeS: 12,
  tags: ['erizo', 'corriente'],
  airBudget: 2,
  ladder: g,
  entities: [
    ...reefIn('lg', { left: [30, 180], right: [150, 80] }),
    currentBand('lg-corriente', 200, 75, 260, 65, 1),
    erizo('lg-erizo', lipOf(rungOf(g, 2)), topOf(rungOf(g, 2)), 'lip'),
    erizo('lg-erizo-2', shoulderOf(rungOf(g, 1)), topOf(rungOf(g, 1))),
    airPocket('lg-air-1', 130, 60),
    airPocket('lg-air-2', 230, 195),
    pearl('lg-pearl', 472, 60),
    shell('lg-concha', 70, 200),
  ],
});
