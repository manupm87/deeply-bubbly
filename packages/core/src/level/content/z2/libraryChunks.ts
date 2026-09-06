/**
 * The fourteen playable library chunks of Zone 2, "Borde de arrecife" (GDD §3.2, §12.1). With the verb
 * tutorial they are the fifteen playable chunks of the zone's three immersions.
 *
 * **The verb first.** Every chunk that carries a `corriente` (§5 nº 8) puts the band BETWEEN two
 * anchors and points it AT the landing, so the band is never decoration: it is half of the shot. The
 * reach rule certifies those hops with the current sampled (`validator.flyProbe` flies through the
 * fields), so a line that only exists in still water can never ship. And no band spans the column any
 * more: a review measured the first version and found the full-width bands NARROWED the aim instead of
 * offering anything, because there was no water outside them to choose. Every band now leaves a line
 * around it, which is what makes entering one a decision. `tutorial.ts` documents what a band can and
 * cannot physically do over one hop.
 *
 * **Didactic isolation (§4.2.1, §11.5.5).** The first two appearances of each of the zone's four
 * catalogue entries come alone in their chunk, in campaign order:
 *   nº 8 Corriente  → `z2-tut-corriente`, `z2-lib-a`
 *   nº 6 Erizo      → `z2-lib-b`, `z2-lib-c`
 *   nº 7 Anémona    → `z2-lib-e`, `z2-lib-f`
 *   nº 9 Pulpo      → `z2-lib-h`, `z2-lib-i`
 * Everything from the third appearance on is free to mix, which is what the back half of the zone does.
 *
 * **Where a hazard lives**, and the rule a review had to teach this file. Bur lands by dipping past the
 * INNER lip of a ledge and floating up under it (§2.3): a successful arc never crosses a ledge's top
 * face. So a crown on the SHOULDER of a ledge is only ever met by a shot that had already failed — of
 * ~900 certified landing lines in the first version of this zone, exactly 0 touched a hazard — and the
 * zone played as Zone 1 with decorations. Both seats are used now, and they mean different things:
 *
 *   `'shoulder'`  punishes the OVERSHOOT: the shot that sails over the shelf pays. Introductions and the
 *                 gentler chunks use it.
 *   `'lip'`       hangs under the shelf's mouth, in the dip corridor, and contests the LANDING itself:
 *                 cut the corner and you pay, leave a body's width and you never touch it. It rides a
 *                 `guardedLeft`/`guardedRight` rung, whose 48 px keep the rest point clear at the back.
 *
 * A trap may only ever grow on a lip, and that is a rule, not a taste: the escape §2.4.5 sells is a
 * DOWNWARD launch, so an anemone with rock underneath hands Bur straight back to itself until the bar is
 * empty. `validator.trapEscapes` flies the escape and refuses the chunk otherwise.
 *
 * The octopus is the opposite trick — he IS the rung, and only his half-second of patience gives him away.
 */
import {
  ENTRY_C_FROM_L,
  ENTRY_C_FROM_R,
  ENTRY_L,
  ENTRY_R,
  EXIT_C_TO_L,
  EXIT_C_TO_R,
  EXIT_L,
  EXIT_R,
  Z2,
  Z2_VERBS,
  GUARDED_EXIT_R,
  guardedLeft,
  guardedRight,
  ledgePair,
  lipOf,
  midLeft,
  midRight,
} from './pieces';
import { airPocket, anchorIdOf, anemona, currentBand, erizo, pearl, shell, z2Pulpo } from './builders';
import type { Chunk, WorldEntity } from '../../../types';

/** A Pulpo Camuflado rung (§5 nº 9), spread into a chunk's entities like any other ledge. */
function pulpoPair(id: string, x: number, y: number, w: number, anchorX: number): WorldEntity[] {
  const [ceiling, anchor] = z2Pulpo(id, x, y, w, anchorX);
  return [ceiling, anchor];
}

// ---------------------------------------------------------------------------------------------
// Immersion 1 of the zone: the current, then the urchin
// ---------------------------------------------------------------------------------------------

/**
 * z2-lib-a (difficulty 1) — appearance 2 of the Corriente, still alone. The band covers the LEFT two
 * thirds of the first hop and points left, which is exactly where the landing is: ride it and the shot
 * only has to fall. The right third is still water, so the choice to enter is visible from the ledge.
 */
