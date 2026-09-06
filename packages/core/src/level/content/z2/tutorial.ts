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
 * and Bur joins it through the ordinary horizontal drag (`accelForDriftX`), whose time constant is
 * 1 / DAMPING_X ≈ 3,3 s: over one hop that is a few tens of pixels of extra reach. So the second rest
 * point is placed exactly out of reach — `CURRENT_RUNG_INSET` px under its own shelf, a 102 px drop
 * away — and the band is pointed at it. `z2.test.ts` flies both sets with the real integrator: in still
 * water NOTHING in the ±90° cone lands there, and with the band running, shots do. The band is the hop.
 *
 * The first hop into the chunk is deliberately still water — the Zone 1 gesture, one last time, so the
 * second reads as a difference and not as noise — and the band leaves the left third and the right edge
 * of the world outside it, so the choice to enter is visible from the ledge.
 *
 * It is also appearance 1 of catalogId 8 under §11.5.5: the current is the ONLY catalogue entry here.
 */
import { ENTRY_X_LEFT, EXIT_X, airPocket, currentBand, exitRung, ladder, pearl, reefIn, rung } from './builders';
import { Z2_VERBS, currentRung } from './pieces';
import type { Chunk } from '../../../types';

/** Depth of the rest point only the drift reaches, and of the two rungs that lead back out. */
const CURRENT_RUNG_Y = 120;

/** The band: it covers the whole of the second hop and stops short of both edges of the world. */
export const TUT_BAND = { x: 150, y: 30, w: 340, h: 130 } as const;

const tut = ladder('t1', [
  rung(ENTRY_X_LEFT, 18),
  currentRung(ENTRY_X_LEFT + 155, CURRENT_RUNG_Y),
  rung(420, 165),
  exitRung(),
]);

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
    currentBand('t1-corriente', TUT_BAND.x, TUT_BAND.y, TUT_BAND.w, TUT_BAND.h, 1),
    airPocket('t1-air', 260, 60),
    pearl('t1-pearl', 90, 130),
    // The exit column is the same for every chunk of the game (`../ladder.ts`), so it is also where the
    // player is looking when the chunk ends: a pearl just past it is the cheapest lateral detour there is.
    pearl('t1-pearl-2', EXIT_X + 150, 196),
  ],
};
