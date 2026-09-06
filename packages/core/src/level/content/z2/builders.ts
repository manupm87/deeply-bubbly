/**
 * Zone 2's binding of the shared authoring vocabulary (`level/content/builders.ts`, `../ladder.ts`).
 * The only thing a zone changes is Bur's radius (§2.6) and therefore the height of every rest pose, so
 * this file fixes that one parameter and re-exports the vocabulary under Zone 2's names.
 *
 * The zone's verb is **"leer y usar las corrientes"** (§3.2), so its geometry is not a zigzag with a
 * hazard bolted on: a `corriente` is placed ACROSS a hop and pointed at the landing, and the reach rule
 * (§11.5.11) certifies every one of those hops with the current sampled, exactly as the player flies it.
 */
import { zoneRadius } from '../../../control/charge';
import { DEFAULT_TUNING } from '../../../tuning';
import { LEDGE_H, perchIn, pulpoLedge, reefRock, zoneRestY } from '../builders';
import { ladderIn, rungIn, sideStructures } from '../ladder';
import type { PerchSpec } from '../builders';
import type { Ladder, Rung, RungSpec, SideStructures } from '../ladder';
import type { Anchor, Ceiling, Wall, ZoneIndex } from '../../../types';

const T = DEFAULT_TUNING;

/** Zone 2, "Borde de arrecife", 200–600 m, world px 2 880–7 200 (§3.2, §11.1). */
export const Z2: ZoneIndex = 1;

/** Bur's radius in Z2 (§2.6): `RADIUS_BASE * ZONE_RADIUS_PCT[1]` = 7 · 0,92 = 6,44 px. */
export const Z2_RADIUS = zoneRadius(Z2, T);

/** Vertical gap the reach rule allows between two consecutive anchors in this zone (§11.5.11, D4). */
export const Z2_MAX_HOP = T.MAX_HOP_PX[Z2] ?? 105;

/** Lateral gap the reach rule allows between two consecutive anchors in this zone (D4). */
export const Z2_MAX_HOP_X = T.MAX_HOP_X_PX[Z2] ?? 190;

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
  pearl,
  reefRock,
  shell,
  sideRock,
} from '../builders';
export {
  ENTRY_X_LEFT,
  ENTRY_X_RIGHT,
  EXIT_X,
  LEDGE_INSET,
  RUNG_Y_4,
  RUNG_Y_5,
  RUNG_Y_STATION,
  SIDE_BAND_L,
  SIDE_BAND_R,
  exitRung,
  rung,
} from '../ladder';
export type { PerchSpec } from '../builders';
export type { Ladder, Rung, RungSpec, SideStructures } from '../ladder';

/** Where Bur's centre sits when resting under a Z2 ledge whose top is at `y` and thickness `h` (§2.3). */
export function z2RestY(y: number, h: number = LEDGE_H): number {
  return zoneRestY(Z2, y, h);
}

/** A capturable Z2 ledge plus the `Anchor` that declares the rest point under it (§11.2). */
export function z2Perch(spec: PerchSpec): [Ceiling, Anchor] {
  return perchIn(Z2, spec);
}

/** Catalogue nº 9, **Pulpo Camuflado** (§5), as a standalone ledge (fixtures). */
export function z2Pulpo(id: string, x: number, y: number, w: number, anchorX: number): [Ceiling, Anchor] {
  return pulpoLedge(Z2, id, x, y, w, anchorX);
}

/** A whole Z2 chunk ladder: 3–5 rest points, each one a single shot from the one above (§11.5.11). */
export function ladder(prefix: string, specs: readonly RungSpec[]): Ladder {
  return ladderIn(Z2, prefix, specs);
}

/** One rung on its own, for the fixtures that place a ledge outside the ladder. */
export function z2Rung(id: string, spec: RungSpec, fromX: number): Rung {
  return rungIn(Z2, id, spec, fromX);
}

/** The reef of Zone 2 (§3.2, D3): the same side slabs as Zone 1, wearing the zone's own material. */
export function reefIn(prefix: string, spec: SideStructures): Wall[] {
  return sideStructures(prefix, spec, reefRock);
}
