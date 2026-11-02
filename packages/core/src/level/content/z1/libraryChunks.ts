/**
 * The six playable library chunks of Zone 1 (GDD §12.1: "18 chunks de biblioteca (6 por zona, con al
 * menos un chunk de cada nivel de dificultad presente)"). Difficulties 1, 3, 2, 4, 3, 5 — every level of
 * the 1–5 histogram is represented, which is what keeps the H3 selector from running out of candidates.
 *
 * Zone 1 fauna is never a `Hazard`: nº 1 (Medusa Farolillo), nº 2 (Alga Cinta) and nº 3 (Tortuga
 * Paseante) are all `Ceiling`s of §5 carrying their `catalogId`, and nº 4 (Peces payaso) is decorative
 * and drops a pearl. Nothing here costs Air — the difficulty of Z1 is the line you choose, not the
 * damage you take — but §11.5.5 still applies, so each creature gets its first TWO chunks to itself:
 * alga in `z1-lib-a` and `z1-lib-d`, tortuga in `z1-lib-b` and `z1-lib-e`, medusa in `z1-open-3` and
 * `z1-lib-c`. `z1-lib-f` is the first chunk allowed to mix them.
 *
 * **Shape.** Three rungs and a reversal per hop, so the next ledge is on screen when the shot is chosen
 * (`../ladder.ts`). `z1-lib-a` and `z1-lib-e` are the exceptions on purpose: the two sweeps of the zone,
 * one west and one east, where the camera has to travel and the 540 px of D3 are actually crossed. The
 * pearls sit OFF the ladder, against the reef: a detour costs seconds and buys nothing but the shell
 * count, which is the *Hungry Shark* shape D3 asks for.
 */
import {
  ENTRY_LEDGE_Y,
  EXIT_X_EAST,
  EXIT_X_WEST,
  LOWER_Y,
  MID_Y,
  UPPER_Y,
  airPocket,
  exitRung,
  jellyfish,
  kelpRung,
  ladder,
  pearl,
  reefIn,
  rung,
  shell,
  turtleRung,
} from './builders';
import type { Chunk } from '../../../types';

const VERBS = ['apuntar', 'soltar', 'reposar'];

/** z1-lib-a (difficulty 1) — the west sweep: out to the left reef under an Alga Cinta, and back. */
const a = ladder(
  'la',
  [
    rung(180, ENTRY_LEDGE_Y),
    kelpRung(80, UPPER_Y),
    rung(185, LOWER_Y, { material: 'coral' }),
    exitRung(EXIT_X_EAST),
  ],
  EXIT_X_EAST,
);

export const Z1_LIB_A: Chunk = {
  id: 'z1-lib-a',
  zone: 0,
  difficulty: 1,
  verbs: VERBS,
  entryAnchorId: a.entryAnchorId,
  exitAnchorId: a.exitAnchorId,
  airBudget: 2,
  targetTimeS: 11,
  tags: ['alga', 'calma'],
  role: 'playable',
  entities: [
    ...a.entities,
    ...reefIn('la', { left: [100, 110], right: [30, 120] }),
    airPocket('la-air-1', 130, 50),
    airPocket('la-air-2', 240, 150),
    pearl('la-pearl', 480, 60),
    shell('la-concha', 70, 150),
  ],
};

/**
 * z1-lib-b (difficulty 3) — the Tortuga Paseante carries the second landing 60 px sideways while you
 * aim. Her shell is 76 px wide and the rest point is at its centre, so the walk never leaves the anchor
 * hanging in open water (§11.2) — and her rest point is 38 px past her near edge, which is why the hop
 * that reaches her is longer than the ones around it.
 */
const b = ladder(
  'lb',
  [rung(215, ENTRY_LEDGE_Y), turtleRung(320, MID_Y), exitRung(EXIT_X_WEST)],
  EXIT_X_EAST,
);

export const Z1_LIB_B: Chunk = {
  id: 'z1-lib-b',
  zone: 0,
  difficulty: 3,
  verbs: VERBS,
  entryAnchorId: b.entryAnchorId,
  exitAnchorId: b.exitAnchorId,
  airBudget: 2,
  targetTimeS: 9,
  tags: ['tortuga', 'movil'],
  role: 'playable',
  entities: [
    ...b.entities,
    ...reefIn('lb', { left: [60, 150], right: [150, 80] }),
    airPocket('lb-air-1', 265, 60),
    airPocket('lb-air-2', 300, 150),
    pearl('lb-pearl-1', 70, 60),
    pearl('lb-pearl-2', 470, 195),
  ],
};

/**
 * z1-lib-c (difficulty 2) — the second appearance of the Medusa Farolillo. §11.5.5 gives her this chunk
 * to herself, so there is no alga and no tortuga here: just the jellyfish, parked on the line of the
 * long hop at the depth Bur rises back through.
 */