export const Z2_LIB_A: Chunk = {
  id: 'z2-lib-a',
  zone: Z2,
  difficulty: 1,
  verbs: Z2_VERBS,
  entry: 'R',
  exit: 'C',
  entryAnchorId: anchorIdOf('la-p1'),
  exitAnchorId: anchorIdOf('la-p3'),
  airBudget: 2,
  targetTimeS: 10,
  tags: ['corriente', 'calma'],
  role: 'playable',
  entities: [
    ...ledgePair('la-p1', ENTRY_R),
    ...ledgePair('la-p2', midLeft(108)),
    ...ledgePair('la-p3', EXIT_C_TO_L),
    currentBand('la-corriente', 0, 52, 120, 38, -1),
    airPocket('la-air-1', 96, 100),
    airPocket('la-air-2', 60, 160),
    pearl('la-pearl', 110, 44),
    shell('la-concha', 168, 168),
  ],
};

/**
 * z2-lib-b (difficulty 2) — the **Erizo Coralino** (§5 nº 6), alone and static, on the shoulder of the
 * second rung. The shot that cuts the corner pays a pip; the one that arrives from below never touches
 * him. No current: §11.5.5 gives him the chunk to himself.
 */
export const Z2_LIB_B: Chunk = {
  id: 'z2-lib-b',
  zone: Z2,
  difficulty: 2,
  verbs: Z2_VERBS,
  entry: 'L',
  exit: 'R',
  entryAnchorId: anchorIdOf('lb-p1'),
  exitAnchorId: anchorIdOf('lb-p4'),
  airBudget: 1,
  targetTimeS: 10,
  tags: ['erizo', 'punteria'],
  role: 'playable',
  entities: [
    ...ledgePair('lb-p1', ENTRY_L),
    ...ledgePair('lb-p2', midRight(78)),
    ...ledgePair('lb-p3', midLeft(133)),
    ...ledgePair('lb-p4', EXIT_R),
    erizo('lb-erizo', 150, 78),
    airPocket('lb-air', 96, 116),
    pearl('lb-pearl', 96, 58),
  ],
};

/**
 * z2-lib-c (difficulty 3) — appearance 2 of the urchin, and the first one that contests a landing: he
 * hangs under the LIP of the left shelf, in the corridor the arc dips through, with the rest point at
 * the back of the 48 px shelf. Cut the corner and you pay a pip; arrive a body's width out and he is
 * never there. Still alone (§11.5.5).
 */
export const Z2_LIB_C: Chunk = {
  id: 'z2-lib-c',
  zone: Z2,
  difficulty: 3,
  verbs: Z2_VERBS,
  entry: 'C',
  exit: 'C',
  entryAnchorId: anchorIdOf('lc-p1'),
  exitAnchorId: anchorIdOf('lc-p4'),
  airBudget: 2,
  targetTimeS: 11,
  tags: ['punteria', 'repisa'],
  role: 'playable',
  entities: [
    ...ledgePair('lc-p1', ENTRY_C_FROM_R),
    ...ledgePair('lc-p2', midRight(78)),
    ...ledgePair('lc-p3', guardedLeft(133)),
    ...ledgePair('lc-p4', EXIT_C_TO_L),
    erizo('lc-erizo', lipOf(guardedLeft(133)), 133, 'lip'),
    airPocket('lc-air-1', 96, 58),
    airPocket('lc-air-2', 96, 168),
    pearl('lc-pearl', 110, 116),
    shell('lc-concha', 60, 216),
  ],
};

/**
 * z2-lib-d (difficulty 3) — the first chunk allowed to combine (§11.5.5): urchin plus current. The urchin
 * guards the mouth of the right-hand shelf and the band across the last hop pushes LEFT, straight at the
 * exit: the shot that reads it barely has to be aimed, the one that fights it comes back into the urchin.
 */
export const Z2_LIB_D: Chunk = {
  id: 'z2-lib-d',
  zone: Z2,
  difficulty: 3,
  verbs: Z2_VERBS,
  entry: 'L',
  exit: 'L',
  entryAnchorId: anchorIdOf('ld-p1'),
  exitAnchorId: anchorIdOf('ld-p3'),
  airBudget: 1,
  targetTimeS: 11,
  tags: ['corriente', 'erizo'],
  role: 'playable',
  entities: [
    ...ledgePair('ld-p1', ENTRY_L),
    ...ledgePair('ld-p2', guardedRight(103)),
    ...ledgePair('ld-p3', EXIT_L),
    erizo('ld-erizo', lipOf(guardedRight(103)), 103, 'lip'),
    currentBand('ld-corriente', 40, 140, 140, 36, -1),
    airPocket('ld-air', 96, 70),
    pearl('ld-pearl', 110, 180),
    shell('ld-concha', 96, 220),
  ],
};

