/**
 * Authoring helpers for the hand-made Zone 1 chunks (GDD §4.1, §12.1). They are the vocabulary of the
 * zone — ledge, jellyfish, kelp, turtle, air pocket — so a chunk file reads as a level, not as geometry.
 *
 * Chunk-local coordinates: x ∈ [0, 180], y ∈ [0, 240], y down. `campaign.instantiateChunk` places them.
 *
 * Every rule here is IMPORTED, never restated: the lane of an x is `validator.laneAt`, the rest pose
 * under a ledge is `validator.restPoseY`, Bur's radius is `charge.zoneRadius`. The validator checks the
 * anchors these helpers place to within half a pixel — two copies of those three formulas could drift
 * apart and silently invalidate the whole zone (ARCHITECTURE.md, "un solo lugar para cada regla").
 */
import { zoneRadius } from '../../../control/charge';
import { DEFAULT_TUNING } from '../../../tuning';
import { laneAt, restPoseY } from '../../validator';
import type { CeilingKind } from '../../../tuning';
import type { Anchor, Ceiling, Lane, MovingSpec, Pickup, Wall, ZoneIndex } from '../../../types';

const T = DEFAULT_TUNING;

/** Zone 1, "Superficie" (§3.2). */
export const Z1: ZoneIndex = 0;

/** Bur's radius in Z1 (§2.6): `RADIUS_BASE * ZONE_RADIUS_PCT[0]` = 7 px. Rest points hang one radius below. */
export const Z1_RADIUS = zoneRadius(Z1, T);

/** Thickness of every authored ledge: over the 8 px minimum of §2.3, and readable at 180 px wide. */
export const LEDGE_H = 10;

/** Lane whose centre (§11.5.1: 40 / 90 / 140) is closest to `x`. */
export function laneOf(x: number): Lane {
  return laneAt(x, T);
}

/** Where Bur's centre sits when resting under a ledge whose top is at `y` and thickness `h` (§2.3). */
export function restY(y: number, h: number = LEDGE_H): number {
  return restPoseY({ x: 0, y, w: 0, h }, Z1_RADIUS);
}

export interface PerchSpec {
  /** Ceiling id; the anchor is `${id}-a`. */
  id: string;
  /** Left edge of the ledge. */
  x: number;
  /** Top edge of the ledge. */
  y: number;
  w: number;
  h?: number;
  /** x of the declared rest point; must lie over the ledge at EVERY phase of its travel (§11.2). */
  anchorX: number;
  material?: Ceiling['material'];
  kind?: CeilingKind;
  restitution?: number;
  moving?: MovingSpec;
  maxRestMs?: number;
  /** §5 catalogue number when the ledge is a creature (nº 2 alga, nº 3 tortuga). */
  catalogId?: number;
}

/**
 * A capturable ledge plus the `Anchor` that declares the rest point under it (§11.2). Rest points are
 * declared, never inferred: the reach rule (§11.5.11) and the respawn chain (§2.4.2) both read them.
 */
export function perch(spec: PerchSpec): [Ceiling, Anchor] {
  const h = spec.h ?? LEDGE_H;
  const ceiling: Ceiling = {
    type: 'ceiling',
    id: spec.id,
    rect: { x: spec.x, y: spec.y, w: spec.w, h },
    kind: spec.kind ?? 'posadero',
    capturable: true,
    restitution: spec.restitution ?? T.RESTITUTION_ROCK,
    material: spec.material ?? 'rock',
    ...(spec.moving === undefined ? {} : { moving: spec.moving }),
    ...(spec.maxRestMs === undefined ? {} : { maxRestMs: spec.maxRestMs }),
    ...(spec.catalogId === undefined ? {} : { catalogId: spec.catalogId }),
  };
  const anchor: Anchor = {
    type: 'anchor',
    id: `${spec.id}-a`,
    ceilingId: spec.id,
    pos: { x: spec.anchorX, y: restPoseY(ceiling.rect, Z1_RADIUS) },
    lane: laneOf(spec.anchorX),
  };
  return [ceiling, anchor];
}

/** Convenience: the anchor id `perch` derives for a ceiling id. */
export const anchorIdOf = (ceilingId: string): string => `${ceilingId}-a`;

