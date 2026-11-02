/**
 * The two rest stations of Zone 1 (GDD §3.1: the station IS the sixth chunk of its immersion; §3.3).
 * A 240 px band with no hazard at all, spanning the whole width of the world (D3: "la estación ocupa
 * todo el ancho"): one broad terrace to hang from, two pearls, and 4 s of quiet. The Air refill, the
 * checkpoint, the zone capacity change and the summary screen are driven by `RestStation` (built by
 * `campaignMarkers`), not authored here.
 *
 * **Why a station is a three-rung ladder and not a single shelf.** §11.1 places the campaign in ONE
 * continuous column, so a station's anchors are rungs of the same ladder as everything else: the last
 * chunk of the immersion drops into it and the first chunk of the next immersion is 240 px below. With
 * `MAX_HOP_PX` at 110 (D4) no single shelf can be both close enough to the chunk above and to the chunk
 * below, so the band carries an entry ledge, the terrace, and the same exit cornice every other chunk
 * uses. It always opens and closes on `EXIT_X_WEST`, so each immersion has to arrive there.
 *
 * **Why the terrace is where it is.** §2.4.2 respawns Bur in the MIDDLE of the station band, at
 * `WORLD_W / 2`, in open water: she floats up from there and must meet a capturable underside. The
 * terrace is 240 px of ceiling reaching past that point, which is the whole reason its rest point sits
 * 30 px inside its lip instead of the usual 12.
 */
import { EXIT_X_WEST, RUNG_Y_STATION, exitRung, ladder, pearl, reefIn, rung } from './builders';
import type { Ceiling, Chunk } from '../../../types';

/** Width and inset of the terrace: the ceiling the station respawn floats up into (see the header). */
export const TERRACE_W = 240;
export const TERRACE_INSET = 30;

/** Rest point on the terrace: its near edge overhangs `WORLD_W / 2` by 20 px, so the respawn meets it. */
export const TERRACE_X = 260;

/** Shared shape: an entry ledge, the terrace, and the cornice the next immersion drops from. */
function station(id: string, prefix: string, material: Ceiling['material'], tag: string): Chunk {
  const band = ladder(
    prefix,
    [
      rung(340, RUNG_Y_STATION.entry, { material }),
      rung(TERRACE_X, RUNG_Y_STATION.terrace, { w: TERRACE_W, inset: TERRACE_INSET, material }),
      rung(350, RUNG_Y_STATION.lower, { material }),
      exitRung(EXIT_X_WEST),
    ],
    EXIT_X_WEST,
  );
  return {
    id,
    zone: 0,
    difficulty: 1,
    verbs: ['reposar'],
    entryAnchorId: band.entryAnchorId,
    exitAnchorId: band.exitAnchorId,
    airBudget: 0,
    targetTimeS: 6,
    tags: ['estacion', tag],
    role: 'station',
    entities: [
      ...band.entities,
      ...reefIn(prefix, { left: [0, 240], right: [0, 240] }),
      pearl(`${prefix}-pearl-1`, 120, 60),
      pearl(`${prefix}-pearl-2`, 470, 190),
    ],
  };
}

/** z1-station-1 — coral bench closing the first immersion. */
export const Z1_STATION_1: Chunk = station('z1-station-1', 'st1', 'coral', 'coral');

/** z1-station-2 — foam garden closing Zone 1; the last station of the zone is a delivery (§3.3.6). */
export const Z1_STATION_2: Chunk = station('z1-station-2', 'st2', 'foam', 'espuma');
