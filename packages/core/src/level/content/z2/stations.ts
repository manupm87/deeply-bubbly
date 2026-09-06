/**
 * The three rest stations of Zone 2 (GDD §3.1: the station IS the sixth chunk of its immersion; §3.3).
 * A 240 px band with no hazard at all: one wide capturable shelf to hang from, two pearls, and 4 s of
 * quiet. The Air refill, the checkpoint, the zone capacity and the summary screen are driven by the
 * `RestStation` marker `campaignMarkers` derives from the campaign, never authored here — and so is
 * `isDelivery`, which is why `z2-station-3` is written exactly like the other two even though it is
 * the one that carries the zone's Postal (§3.3.6).
 *
 * The shelf hangs in the MIDDLE of the band for the reason Zone 1 documents: §11.1 places the campaign
 * in one continuous column, so the station's anchor is the last rung before the FIRST anchor of the
 * next immersion, 240 px lower down, and §11.5.11 applies to that seam like any other. At y = 100 the
 * two seams are 152 px and 158 px, both inside Z2's MAX_HOP_PX of 195.
 */
import { Z2, Z2_VERBS, sideOf } from './pieces';
import { anchorIdOf, pearl, z2Perch } from './builders';
import type { Side } from './pieces';
import type { Anchor, Ceiling, Chunk } from '../../../types';

/** Top edge of the station shelf inside its 240 px band; see the note above on why it is not at the top. */
const SHELF_Y = 100;

/**
 * The shelf hangs in the half of the column the arriving chunk did NOT exit from, for the same reason
 * every rung of the zone alternates (`pieces.ts`): Bur lands on an underside, so a shelf directly below
 * the ledge she left is a roof she bounces off, not a rest. Both halves are the same 88 px shelf on
 * lane C — 91..179 with the rest point at x = 100, or its mirror 1..89 with the rest point at x = 80.
 */
const SHELF: Readonly<Record<Side, { x: number; anchorX: number }>> = {
  right: { x: 91, anchorX: 100 },
  left: { x: 1, anchorX: 80 },
};

/** Shared shape: one wide shelf facing the arrival lane, with the rest point just inside it. */
function station(id: string, ceilingId: string, side: Side, material: Ceiling['material'], tag: string): Chunk {
  const place = SHELF[side];
  const [shelf, anchor]: [Ceiling, Anchor] = z2Perch({ id: ceilingId, x: place.x, y: SHELF_Y, w: 88, anchorX: place.anchorX, material });
  if (sideOf(place.anchorX) !== side) throw new Error(`station ${id}: shelf is not on the ${side}`);
  return {
    id,
    zone: Z2,
    difficulty: 1,
    verbs: Z2_VERBS,
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

/** z2-station-1 — a coral bench on the shoulder of the reef; `z2-lib-d` arrives from the left. */
export const Z2_STATION_1: Chunk = station('z2-station-1', 'z2st1-shelf', 'right', 'coral', 'coral');

/** z2-station-2 — a kelp terrace halfway down the zone; `z2-lib-i` arrives from the left. */
export const Z2_STATION_2: Chunk = station('z2-station-2', 'z2st2-shelf', 'right', 'kelp', 'terraza');

/**
 * z2-station-3 — the anemone garden that closes the zone. `z2-lib-n` exits on the RIGHT, so this one
 * is the mirrored shelf. `campaign.ts` derives `isDelivery` from the sequence; nothing here declares it.
 */
export const Z2_STATION_3: Chunk = station('z2-station-3', 'z2st3-shelf', 'left', 'coral', 'jardin');