// ---------------------------------------------------------------------------------------------
// Immersion 2 of the zone: the anemone, then the octopus
// ---------------------------------------------------------------------------------------------

/**
 * z2-lib-e (difficulty 2) — the **Anémona Pegajosa** (§5 nº 7), alone. She holds Bur for 0,8 s and vents a
 * pip at 1,5 s unless a 60 % charge buys the way out, so she is introduced where she will actually catch
 * someone: under the lip of an easy shelf, with the whole column open below her. The lesson is the
 * escape, and the escape is a plain downward launch into free water.
 */
export const Z2_LIB_E: Chunk = {
  id: 'z2-lib-e',
  zone: Z2,
  difficulty: 2,
  verbs: Z2_VERBS,
  entry: 'L',
  exit: 'C',
  entryAnchorId: anchorIdOf('le-p1'),
  exitAnchorId: anchorIdOf('le-p3'),
  airBudget: 1,
  targetTimeS: 10,
  tags: ['anemona', 'trampa'],
  role: 'playable',
  entities: [
    ...ledgePair('le-p1', ENTRY_L),
    ...ledgePair('le-p2', guardedRight(108)),
    ...ledgePair('le-p3', EXIT_C_TO_R),
    anemona('le-anemona', lipOf(guardedRight(108)), 108, 'lip'),
    airPocket('le-air', 96, 74),
    pearl('le-pearl', 96, 160),
    shell('le-concha', 120, 216),
  ],
};

/**
 * z2-lib-f (difficulty 3) — appearance 2 of the anemone, under the lip of the first turn of a four-rung
 * descent, where the line is fastest and the 1,5 s window is the whole chunk.
 */
export const Z2_LIB_F: Chunk = {
  id: 'z2-lib-f',
  zone: Z2,
  difficulty: 3,
  verbs: Z2_VERBS,
  entry: 'R',
  exit: 'L',
  entryAnchorId: anchorIdOf('lf-p1'),
  exitAnchorId: anchorIdOf('lf-p4'),
  airBudget: 2,
  targetTimeS: 11,
  tags: ['anemona', 'ritmo'],
  role: 'playable',
  entities: [
    ...ledgePair('lf-p1', ENTRY_R),
    ...ledgePair('lf-p2', guardedLeft(78)),
    ...ledgePair('lf-p3', midRight(133)),
    ...ledgePair('lf-p4', EXIT_L),
    anemona('lf-anemona', lipOf(guardedLeft(78)), 78, 'lip'),
    airPocket('lf-air-1', 96, 58),
    airPocket('lf-air-2', 96, 168),
    pearl('lf-pearl', 96, 116),
  ],
};

/**
 * z2-lib-g (difficulty 4) — the first three-way combination: both shelves guarded, urchin on the left and
 * anemone on the right, and a leftward band across the last hop. Two of the three are answered by aim;
 * the third is answered by reading the water.
 */
export const Z2_LIB_G: Chunk = {
  id: 'z2-lib-g',
  zone: Z2,
  difficulty: 4,
  verbs: Z2_VERBS,
  entry: 'C',
  exit: 'C',
  entryAnchorId: anchorIdOf('lg-p1'),
  exitAnchorId: anchorIdOf('lg-p4'),
  airBudget: 1,
  targetTimeS: 11,
  tags: ['corriente', 'erizo'],
  role: 'playable',
  entities: [
    ...ledgePair('lg-p1', ENTRY_C_FROM_L),
    ...ledgePair('lg-p2', guardedLeft(78)),
    ...ledgePair('lg-p3', guardedRight(133)),
    ...ledgePair('lg-p4', EXIT_C_TO_R),
    erizo('lg-erizo', lipOf(guardedLeft(78)), 78, 'lip'),
    anemona('lg-anemona', lipOf(guardedRight(133)), 133, 'lip'),
    currentBand('lg-corriente', 30, 160, 150, 26, -1),
    airPocket('lg-air', 96, 58),
    pearl('lg-pearl', 96, 116),
    shell('lg-concha', 110, 216),
  ],
};

/**
 * z2-lib-h (difficulty 3) — the **Pulpo Camuflado** (§5 nº 9), alone. He is the middle rung and he
 * looks exactly like one: wide, capturable, rock restitution. At 0,5 s of rest he tips Bur off downward
 * ("te desplaza suave"), so the lesson is that a landing in Zone 2 is a moment, not a chair.
 */
