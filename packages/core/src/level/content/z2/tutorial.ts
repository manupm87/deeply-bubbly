/**
 * z2-tut-corriente — the first chunk of Zone 2 and the isolated tutorial of its verb (GDD §3.3.3,
 * §4.1: "el primer chunk de cada zona, tutorial aislado del verbo, sin ningún peligro"; §11.5.6 makes
 * it a fixed piece the assembler may never shuffle).
 *
 * The verb is **"leer y usar las corrientes"** (§3.2), and in a 540 px world it can finally be taught as
 * a requirement instead of a decoration. Two earlier versions of this chunk failed at that, and both
 * failures are the reason this one is built the way it is:
 *
 *  - The first laid a full-column band across a hop that already worked. A review measured it: the band
 *    NARROWED the aim (16 landing lines with it, 22 without) and taught nothing.
 *  - The second put the landing behind a curtain of reef and made the band the way round it. Better, but
 *    still optional: aiming as if the water were still cost you a retry, not the hop.
 *
 * This one asks the question the physics can actually answer. A band is water moving at `CURRENT_DRIFT`
 * and Bur joins it through the ordinary horizontal drag (`accelForDriftX`). So the second rest point is
 * placed out of reach — `CURRENT_RUNG_INSET` px under its own shelf — and the band is pointed at it.
 * `z2.test.ts` flies both sets with the real integrator: in still water NOTHING in the ±90° cone lands
 * there, and with the band running, shots do. The band is the hop.
 *
 * The first hop into the chunk is deliberately still water — the Zone 1 gesture, one last time, so the
 * second reads as a difference and not as noise — and the band leaves both sides of the world outside
 * it, so the choice to enter is visible from the ledge.
 *
 * It is also appearance 1 of catalogId 8 under §11.5.5: the current is the ONLY catalogue entry here.
 */
import { ENTRY_LEDGE_Y, EXIT_X_EAST, EXIT_X_WEST, MID_Y, airPocket, currentBand, exitRung, ladder, pearl, reefIn, rung } from './builders';
import { Z2_VERBS, currentRung } from './pieces';
import type { Chunk } from '../../../types';

/** The band: it covers the whole of the second hop and stops short of both edges of the world. */
export const TUT_BAND = { x: 110, y: 30, w: 260, h: 130 } as const;

const tut = ladder(
  't1',
  [rung(320, ENTRY_LEDGE_Y), currentRung(210, MID_Y), exitRung(EXIT_X_EAST)],
  EXIT_X_WEST,
);

export const Z2_TUTORIAL: Chunk = {
  id: 'z2-tut-corriente',
  zone: 1,
  difficulty: 1,
  verbs: Z2_VERBS,
  entryAnchorId: tut.entryAnchorId,
  exitAnchorId: tut.exitAnchorId,
  airBudget: 1,
  targetTimeS: 8,
  tags: ['tutorial', 'corriente'],
  role: 'tutorial',
  entities: [
    ...tut.entities,
    ...reefIn('t1', { left: [40, 180], right: [0, 60] }),
    currentBand('t1-corriente', TUT_BAND.x, TUT_BAND.y, TUT_BAND.w, TUT_BAND.h, -1),
    airPocket('t1-air', 280, 60),
    pearl('t1-pearl', 90, 130),
    // A pearl just past the exit is the cheapest lateral detour there is.
    pearl('t1-pearl-2', EXIT_X_EAST + 150, 196),
  ],
};
