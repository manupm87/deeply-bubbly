/**
 * The standard rungs of a Zone 2 chunk, and the one authoring law that produced them.
 *
 * **A hop always crosses the column.** Bur rests UNDER a ceiling (§2.3), so a landing is a shot that
 * dips past the side of the target ledge and floats back up into its underside. A rung placed directly
 * below the one above it is therefore not a landing at all: Bur meets its TOP face on the way down and
 * bounces. Every ladder here — and every seam between two chunks — alternates LEFT and RIGHT for that
 * reason, which is also why Zone 1's hand-authored ladders all zigzag. `sideOf` names the rule so a
 * test can check it instead of a reviewer having to.
 *
 * The other two constants are structural:
 *
 *  - **The seams.** §11.5.11 applies to the junction between chunks with entry velocity zero. Fixing
 *    the entry ledge at y = 18 and the exit ledge at y = 188 makes EVERY seam of the zone exactly 70 px,
 *    including the Z1 → Z2 one, so no chunk can be legal on its own and illegal in a sequence.
 *  - **The lanes.** §11.5.1 wants a 64 px mouth centred on the declared lane; putting the lane
 *    positions in one place is what keeps a chunk from declaring a lane its anchor is not in.
 *
 * Only the MIDDLE of a chunk is authored freely — which is where its idea lives.
 */
import { ENTRY_LEDGE_Y, EXIT_LEDGE_Y, z2Perch } from './builders';
import type { PerchSpec } from './builders';
import type { Anchor, Ceiling, WorldEntity } from '../../../types';

export { Z2, Z2_MAX_HOP, Z2_RADIUS } from './builders';

/**
 * Verbs of Zone 2 (§4.2: "la dificultad entre zonas sube por verbos acumulados"). Z1's three plus the
 * one the zone is named for (§3.2: "leer y usar las corrientes").
 */
export const Z2_VERBS: string[] = ['cargar', 'soltar', 'reposar', 'corriente'];

/** Geometry of a ledge, without its id: the shape of a rung. */
export type Rung = Omit<PerchSpec, 'id'>;

/** Which half of the 180 px column an anchor hangs in. Consecutive anchors must never share one. */
export type Side = 'left' | 'right';

export const sideOf = (anchorX: number): Side => (anchorX < 90 ? 'left' : 'right');

/**
 * The INNER lip of a rung: the edge the arc dips past on its way to the underside (§2.3). A landing is a
 * shot that falls just outside this edge and floats back up under the ledge, so the lip is the only spot
 * on a ledge from which a hazard can meet a line that would otherwise have worked. Anywhere else on the
 * top face and the urchin is met only by shots that had already failed — which is exactly what a review
 * measured of the first version of this zone: 0 of ~900 certified landing lines touched a hazard box.
 *
 * A crown grown on the lip therefore overhangs it by half its width, into the dip corridor. That is the
 * whole threat: cut the corner and you pay, leave a body's width and you never touch it.
 */
export const lipOf = (rung: Rung): number => (sideOf(rung.anchorX) === 'right' ? rung.x : rung.x + rung.w);

// --- entry rungs (y = 18) ----------------------------------------------------------------------
/** Entry from a chunk that exited on the RIGHT half. */
export const ENTRY_L: Rung = { x: 3, y: ENTRY_LEDGE_Y, w: 36, anchorX: 30 };
/** Entry from a chunk that exited on the LEFT half. */
export const ENTRY_R: Rung = { x: 141, y: ENTRY_LEDGE_Y, w: 36, anchorX: 150, material: 'coral' };
/** Lane C, right half: the wide shelf reached from an `EXIT_L`. */
export const ENTRY_C_FROM_L: Rung = { x: 91, y: ENTRY_LEDGE_Y, w: 88, anchorX: 100, material: 'coral' };
/** Lane C, left half: the mirror, reached from an `EXIT_R`. */
export const ENTRY_C_FROM_R: Rung = { x: 1, y: ENTRY_LEDGE_Y, w: 88, anchorX: 80 };

// --- exit rungs (y = 188) ----------------------------------------------------------------------
/** Lane L. The next chunk enters on lane C, right half. */
export const EXIT_L: Rung = { x: 1, y: EXIT_LEDGE_Y, w: 40, anchorX: 32, material: 'coral' };
/** Lane R. The next chunk enters on lane C, left half. */
export const EXIT_R: Rung = { x: 139, y: EXIT_LEDGE_Y, w: 40, anchorX: 148, material: 'coral' };
/** Lane C, right half. The next chunk enters on lane L. */
export const EXIT_C_TO_L: Rung = { x: 101, y: EXIT_LEDGE_Y, w: 48, anchorX: 110 };
/** Lane C, left half. The next chunk enters on lane R. */
export const EXIT_C_TO_R: Rung = { x: 31, y: EXIT_LEDGE_Y, w: 48, anchorX: 70 };

// --- middle rungs, at whatever depth the chunk's idea needs ------------------------------------
export const midLeft = (y: number, w = 36): Rung => ({ x: 3, y, w, anchorX: 30 });
export const midRight = (y: number, w = 36): Rung => ({ x: 141, y, w, anchorX: 150, material: 'coral' });

/**
 * **Guarded rungs.** A wider shelf whose rest point sits at the BACK of it, leaving its mouth free for a
 * crown grown on the lip (`builders.CrownGrowth`). The two go together: a 36 px rung has no room between
 * its lip and Bur's body, so a crown there would catch a perfect landing, and a crown anywhere else on a
 * ledge is never met by a line that would have worked. 48 px of shelf is what buys both — the mouth is
 * contested, the back of the shelf is clean.
 */
export const guardedLeft = (y: number, w = 48): Rung => ({ x: 3, y, w, anchorX: 18 });
export const guardedRight = (y: number, w = 48): Rung => ({ x: 180 - 3 - w, y, w, anchorX: 162, material: 'coral' });

/** The guarded exit rung of lane R: the same shelf, at the depth every chunk leaves from. */
export const GUARDED_EXIT_R: Rung = { x: 131, y: EXIT_LEDGE_Y, w: 48, anchorX: 164, material: 'coral' };

/** The ceiling + anchor pair of a rung, ready to spread into a chunk's `entities`. */
export function ledgePair(id: string, rung: Rung): WorldEntity[] {
  const [ceiling, anchor]: [Ceiling, Anchor] = z2Perch({ id, ...rung });
  return [ceiling, anchor];
}
