/**
 * The three rest stations of Zone 2 (GDD §3.1: the station IS the sixth chunk of its immersion; §3.3).
 * A 240 px band with no hazard at all, spanning the whole width of the world (D3: "la estación ocupa
 * todo el ancho"): one broad terrace to hang from, two pearls, and 4 s of quiet. The Air refill, the
 * checkpoint, the zone capacity and the summary screen are driven by the `RestStation` marker
 * `campaignMarkers` derives from the campaign, never authored here — and so is `isDelivery`, which is
 * why `z2-station-3` is written exactly like the other two even though it carries the zone's Postal
 * (§3.3.6).
 *
 * The shape is Zone 1's, for Zone 1's two reasons, and `z1/stations.ts` documents both: a station is a
 * three-rung ladder because no single shelf can be inside `MAX_HOP_PX` of both of its seams (D4), and
 * its terrace is 240 px of ceiling reaching past `WORLD_W / 2` because that is where §2.4.2 respawns Bur.
 */
import { EXIT_X_WEST, RUNG_Y_STATION, exitRung, ladder, pearl, reefIn, rung } from './builders';
import { Z2_VERBS } from './pieces';
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
    zone: 1,
    difficulty: 1,
    verbs: Z2_VERBS,
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

/** z2-station-1 — a coral bench on the shoulder of the reef. */
export const Z2_STATION_1: Chunk = station('z2-station-1', 'z2st1', 'coral', 'coral');

/** z2-station-2 — a kelp terrace halfway down the zone. */
export const Z2_STATION_2: Chunk = station('z2-station-2', 'z2st2', 'kelp', 'terraza');

/** z2-station-3 — the anemone garden that closes the zone; `campaign.ts` derives its `isDelivery`. */
export const Z2_STATION_3: Chunk = station('z2-station-3', 'z2st3', 'coral', 'jardin');