/**
 * Catalogue nº 1, **Medusa Farolillo** (§5): a NON-capturable ceiling with jelly restitution. §5 places
 * her "siempre como cara inferior, de modo que Bur la golpea subiendo y sale disparada hacia abajo", so
 * the authoring rule for every jellyfish in this zone is: she sits ON the straight line between the two
 * anchors of a hop, at the depth Bur rises back through, on the SHORT side of the landing. A shot that
 * falls short meets her from below and is fired back DOWN; the well-aimed one passes beside her.
 * She deflates for BOUNCE_COOLDOWN_MS after a bounce, so she can never be farmed, and she costs no Air:
 * an ally disguised as a hazard, not a `Hazard` entity — but she IS catalogue nº 1 (§11.5.5).
 */
export function jellyfish(id: string, x: number, y: number, w: number): Ceiling {
  return {
    type: 'ceiling',
    id,
    rect: { x, y, w, h: LEDGE_H },
    kind: 'impaciente',
    capturable: false,
    restitution: T.RESTITUTION_JELLY,
    bounceCooldownMs: T.BOUNCE_COOLDOWN_MS,
    material: 'jelly',
    catalogId: 1,
  };
}

/** Catalogue nº 2, **Alga Cinta** (§5): a soft posadero that absorbs 82 % of the arrival speed. */
export function kelp(id: string, x: number, y: number, w: number, anchorX: number): [Ceiling, Anchor] {
  return perch({
    id,
    x,
    y,
    w,
    anchorX,
    kind: 'posadero',
    material: 'kelp',
    restitution: T.RESTITUTION_SOFT,
    catalogId: 2,
  });
}

/** Travel of the Tortuga Paseante (§5 nº 3): 25 px/s over a 60 px range. */
export const TURTLE_SPEED = 25;
export const TURTLE_RANGE = 60;

/**
 * Width of a turtle's shell. §11.2 defines an `Anchor` as "Bur's centre when resting under the ceiling"
 * and §2.4.2 respawns her exactly there, so the rest point must stay under the shell at EVERY phase of
 * the oscillation: with a ±30 px travel the shell has to be wider than 60 px, and the anchor sits in the
 * middle. 76 px leaves 8 px of margin at each end of the walk.
 */
export const TURTLE_W = 76;

/**
 * Catalogue nº 3, **Tortuga Paseante** (§5): a slow lateral moving ceiling. Resting under her is a free
 * ride. Her `Anchor` is declared at the CENTRE of the shell, which is the only x the shell covers for
 * the whole walk (§11.5.9: cosmetic jitter never touches an anchor — nor does the walk itself).
 * `x` is the base left edge; the swept box is `[x - 30, x + 106]`, so `x ∈ [30, 74]`.
 */
export function turtle(id: string, x: number, y: number): [Ceiling, Anchor] {
  return perch({
    id,
    x,
    y,
    w: TURTLE_W,
    anchorX: x + TURTLE_W / 2,
    kind: 'posadero',
    material: 'creature',
    moving: { axis: 'x', speed: TURTLE_SPEED, range: TURTLE_RANGE, phase: 0 },
    catalogId: 3,
  });
}

/** Decorative side rock. Solid both ways, never capturable (§11.2), and never inside a seam mouth. */
export function sideRock(id: string, x: number, y: number, w: number, h: number): Wall {
  return { type: 'wall', id, rect: { x, y, w, h }, restitution: T.RESTITUTION_ROCK, material: 'rock' };
}

/** An air pocket: +1 Air (§2.5, "bolsas de aire (+1, 1–2 por chunk)"). */
export function airPocket(id: string, x: number, y: number): Pickup {
  return { type: 'pickup', id, pos: { x, y }, pickupType: 'aire', value: 1, radius: 6 };
}

/** A pearl. Catalogue nº 4 (Peces payaso) is decorative fauna: crossing the shoal is what drops one (§5). */
export function pearl(id: string, x: number, y: number): Pickup {
  return { type: 'pickup', id, pos: { x, y }, pickupType: 'perla', value: 1, radius: 4 };
}
