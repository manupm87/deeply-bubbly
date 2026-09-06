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
 * **What the 540 px world changed here** (DECISIONS-v1.2 D3/D4). Every chunk now declares four or five
 * rest points instead of two or three, the hops are shorter vertically (62 px, not 90) and much longer
 * laterally (70–180 px, up to a whole screen), and the pearls sit OFF the ladder, against the reef: a
 * detour costs seconds and buys nothing but the shell count, which is the *Hungry Shark* shape D3 asks
 * for. `../ladder.ts` owns the geometry rule that makes each of those hops land.
 */
import {
  ENTRY_X_LEFT,
  ENTRY_X_RIGHT,
  RUNG_Y_4,
  RUNG_Y_5,
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

const y4 = (i: number): number => RUNG_Y_4[i] ?? 18;
const y5 = (i: number): number => RUNG_Y_5[i] ?? 18;

/** z1-lib-a (difficulty 1) — a calm four-step descent with an Alga Cinta as the second landing. */
const a = ladder('la', [
  rung(ENTRY_X_RIGHT, y4(0)),
  kelpRung(240, y4(1)),
  rung(410, y4(2), { material: 'coral' }),
  exitRung(),
]);

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
    ...reefIn('la', { left: [40, 170], right: [30, 120] }),
    airPocket('la-air-1', 320, 50),
    airPocket('la-air-2', 330, 175),
    pearl('la-pearl', 480, 60),
    shell('la-concha', 70, 120),
  ],
};

/**
 * z1-lib-b (difficulty 3) — the Tortuga Paseante carries the second landing 60 px sideways while you
 * aim. Her shell is 76 px wide and the rest point is at its centre, so the walk never leaves the anchor
 * hanging in open water (§11.2) — and her rest point is 38 px past her near edge, which is why the hop
 * that reaches her is one of the longest of the zone.
 */
const b = ladder('lb', [
  rung(ENTRY_X_LEFT, y4(0)),
  turtleRung(300, y4(1)),
  rung(430, y4(2), { material: 'coral' }),
  exitRung(),
]);

export const Z1_LIB_B: Chunk = {
  id: 'z1-lib-b',
  zone: 0,
  difficulty: 3,
  verbs: VERBS,
  entryAnchorId: b.entryAnchorId,
  exitAnchorId: b.exitAnchorId,
  airBudget: 2,
  targetTimeS: 11,
  tags: ['tortuga', 'movil'],
  role: 'playable',
  entities: [
    ...b.entities,
    ...reefIn('lb', { left: [60, 150], right: [150, 80] }),
    airPocket('lb-air-1', 240, 50),
    airPocket('lb-air-2', 200, 190),
    pearl('lb-pearl-1', 70, 60),
    pearl('lb-pearl-2', 470, 195),
  ],
};

/**
 * z1-lib-c (difficulty 2) — five rungs and the second appearance of the Medusa Farolillo. §11.5.5 gives
 * her this chunk to herself, so there is no alga and no tortuga here: just the jellyfish, parked on the
 * line of the second hop at the depth Bur rises back through.
 */
const c = ladder('lc', [
  rung(ENTRY_X_LEFT, y5(0)),
  rung(90, y5(1)),
  rung(250, y5(2), { material: 'coral' }),
  rung(ENTRY_X_RIGHT, y5(3)),
  exitRung(),
]);

export const Z1_LIB_C: Chunk = {
  id: 'z1-lib-c',
  zone: 0,
  difficulty: 2,
  verbs: VERBS,
  entryAnchorId: c.entryAnchorId,
  exitAnchorId: c.exitAnchorId,
  airBudget: 2,
  targetTimeS: 11,
  tags: ['medusa', 'zigzag'],
  role: 'playable',
  entities: [
    ...c.entities,
    ...reefIn('lc', { left: [140, 90], right: [40, 150] }),
    jellyfish('lc-medusa', 148, 100, 40),
    airPocket('lc-air-1', 330, 40),
    airPocket('lc-air-2', 190, 190),
    pearl('lc-pearl', 472, 100),
    shell('lc-concha', 60, 200),
  ],
};

/**
 * z1-lib-d (difficulty 4) — the long-drop chunk: a 100 px fall (D4 puts `MAX_HOP_PX` at 110 in Zone 1)
 * onto an Alga Cinta, which absorbs 82 % of the arrival speed and leaves nothing to work with (§5 nº 2).
 * Second appearance of the alga, so it is alone here too.
 */
const d = ladder('ld', [
  rung(ENTRY_X_RIGHT, 18),
  kelpRung(230, 118),
  rung(390, 160, { material: 'coral' }),
  exitRung(),
]);

export const Z1_LIB_D: Chunk = {
  id: 'z1-lib-d',
  zone: 0,
  difficulty: 4,
  verbs: VERBS,
  entryAnchorId: d.entryAnchorId,
  exitAnchorId: d.exitAnchorId,
  airBudget: 2,
  targetTimeS: 12,
  tags: ['alga', 'salto-largo'],
  role: 'playable',
  entities: [
    ...d.entities,
    ...reefIn('ld', { left: [30, 200], right: [60, 120] }),
    airPocket('ld-air-1', 320, 70),
    airPocket('ld-air-2', 300, 190),
    pearl('ld-pearl', 80, 90),
  ],
};

/**
 * z1-lib-e (difficulty 3) — the second Tortuga Paseante, this time in the middle of a left-to-right
 * sweep that crosses the whole world: you arrive on a shell that is already walking away from where you
 * aimed, and the next rung is 130 px further right. The exit is a fixed cornice on purpose — a respawn
 * point (§2.4.2) that moves is not a point.
 */
const e = ladder('le', [
  rung(ENTRY_X_LEFT, y4(0), { material: 'coral' }),
  turtleRung(320, y4(1)),
  rung(450, y4(2)),
  exitRung(),
]);

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
    ...reefIn('le', { left: [50, 160], right: [10, 60] }),
    airPocket('le-air-1', 230, 40),
    airPocket('le-air-2', 240, 190),
    pearl('le-pearl', 80, 130),
    shell('le-concha', 472, 130),
  ],
};

/**
 * z1-lib-f (difficulty 5) — the hardest line of the zone and the first chunk allowed to mix creatures
 * (§11.5.5: every one of them is past its second appearance by now). Two Medusa Farolillo, each on the
 * line of one hop, and an Alga Cinta as the landing in between.
 */
const f = ladder('lf', [
  rung(ENTRY_X_RIGHT, y5(0)),
  kelpRung(230, y5(1)),
  rung(360, y5(2), { material: 'coral' }),
  rung(440, y5(3)),
  exitRung(),
]);

export const Z1_LIB_F: Chunk = {
  id: 'z1-lib-f',
  zone: 0,
  difficulty: 5,
  verbs: VERBS,
  entryAnchorId: f.entryAnchorId,
  exitAnchorId: f.exitAnchorId,
  airBudget: 2,
  targetTimeS: 12,
  tags: ['medusa', 'preciso'],
  role: 'playable',
  entities: [
    ...f.entities,
    ...reefIn('lf', { left: [30, 180], right: [140, 90] }),
    jellyfish('lf-medusa-1', 308, 50, 40),
    jellyfish('lf-medusa-2', 274, 100, 40),
    airPocket('lf-air-1', 120, 60),
    airPocket('lf-air-2', 200, 190),
    pearl('lf-pearl-1', 472, 60),
    pearl('lf-pearl-2', 70, 200),
  ],
};
