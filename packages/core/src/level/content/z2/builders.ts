/**
 * Zone 2's binding of the shared authoring vocabulary (`level/content/builders.ts`), plus the three
 * numbers every "Borde de arrecife" chunk is authored against.
 *
 * The zone's verb is **"leer y usar las corrientes"** (§3.2), so its geometry is not a zigzag with a
 * hazard bolted on: a current band is placed BETWEEN two anchors and the landing is moved downstream
 * of the straight line, so the drift is the thing that gets you there. `CURRENT_TRAVEL_PX` is what
 * that costs, and the reach rule (§11.5.11) certifies every one of those hops with the real integrator.
 */
import { zoneRadius } from '../../../control/charge';
import { DEFAULT_TUNING } from '../../../tuning';
import { LEDGE_H, kelpIn, perchIn, pulpoLedge, zoneRestY } from '../builders';
import type { PerchSpec } from '../builders';
import type { Anchor, Ceiling, ZoneIndex } from '../../../types';

const T = DEFAULT_TUNING;

/** Zone 2, "Borde de arrecife", 200–600 m, world px 2 880–7 200 (§3.2, §11.1). */
export const Z2: ZoneIndex = 1;

/** Bur's radius in Z2 (§2.6): `RADIUS_BASE * ZONE_RADIUS_PCT[1]` = 7 · 0,92 = 6,44 px. */
export const Z2_RADIUS = zoneRadius(Z2, T);

/** Vertical gap the reach rule allows between two consecutive anchors in this zone (§11.5.11). */
export const Z2_MAX_HOP = T.MAX_HOP_PX[Z2] ?? 195;

export {
  ANEMONA_H,
  ANEMONA_W,
  CURRENT_ACCEL,
  CURRENT_DRIFT,
  ERIZO_H,
  ERIZO_W,
  LEDGE_H,
  PULPO_REST_MS,
  airPocket,
  anchorIdOf,
  anemona,
  currentBand,
  erizo,
  laneOf,
  pearl,
  reefRock,
  shell,
  sideRock,
} from '../builders';
export type { PerchSpec } from '../builders';

/** Where Bur's centre sits when resting under a Z2 ledge whose top is at `y` and thickness `h` (§2.3). */
export function z2RestY(y: number, h: number = LEDGE_H): number {
  return zoneRestY(Z2, y, h);
}

/** A capturable Z2 ledge plus the `Anchor` that declares the rest point under it (§11.2). */
export function z2Perch(spec: PerchSpec): [Ceiling, Anchor] {
  return perchIn(Z2, spec);
}

/** Catalogue nº 2, **Alga Cinta** (§5, "Z1–Z2"), at Z2's rest height. */
export function z2Kelp(id: string, x: number, y: number, w: number, anchorX: number): [Ceiling, Anchor] {
  return kelpIn(Z2, id, x, y, w, anchorX);
}

/** Catalogue nº 9, **Pulpo Camuflado** (§5), at Z2's rest height. */
export function z2Pulpo(id: string, x: number, y: number, w: number, anchorX: number): [Ceiling, Anchor] {
  return pulpoLedge(Z2, id, x, y, w, anchorX);
}

/**
 * Standard authoring heights of a Z2 chunk. Every chunk enters on a ledge whose top is at
 * `ENTRY_LEDGE_Y` and leaves on one at `EXIT_LEDGE_Y`, which makes every seam between chunks exactly
 * 70 px: `(240 − (188 + 16,44)) + (18 + 16,44)`. Well inside `Z2_MAX_HOP`, and identical to the seam
 * Zone 1 already ships, so the two zones join without a special case (§11.5.11 applies to the Z1 → Z2
 * junction like to any other).
 */
export const ENTRY_LEDGE_Y = 18;
export const EXIT_LEDGE_Y = 188;
