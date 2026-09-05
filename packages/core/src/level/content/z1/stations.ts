/**
 * The two rest stations of Zone 1 (GDD §3.1: the station IS the sixth chunk of its immersion; §3.3).
 * A 240 px band with no hazard at all: one wide capturable ceiling to hang from, two pearls to pick up,
 * and 4 s of quiet. The Air refill, the checkpoint, the zone capacity change and the summary screen are
 * driven by `RestStation` (built by `campaignMarkers`), not authored here.
 *
 * A single anchor serves as both entry and exit: crossing a station is a rest, not a descent. That is
 * why the shelf hangs in the MIDDLE of the band and not at its top: §11.1 places the campaign in one
 * continuous column, so the station's anchor is the last rung before the FIRST anchor of the next
 * immersion, 240 px lower down (§11.5.11 applies to that seam like any other). A shelf at y = 18 would
 * put that drop at 240 px, over MAX_HOP_PX; at y = 100 the two seams are 152 px and 158 px.
 */
import { Z1, anchorIdOf, pearl, perch } from './builders';
import type { Anchor, Ceiling, Chunk } from '../../../types';

/** Top edge of the station shelf inside its 240 px band; see the note above on why it is not at the top. */
const SHELF_Y = 100;

/** Shared shape: one wide shelf whose left edge faces the arrival lane, with the rest point just inside. */
function station(id: string, ceilingId: string, material: Ceiling['material'], tag: string): Chunk {
  const [shelf, anchor]: [Ceiling, Anchor] = perch({ id: ceilingId, x: 91, y: SHELF_Y, w: 88, anchorX: 100, material });
  return {
    id,
    zone: Z1,
    difficulty: 1,
    verbs: ['reposar'],
    entry: 'C',
    exit: 'C',
    entryAnchorId: anchorIdOf(ceilingId),
    exitAnchorId: anchorIdOf(ceilingId),
    airBudget: 0,
    targetTimeS: 6,
    tags: ['estacion', tag],
    role: 'station',
    entities: [shelf, anchor, pearl(`${ceilingId}-pearl-1`, 40, 60), pearl(`${ceilingId}-pearl-2`, 130, 160)],
  };
}

/** z1-station-1 — coral bench closing the first immersion. */
export const Z1_STATION_1: Chunk = station('z1-station-1', 'st1-shelf', 'coral', 'coral');

/** z1-station-2 — foam garden closing Zone 1; the last station of the zone is a delivery (§3.3.6). */
export const Z1_STATION_2: Chunk = station('z1-station-2', 'st2-shelf', 'foam', 'espuma');