export const Z2_LIB_H: Chunk = {
  id: 'z2-lib-h',
  zone: Z2,
  difficulty: 3,
  verbs: Z2_VERBS,
  entry: 'R',
  exit: 'C',
  entryAnchorId: anchorIdOf('lh-p1'),
  exitAnchorId: anchorIdOf('lh-p3'),
  airBudget: 2,
  targetTimeS: 11,
  tags: ['pulpo', 'emboscada'],
  role: 'playable',
  entities: [
    ...ledgePair('lh-p1', ENTRY_R),
    ...pulpoPair('lh-p2', 3, 108, 36, 30),
    ...ledgePair('lh-p3', EXIT_C_TO_L),
    airPocket('lh-air-1', 96, 74),
    airPocket('lh-air-2', 60, 160),
    pearl('lh-pearl', 160, 100),
  ],
};

/**
 * z2-lib-i (difficulty 4) — appearance 2 of the octopus, now as the ONLY rung between two long hops.
 * Half a second to arrive, aim and leave, with no second ledge to fall back on.
 */
export const Z2_LIB_I: Chunk = {
  id: 'z2-lib-i',
  zone: Z2,
  difficulty: 4,
  verbs: Z2_VERBS,
  entry: 'L',
  exit: 'L',
  entryAnchorId: anchorIdOf('li-p1'),
  exitAnchorId: anchorIdOf('li-p3'),
  airBudget: 1,
  targetTimeS: 11,
  tags: ['pulpo', 'repisa'],
  role: 'playable',
  entities: [
    ...ledgePair('li-p1', ENTRY_L),
    ...pulpoPair('li-p2', 141, 103, 36, 150),
    ...ledgePair('li-p3', EXIT_L),
    airPocket('li-air', 96, 70),
    pearl('li-pearl', 96, 170),
    shell('li-concha', 110, 216),
  ],
};

// ---------------------------------------------------------------------------------------------
// Immersion 3 of the zone: everything at once
// ---------------------------------------------------------------------------------------------

/** z2-lib-j (difficulty 3) — octopus plus a leftward band across the hop that leaves him. */
export const Z2_LIB_J: Chunk = {
  id: 'z2-lib-j',
  zone: Z2,
  difficulty: 3,
  verbs: Z2_VERBS,
  entry: 'L',
  exit: 'C',
  entryAnchorId: anchorIdOf('lj-p1'),
  exitAnchorId: anchorIdOf('lj-p3'),
  airBudget: 2,
  targetTimeS: 11,
  tags: ['corriente', 'pulpo'],
  role: 'playable',
  entities: [
    ...ledgePair('lj-p1', ENTRY_L),
    ...pulpoPair('lj-p2', 141, 98, 36, 150),
    ...ledgePair('lj-p3', EXIT_C_TO_R),
    currentBand('lj-corriente', 0, 140, 130, 36, -1),
    airPocket('lj-air-1', 96, 66),
    airPocket('lj-air-2', 110, 180),
    pearl('lj-pearl', 20, 96),
    shell('lj-concha', 96, 116),
  ],
};

/**
 * z2-lib-k (difficulty 3) — a four-rung ladder with an urchin and an anemone on the two middle steps. One
 * contested mouth is enough at difficulty 3, so only the anemone hangs from a lip; the urchin sits on the
 * shoulder above her shelf, where he costs an overshoot and nothing else. A naive-bot sweep is what set
 * that dial: with both crowns on lips this chunk was the one place in the zone a metronome still drowned.
 */
export const Z2_LIB_K: Chunk = {
  id: 'z2-lib-k',
  zone: Z2,
  difficulty: 3,
  verbs: Z2_VERBS,
  entry: 'R',
  exit: 'L',
  entryAnchorId: anchorIdOf('lk-p1'),
  exitAnchorId: anchorIdOf('lk-p4'),
  airBudget: 1,
  targetTimeS: 11,
  tags: ['erizo', 'anemona'],
  role: 'playable',
  entities: [
    ...ledgePair('lk-p1', ENTRY_R),
    ...ledgePair('lk-p2', guardedLeft(78)),
    ...ledgePair('lk-p3', guardedRight(133)),
    ...ledgePair('lk-p4', EXIT_L),
    erizo('lk-erizo', 18, 78), // shoulder: at difficulty 3 one contested mouth per chunk is enough
    anemona('lk-anemona', lipOf(guardedRight(133)), 133, 'lip'),
    airPocket('lk-air', 96, 58),
    pearl('lk-pearl', 96, 168),
  ],
};