const c = ladder(
  'lc',
  [rung(330, ENTRY_LEDGE_Y), rung(215, MID_Y, { material: 'coral' }), exitRung(EXIT_X_EAST)],
  EXIT_X_WEST,
);

export const Z1_LIB_C: Chunk = {
  id: 'z1-lib-c',
  zone: 0,
  difficulty: 2,
  verbs: VERBS,
  entryAnchorId: c.entryAnchorId,
  exitAnchorId: c.exitAnchorId,
  airBudget: 2,
  targetTimeS: 9,
  tags: ['medusa', 'zigzag'],
  role: 'playable',
  entities: [
    ...c.entities,
    ...reefIn('lc', { left: [140, 90], right: [40, 150] }),
    jellyfish('lc-medusa', 249, 60, 40),
    airPocket('lc-air-1', 260, 130),
    airPocket('lc-air-2', 240, 165),
    pearl('lc-pearl', 472, 100),
    shell('lc-concha', 60, 200),
  ],
};

/**
 * z1-lib-d (difficulty 4) — the long-drop chunk: a 100 px fall (`MAX_HOP_PX` is 110 in Zone 1) onto an
 * Alga Cinta, which absorbs 82 % of the arrival speed and leaves nothing to work with (§5 nº 2). Second
 * appearance of the alga, so it is alone here too.
 */
const d = ladder(
  'ld',
  [rung(220, ENTRY_LEDGE_Y), kelpRung(325, 118), exitRung(EXIT_X_WEST)],
  EXIT_X_EAST,
);

export const Z1_LIB_D: Chunk = {
  id: 'z1-lib-d',
  zone: 0,
  difficulty: 4,
  verbs: VERBS,
  entryAnchorId: d.entryAnchorId,
  exitAnchorId: d.exitAnchorId,
  airBudget: 2,
  targetTimeS: 9,
  tags: ['alga', 'salto-largo'],
  role: 'playable',
  entities: [
    ...d.entities,
    ...reefIn('ld', { left: [30, 200], right: [60, 120] }),
    airPocket('ld-air-1', 270, 75),
    airPocket('ld-air-2', 300, 160),
    pearl('ld-pearl', 80, 90),
  ],
};

/**
 * z1-lib-e (difficulty 3) — the east sweep and the second Tortuga Paseante: out to the right reef, then
 * back onto a shell that is already walking away from where you aimed. The exit is a fixed cornice on
 * purpose — a respawn point (§2.4.2) that moves is not a point.
 */
const e = ladder(
  'le',
  [
    rung(365, ENTRY_LEDGE_Y, { material: 'coral' }),
    rung(465, UPPER_Y),
    turtleRung(355, LOWER_Y),
    exitRung(EXIT_X_WEST),
  ],
  EXIT_X_WEST,
);

export const Z1_LIB_E: Chunk = {
  id: 'z1-lib-e',
  zone: 0,
  difficulty: 3,
  verbs: VERBS,
  entryAnchorId: e.entryAnchorId,
  exitAnchorId: e.exitAnchorId,
  airBudget: 2,
  targetTimeS: 11,
  tags: ['tortuga', 'movil'],
  role: 'playable',
  entities: [
    ...e.entities,
    ...reefIn('le', { left: [50, 160], right: [100, 60] }),
    airPocket('le-air-1', 410, 50),
    airPocket('le-air-2', 300, 165),
    pearl('le-pearl', 80, 130),
    shell('le-concha', 472, 130),
  ],
};

/**
 * z1-lib-f (difficulty 5) — the hardest line of the zone and the first chunk allowed to mix creatures
 * (§11.5.5: every one of them is past its second appearance by now). Two Medusa Farolillo, each on the
 * line of one hop, and an Alga Cinta as the landing in between.
 */
const f = ladder(
  'lf',
  [rung(330, ENTRY_LEDGE_Y), kelpRung(215, MID_Y), exitRung(EXIT_X_EAST)],
  EXIT_X_WEST,
);

export const Z1_LIB_F: Chunk = {
  id: 'z1-lib-f',
  zone: 0,
  difficulty: 5,
  verbs: VERBS,
  entryAnchorId: f.entryAnchorId,
  exitAnchorId: f.exitAnchorId,
  airBudget: 2,
  targetTimeS: 9,
  tags: ['medusa', 'preciso'],
  role: 'playable',
  entities: [
    ...f.entities,
    ...reefIn('lf', { left: [30, 180], right: [140, 90] }),
    jellyfish('lf-medusa-1', 249, 60, 40),
    jellyfish('lf-medusa-2', 244, 150, 40),
    airPocket('lf-air-1', 170, 60),
    airPocket('lf-air-2', 200, 190),
    pearl('lf-pearl-1', 472, 60),
    pearl('lf-pearl-2', 70, 200),
  ],
};
