/**
 * Zone 1's binding of the shared authoring vocabulary (`level/content/builders.ts`). The only thing a
 * zone changes is Bur's radius (§2.6) and therefore the height of every rest pose, so this file fixes
 * that one parameter and re-exports the vocabulary under the names the Z1 chunk files already use.
 * There is no second copy of `perch`, `restY` or `laneOf` anywhere.
 */
import { zoneRadius } from '../../../control/charge';
import { DEFAULT_TUNING } from '../../../tuning';
import { LEDGE_H, kelpIn, perchIn, turtleIn, zoneRestY } from '../builders';
import type { PerchSpec } from '../builders';
import type { Anchor, Ceiling, ZoneIndex } from '../../../types';

const T = DEFAULT_TUNING;

/** Zone 1, "Superficie" (§3.2). */
export const Z1: ZoneIndex = 0;

/** Bur's radius in Z1 (§2.6): `RADIUS_BASE * ZONE_RADIUS_PCT[0]` = 7 px. Rest points hang one radius below. */
export const Z1_RADIUS = zoneRadius(Z1, T);

export {
  LEDGE_H,
  TURTLE_RANGE,
  TURTLE_SPEED,
  TURTLE_W,
  airPocket,
  anchorIdOf,
  jellyfish,
  laneOf,
  pearl,
  shell,
  sideRock,
} from '../builders';
export type { PerchSpec } from '../builders';

/** Where Bur's centre sits when resting under a Z1 ledge whose top is at `y` and thickness `h` (§2.3). */
export function restY(y: number, h: number = LEDGE_H): number {
  return zoneRestY(Z1, y, h);
}

/** A capturable Z1 ledge plus the `Anchor` that declares the rest point under it (§11.2). */
export function perch(spec: PerchSpec): [Ceiling, Anchor] {
  return perchIn(Z1, spec);
}

/** Catalogue nº 2, **Alga Cinta** (§5), at Z1's rest height. */
export function kelp(id: string, x: number, y: number, w: number, anchorX: number): [Ceiling, Anchor] {
  return kelpIn(Z1, id, x, y, w, anchorX);
}

/** Catalogue nº 3, **Tortuga Paseante** (§5), at Z1's rest height. */
export function turtle(id: string, x: number, y: number): [Ceiling, Anchor] {
  return turtleIn(Z1, id, x, y);
}