/** z2-lib-l (difficulty 4) — urchin on a guarded lip, octopus, and a leftward band on the last hop. */
export const Z2_LIB_L: Chunk = {
  id: 'z2-lib-l',
  zone: Z2,
  difficulty: 4,
  verbs: Z2_VERBS,
  entry: 'C',
  exit: 'C',
  entryAnchorId: anchorIdOf('ll-p1'),
  exitAnchorId: anchorIdOf('ll-p4'),
  airBudget: 2,
  targetTimeS: 11,
  tags: ['corriente', 'pulpo'],
  role: 'playable',
  entities: [
    ...ledgePair('ll-p1', ENTRY_C_FROM_L),
    ...ledgePair('ll-p2', guardedLeft(78)),
    ...pulpoPair('ll-p3', 141, 133, 36, 150),
    ...ledgePair('ll-p4', EXIT_C_TO_R),
    erizo('ll-erizo', lipOf(guardedLeft(78)), 78, 'lip'),
    currentBand('ll-corriente', 36, 160, 144, 26, -1),
    airPocket('ll-air-1', 96, 58),
    airPocket('ll-air-2', 110, 200),
    pearl('ll-pearl', 96, 116),
    shell('ll-concha', 60, 168),
  ],
};

/**
 * z2-lib-m (difficulty 3) — the breath before the last chunk of the zone (§11.5.4). Nothing but a
 * leftward band across a long first hop: the verb, on its own, one more time.
 */
export const Z2_LIB_M: Chunk = {
  id: 'z2-lib-m',
  zone: Z2,
  difficulty: 3,
  verbs: Z2_VERBS,
  entry: 'R',
  exit: 'C',
  entryAnchorId: anchorIdOf('lm-p1'),
  exitAnchorId: anchorIdOf('lm-p3'),
  airBudget: 1,
  targetTimeS: 10,
  tags: ['corriente', 'calma'],
  role: 'playable',
  entities: [
    ...ledgePair('lm-p1', ENTRY_R),
    ...ledgePair('lm-p2', midLeft(108)),
    ...ledgePair('lm-p3', EXIT_C_TO_L),
    currentBand('lm-corriente', 0, 55, 124, 40, -1),
    airPocket('lm-air', 96, 160),
    pearl('lm-pearl', 110, 44),
  ],
};

/**
 * z2-lib-n (difficulty 5) — the hardest line of the zone and the last playable chunk before its delivery
 * station: all four catalogue entries at once. Urchin on the shoulder of the right rung, the octopus as
 * the left one, an anemone under the lip of the exit shelf itself, and a RIGHTWARD band across the last
 * hop — the only band of the zone that pushes the same way the shot already has to go, so the danger is
 * overshooting into the anemone rather than falling short. The band stops short of her crown (x 60..132):
 * the current may aim you at her, but it never holds you in her. §11.5.4's breathing rule is why a
 * station follows it.
 */
export const Z2_LIB_N: Chunk = {
  id: 'z2-lib-n',
  zone: Z2,
  difficulty: 5,
  verbs: Z2_VERBS,
  entry: 'L',
  exit: 'R',
  entryAnchorId: anchorIdOf('ln-p1'),
  exitAnchorId: anchorIdOf('ln-p4'),
  airBudget: 2,
  targetTimeS: 12,
  tags: ['arrecife', 'mezcla'],
  role: 'playable',
  entities: [
    ...ledgePair('ln-p1', ENTRY_L),
    ...ledgePair('ln-p2', midRight(78)),
    ...pulpoPair('ln-p3', 3, 133, 36, 30),
    ...ledgePair('ln-p4', GUARDED_EXIT_R),
    erizo('ln-erizo', 150, 78),
    anemona('ln-anemona', lipOf(GUARDED_EXIT_R), 188, 'lip'),
    currentBand('ln-corriente', 60, 156, 72, 26, 1),
    airPocket('ln-air-1', 96, 58),
    airPocket('ln-air-2', 60, 216),
    pearl('ln-pearl-1', 96, 116),
    pearl('ln-pearl-2', 110, 44),
    shell('ln-concha', 20, 190),
  ],
};

/** Every playable library chunk of the zone, in the order the campaign uses them. */
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
