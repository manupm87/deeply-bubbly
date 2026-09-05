/**
 * The six playable library chunks of Zone 1 (GDD §12.1: "18 chunks de biblioteca (6 por zona, con al
 * menos un chunk de cada nivel de dificultad presente)"). Difficulties 1, 3, 2, 4, 3, 5 — every level of
 * the 1–5 histogram is represented, which is what keeps the H3 selector from running out of candidates.
 *
 * Zone 1 fauna is never a `Hazard`: nº 1 (Medusa Farolillo), nº 2 (Alga Cinta) and nº 3 (Tortuga
 * Paseante) are all `Ceiling`s of §5 carrying their `catalogId`, and nº 4 (Peces payaso) is decorative
 * and drops a pearl. Nothing here costs Air — the difficulty of Z1 is the line you choose, not the
 * damage you take — but §11.5.5 still applies to them, so each creature gets its first TWO chunks to
 * itself: alga in `z1-lib-a` and `z1-lib-d`, tortuga in `z1-lib-b` and `z1-lib-e`, medusa in
 * `z1-open-3` and `z1-lib-c`. `z1-lib-f` is the first chunk allowed to mix them.
 */
import { Z1, airPocket, anchorIdOf, jellyfish, kelp, pearl, perch, sideRock, turtle } from './builders';
import type { Anchor, Ceiling, Chunk } from '../../../types';

const VERBS = ['cargar', 'soltar', 'reposar'];

/** z1-lib-a (difficulty 1) — a calm three-step descent with an Alga Cinta as the middle landing. */
const a: Array<[Ceiling, Anchor]> = [
  perch({ id: 'la-p1', x: 141, y: 18, w: 36, anchorX: 150, material: 'coral' }),
  kelp('la-p2', 3, 108, 36, 30),
  perch({ id: 'la-p3', x: 101, y: 188, w: 48, anchorX: 110 }),
];

export const Z1_LIB_A: Chunk = {
  id: 'z1-lib-a',
  zone: Z1,
  difficulty: 1,
  verbs: VERBS,
  entry: 'R',
  exit: 'C',
  entryAnchorId: anchorIdOf('la-p1'),
  exitAnchorId: anchorIdOf('la-p3'),
  airBudget: 1,
  targetTimeS: 11,
  tags: ['alga', 'calma'],
  role: 'playable',
  entities: [...a.flat(), airPocket('la-air', 90, 78), pearl('la-pearl', 20, 168)],
};

/**
 * z1-lib-b (difficulty 3) — the Tortuga Paseante carries the middle landing 60 px sideways while you
 * aim. Her shell is 76 px wide and the rest point is at its centre, so the walk never leaves the anchor
 * hanging in open water (§11.2).
 */
const b: Array<[Ceiling, Anchor]> = [
  perch({ id: 'lb-p1', x: 3, y: 18, w: 36, anchorX: 30 }),
  turtle('lb-p2', 70, 108),
  perch({ id: 'lb-p3', x: 1, y: 188, w: 40, anchorX: 32, material: 'coral' }),
];

export const Z1_LIB_B: Chunk = {
  id: 'z1-lib-b',
  zone: Z1,
  difficulty: 3,
  verbs: VERBS,
  entry: 'L',
  exit: 'L',
  entryAnchorId: anchorIdOf('lb-p1'),
  exitAnchorId: anchorIdOf('lb-p3'),
  airBudget: 1,
  targetTimeS: 11,
  tags: ['tortuga', 'movil'],
  role: 'playable',
  entities: [
    ...b.flat(),
    sideRock('lb-rock', 0, 60, 8, 36),
    airPocket('lb-air', 86, 168),
    pearl('lb-pearl-1', 30, 84),
    pearl('lb-pearl-2', 156, 200),
  ],
};

/**
 * z1-lib-c (difficulty 2) — four steps, and the second appearance of the Medusa Farolillo. §11.5.5 gives
 * her this chunk to herself, so there is no alga and no tortuga here: just the jellyfish, parked on the
 * line of the second hop at the depth of its landing.
 */
const c: Array<[Ceiling, Anchor]> = [
  perch({ id: 'lc-p1', x: 3, y: 18, w: 36, anchorX: 30 }),
  perch({ id: 'lc-p2', x: 141, y: 78, w: 36, anchorX: 150, material: 'coral' }),
  perch({ id: 'lc-p3', x: 5, y: 133, w: 40, anchorX: 36 }),
  perch({ id: 'lc-p4', x: 101, y: 188, w: 48, anchorX: 110 }),
];

