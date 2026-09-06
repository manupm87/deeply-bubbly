/**
 * z2-tut-corriente — the first chunk of Zone 2 and the isolated tutorial of its verb (GDD §3.3.3,
 * §4.1: "el primer chunk de cada zona, tutorial aislado del verbo, sin ningún peligro"; §11.5.6 makes
 * it a fixed piece the assembler may never shuffle).
 *
 * The verb is **"leer y usar las corrientes"** (§3.2). The first version of this chunk laid a
 * full-column band across a hop that already worked, and a review measured the result: the band NARROWED
 * the aim (16 landing lines with it, 22 without) instead of teaching anything. This one is built the
 * other way round, from what a `corriente` physically is:
 *
 *  - A band is water moving at CURRENT_DRIFT, and Bur joins it through the same horizontal drag every
 *    other body uses (`accelForDriftX`), whose time constant is 1 / DAMPING_X ≈ 3,3 s. Over the ~1,5 s of
 *    one hop that is ~25 px of drift. A band therefore cannot be a wall, and no honest geometry can make
 *    it one: what it can do — and what §5 nº 8 sells with "cabalgarla para alargar el tiro gratis" — is
 *    change WHICH shot is the right one.
 *  - So the chunk makes that change unavoidable and legible. The second hop drops into a **chute** on
 *    the right of a curtain of reef (x 96..106, y 130..200); the landing shelf is past its foot. Every
 *    line to the shelf goes around that foot, the whole chute is current, and the shots that land in
 *    still water are NOT the shots that land here: `z2.test.ts` flies both sets and asserts they share at
 *    most one. Aim as if the water were still and you arrive on the wrong side of the shelf.
 *  - The band stops at the curtain (x 96..180), so there IS water outside it: the left half of the
 *    column is the line around it, and the reason it does not work is a rock you can see.
 *
 * The first hop is deliberately still water: the Zone 1 gesture, one last time, so the second reads as a
 * difference and not as noise.
 *
 * It is also appearance 1 of catalogId 8 under §11.5.5: the current is the ONLY catalogue entry here.
 */
import { ENTRY_L, EXIT_C_TO_R, Z2, Z2_VERBS, ledgePair, midRight } from './pieces';
import { airPocket, anchorIdOf, currentBand, pearl, reefRock } from './builders';
import type { Chunk } from '../../../types';

/** The curtain of reef the current pours around: x 96..106, from y 130 down to y 200. */
export const TUT_CURTAIN = { x: 96, y: 130, w: 10, h: 70 } as const;

export const Z2_TUTORIAL: Chunk = {
  id: 'z2-tut-corriente',
  zone: Z2,
  difficulty: 1,
  verbs: Z2_VERBS,
  entry: 'L',
  exit: 'C',
  entryAnchorId: anchorIdOf('t1-p1'),
  exitAnchorId: anchorIdOf('t1-p3'),
  airBudget: 1,
  targetTimeS: 8,
  tags: ['tutorial', 'corriente'],
  role: 'tutorial',
  entities: [
    ...ledgePair('t1-p1', ENTRY_L),
    ...ledgePair('t1-p2', midRight(98)),
    ...ledgePair('t1-p3', EXIT_C_TO_R),
    reefRock('t1-curtain', TUT_CURTAIN.x, TUT_CURTAIN.y, TUT_CURTAIN.w, TUT_CURTAIN.h),
    // The chute, and only the chute: it starts below the rest pose of `t1-p2` (114,4) so nothing pushes
    // Bur while she is still deciding, and it ends just under the curtain's foot, where the shelf is.
    currentBand('t1-corriente', TUT_CURTAIN.x, 144, 84, 62, -1),
    airPocket('t1-air', 60, 66),
    pearl('t1-pearl', 130, 168),
  ],
};
