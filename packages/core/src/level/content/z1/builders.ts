/**
 * Zone 1's binding of the shared authoring vocabulary (`level/content/builders.ts`, `../ladder.ts`).
 * The only thing a zone changes is Bur's radius (§2.6) and therefore the height of every rest pose, so
 * this file fixes that one parameter and re-exports the vocabulary under the names the Z1 chunk files
 * use. There is no second copy of `perch`, `restY` or the ladder geometry anywhere.
 */
import { zoneRadius } from '../../../control/charge';
import { DEFAULT_TUNING } from '../../../tuning';
import { LEDGE_H, kelpIn, perchIn, sideRock, turtleIn, zoneRestY } from '../builders';
import { TURTLE_RANGE, TURTLE_W } from '../builders';
import { ladderIn, rungIn, sideStructures } from '../ladder';
import type { PerchSpec } from '../builders';
import type { Ladder, Rung, RungSpec, SideStructures } from '../ladder';
import type { Anchor, Ceiling, Wall, ZoneIndex } from '../../../types';

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
  pearl,
  shell,
  sideRock,
} from '../builders';
export {
  ENTRY_X_LEFT,
  ENTRY_X_RIGHT,
  EXIT_X,
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

/** The decorative reef of Zone 1 (§3.2, D3): plain rock slabs in the two reserved side bands. */
export function reefIn(prefix: string, spec: SideStructures): Wall[] {
  return sideStructures(prefix, spec, sideRock);
}

/** Where Bur's centre sits when resting under a Z1 ledge whose top is at `y` and thickness `h` (§2.3). */
export function restY(y: number, h: number = LEDGE_H): number {
  return zoneRestY(Z1, y, h);
}

/** A capturable Z1 ledge plus the `Anchor` that declares the rest point under it (§11.2). */
export function perch(spec: PerchSpec): [Ceiling, Anchor] {
  return perchIn(Z1, spec);
}

/** A whole Z1 chunk ladder: 3–5 rest points, each one a single shot from the one above (§11.5.11). */
export function ladder(prefix: string, specs: readonly RungSpec[]): Ladder {
  return ladderIn(Z1, prefix, specs);
}

/** One rung on its own, for the chunks that place a ledge outside the ladder. */
export function z1Rung(id: string, spec: RungSpec, fromX: number): Rung {
  return rungIn(Z1, id, spec, fromX);
}

/** Catalogue nº 2, **Alga Cinta** (§5), as a ladder rung: a soft posadero at Z1's rest height. */
export const kelpRung = (x: number, y: number, extra: Partial<RungSpec> = {}): RungSpec => ({
  x,
  y,
  kind: 'posadero',
  material: 'kelp',
  restitution: T.RESTITUTION_SOFT,
  catalogId: 2,
  ...extra,
});

/**
 * Catalogue nº 3, **Tortuga Paseante** (§5), as a ladder rung. Her shell is `TURTLE_W` wide and her rest
 * point sits at its CENTRE — the only x the shell covers for the whole ±30 px walk (§11.2) — so her
 * `inset` is half the shell and the hop that reaches her is correspondingly longer.
 */
export const turtleRung = (x: number, y: number): RungSpec => ({
  x,
  y,
  w: TURTLE_W,
  inset: TURTLE_W / 2,
  kind: 'posadero',
  material: 'creature',
  moving: { axis: 'x', speed: 25, range: TURTLE_RANGE, phase: 0 },
  catalogId: 3,
});

/** Catalogue nº 2 outside a ladder (kept for the fixtures that build a single kelp ledge). */
export function kelp(id: string, x: number, y: number, w: number, anchorX: number): [Ceiling, Anchor] {
  return kelpIn(Z1, id, x, y, w, anchorX);
}

/** Catalogue nº 3 outside a ladder. */
export function turtle(id: string, x: number, y: number): [Ceiling, Anchor] {
  return turtleIn(Z1, id, x, y);
}