export const Z1_LIB_C: Chunk = {
  id: 'z1-lib-c',
  zone: Z1,
  difficulty: 2,
  verbs: VERBS,
  entry: 'L',
  exit: 'C',
  entryAnchorId: anchorIdOf('lc-p1'),
  exitAnchorId: anchorIdOf('lc-p4'),
  airBudget: 2,
  targetTimeS: 10,
  tags: ['medusa', 'zigzag'],
  role: 'playable',
  entities: [
    ...c.flat(),
    jellyfish('lc-medusa', 95, 78, 40),
    airPocket('lc-air-1', 96, 118),
    airPocket('lc-air-2', 62, 218),
    pearl('lc-pearl', 168, 160),
  ],
};

/**
 * z1-lib-d (difficulty 4) — the long-hop chunk: two 80–90 px drops with an Alga Cinta as the middle
 * landing, which absorbs 82 % of the arrival speed and leaves you no momentum to work with (§5 nº 2).
 * Second appearance of the alga, so it is alone here too.
 */
const d: Array<[Ceiling, Anchor]> = [
  perch({ id: 'ld-p1', x: 3, y: 18, w: 36, anchorX: 30 }),
  kelp('ld-p2', 141, 108, 36, 150),
  perch({ id: 'ld-p3', x: 31, y: 188, w: 48, anchorX: 70 }),
];

export const Z1_LIB_D: Chunk = {
  id: 'z1-lib-d',
  zone: Z1,
  difficulty: 4,
  verbs: VERBS,
  entry: 'L',
  exit: 'C',
  entryAnchorId: anchorIdOf('ld-p1'),
  exitAnchorId: anchorIdOf('ld-p3'),
  airBudget: 1,
  targetTimeS: 12,
  tags: ['alga', 'salto-largo'],
  role: 'playable',
  entities: [
    ...d.flat(),
    sideRock('ld-rock', 172, 150, 8, 40),
    airPocket('ld-air', 92, 152),
    pearl('ld-pearl', 20, 130),
  ],
};

/**
 * z1-lib-e (difficulty 3) — the second Tortuga Paseante, this time as the MIDDLE landing of a
 * right-to-left descent: you arrive on a shell that is already walking away from where you aimed.
 * The exit is a fixed ledge on purpose — a respawn point (§2.4.2) that moves is not a point.
 */
const e: Array<[Ceiling, Anchor]> = [
  perch({ id: 'le-p1', x: 141, y: 18, w: 36, anchorX: 150, material: 'coral' }),
  turtle('le-p2', 30, 108),
  perch({ id: 'le-p3', x: 101, y: 188, w: 48, anchorX: 110 }),
];

export const Z1_LIB_E: Chunk = {
  id: 'z1-lib-e',
  zone: Z1,
  difficulty: 3,
  verbs: VERBS,
  entry: 'R',
  exit: 'C',
  entryAnchorId: anchorIdOf('le-p1'),
  exitAnchorId: anchorIdOf('le-p3'),
  airBudget: 1,
  targetTimeS: 11,
  tags: ['tortuga', 'movil'],
  role: 'playable',
  entities: [...e.flat(), airPocket('le-air', 150, 74), pearl('le-pearl', 168, 148)],
};

/**
 * z1-lib-f (difficulty 5) — the hardest line of the zone and the first chunk allowed to mix creatures
 * (§11.5.5: every one of them is past its second appearance by now). Two Medusa Farolillo, each on the
 * line of one hop, and a narrow Alga Cinta as the only landing in between.
 */
const f: Array<[Ceiling, Anchor]> = [
  perch({ id: 'lf-p1', x: 9, y: 18, w: 30, anchorX: 30 }),
  kelp('lf-p2', 141, 108, 36, 150),
  perch({ id: 'lf-p3', x: 31, y: 188, w: 48, anchorX: 70 }),
];

export const Z1_LIB_F: Chunk = {
  id: 'z1-lib-f',
  zone: Z1,
  difficulty: 5,
  verbs: VERBS,
  entry: 'L',
  exit: 'C',
  entryAnchorId: anchorIdOf('lf-p1'),
  exitAnchorId: anchorIdOf('lf-p3'),
  airBudget: 1,
  targetTimeS: 12,
  tags: ['medusa', 'preciso'],
  role: 'playable',
  entities: [
    ...f.flat(),
    jellyfish('lf-medusa-1', 95, 108, 40),
    jellyfish('lf-medusa-2', 86, 150, 40),
    sideRock('lf-rock', 0, 96, 8, 32),
    airPocket('lf-air', 110, 78),
    pearl('lf-pearl-1', 168, 60),
    pearl('lf-pearl-2', 24, 214),
  ],
};
