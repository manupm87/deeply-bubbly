/**
 * Authoring vocabulary shared by every hand-made zone (GDD §4.1, §12.1). A chunk file reads as a level
 * — ledge, jellyfish, kelp, turtle, urchin, anemone, current — and never as raw geometry.
 *
 * Chunk-local coordinates: x ∈ [0, CHUNK_W] (540 since DECISIONS-v1.2 D3), y ∈ [0, CHUNK_H], y down.
 * `campaign.instantiateChunk` places them. Every helper takes an x ANYWHERE in that range: D3 deleted
 * the L/C/R lanes, so a ledge is placed where the level wants it and the 2D reach rule (D4) is what
 * says whether the next one can be got to.
 *
 * Everything here is parameterised by ZONE, because the only thing that changes between zones is Bur's
 * radius (§2.6) and therefore the height of every rest pose. Each zone's own `builders.ts` binds that
 * parameter once and re-exports the vocabulary under its own names; nothing is ever copied.
 *
 * Every rule is IMPORTED, never restated: the rest pose under a ledge is `validator.restPoseY` and
 * Bur's radius is `charge.zoneRadius`. The validator checks the anchors these helpers place to within
 * half a pixel — two copies of those formulas could drift apart and silently invalidate a whole zone
 * (ARCHITECTURE.md, "un solo lugar para cada regla").
 */
import { zoneRadius } from '../../control/charge';
import { accelForDriftX } from '../../physics/forceFields';
import { DEFAULT_TUNING } from '../../tuning';
import { restPoseY } from '../validator';
import type { CeilingKind } from '../../tuning';
import type { Rect } from '../../math/vec';
import type { Anchor, Ceiling, CrownGrowth, ForceField, Hazard, MovingSpec, Pickup, Wall, ZoneIndex } from '../../types';

const T = DEFAULT_TUNING;

/** Thickness of every authored ledge: over the 8 px minimum of §2.3, and readable at VIEW_W px wide. */
export const LEDGE_H = 10;

/** Convenience: the anchor id `perchIn` derives for a ceiling id. */
export const anchorIdOf = (ceilingId: string): string => `${ceilingId}-a`;

/** Where Bur's centre sits in `zone` when resting under a ledge whose top is at `y` and thickness `h`. */
export function zoneRestY(zone: ZoneIndex, y: number, h: number = LEDGE_H): number {
  return restPoseY({ x: 0, y, w: 0, h }, zoneRadius(zone, T));
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
  /** §5 catalogue number when the ledge is a creature (nº 2 alga, nº 3 tortuga, nº 9 pulpo). */
  catalogId?: number;
}

/**
 * A capturable ledge plus the `Anchor` that declares the rest point under it (§11.2). Rest points are
 * declared, never inferred: the reach rule (§11.5.11) and the respawn chain (§2.4.2) both read them.
 */
export function perchIn(zone: ZoneIndex, spec: PerchSpec): [Ceiling, Anchor] {
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
    id: anchorIdOf(spec.id),
    ceilingId: spec.id,
    pos: { x: spec.anchorX, y: restPoseY(ceiling.rect, zoneRadius(zone, T)) },
  };
  return [ceiling, anchor];
}

/**
 * Catalogue nº 1, **Medusa Farolillo** (§5): a NON-capturable ceiling with jelly restitution. §5 places
 * her "siempre como cara inferior, de modo que Bur la golpea subiendo y sale disparada hacia abajo", so
 * the authoring rule for every jellyfish is: she sits ON the straight line between the two anchors of a
 * hop, at the depth Bur rises back through, on the SHORT side of the landing. A shot that falls short
 * meets her from below and is fired back DOWN; the well-aimed one passes beside her. She deflates for
 * BOUNCE_COOLDOWN_MS after a bounce, so she can never be farmed, and she costs no Air: an ally
 * disguised as a hazard, not a `Hazard` entity — but she IS catalogue nº 1 (§11.5.5).
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

/** Catalogue nº 2, **Alga Cinta** (§5, Z1–Z2): a soft posadero that absorbs 82 % of the arrival speed. */
export function kelpIn(zone: ZoneIndex, id: string, x: number, y: number, w: number, anchorX: number): [Ceiling, Anchor] {
  return perchIn(zone, {
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
export function turtleIn(zone: ZoneIndex, id: string, x: number, y: number): [Ceiling, Anchor] {
  return perchIn(zone, {
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

/** A reef wall: the same solid, wearing Zone 2's material so the renderer can tell reef from rock. */
export function reefRock(id: string, x: number, y: number, w: number, h: number): Wall {
  return { type: 'wall', id, rect: { x, y, w, h }, restitution: T.RESTITUTION_ROCK, material: 'reef' };
}

/** An air pocket: +1 Air (§2.5, "bolsas de aire (+1, 1–2 por chunk)"). */
export function airPocket(id: string, x: number, y: number): Pickup {
  return { type: 'pickup', id, pos: { x, y }, pickupType: 'aire', value: 1, radius: 6 };
}

/** A pearl. Catalogue nº 4 (Peces payaso) is decorative fauna: crossing the shoal is what drops one (§5). */
export function pearl(id: string, x: number, y: number): Pickup {
  return { type: 'pickup', id, pos: { x, y }, pickupType: 'perla', value: 1, radius: 4 };
}

/** One of the three shells of an immersion (§12.1, §6.1): collectible meta-progression, never Air. */
export function shell(id: string, x: number, y: number): Pickup {
  return { type: 'pickup', id, pos: { x, y }, pickupType: 'concha', value: 1, radius: 5 };
}

// ---------------------------------------------------------------------------------------------
// Zone 2 catalogue (§5 nº 6, 7, 8, 9)
// ---------------------------------------------------------------------------------------------

/**
 * Hitboxes of the Zone 2 catalogue. They are the sizes the shell draws its creature art at, so the
 * silhouette a player reads and the box the simulation tests are the same rectangle to the pixel: a
 * hazard whose art is bigger than its hitbox teaches the wrong lesson twice (a hit that looks like a
 * miss, then a miss that looks like a hit), and §5 nº 6 is sold as "puntería pura".
 */
export const ERIZO_W = 14;
export const ERIZO_H = 14;
export const ANEMONA_W = 16;
export const ANEMONA_H = 14;

/**
 * A crown of the reef: one of the two static Zone 2 hazards, as a box.
 *
 * **Where a crown may grow, and why it is a rule.** Bur lands by dipping past the INNER edge of a ledge
 * and floating back up under it (§2.3), so the arc of a good shot never crosses a ledge's top face: it
 * passes BELOW the shelf, just outside its lip. A review of the first version of this zone measured the
 * consequence — of ~900 certified landing lines in Zone 2, exactly 0 touched a hazard, because every
 * crown had been planted on a shoulder no line ever visits. `'shoulder'` is still the right home for a
 * crown that is meant to punish an overshoot; `'lip'`, which hangs it under the shelf's inner edge, is
 * the one that contests the landing itself.
 */
export type { CrownGrowth };

/** Box of a crown of width `w` × height `h` grown at `centreX` on a ledge whose top edge is `ledgeTopY`. */
function crownRect(centreX: number, ledgeTopY: number, growth: CrownGrowth, w: number, h: number): Rect {
  const y = growth === 'shoulder' ? ledgeTopY - h : ledgeTopY + LEDGE_H;
  return { x: centreX - w / 2, y, w, h };
}

/**
 * Catalogue nº 6, **Erizo Coralino** (§5, Z2+): "estático sobre repisas, −1 Aire. Nunca se mueve: es
 * puntería pura." Always active (no `periodMs`) — its whole design is that it never changes — and its
 * push is LATERAL (§5 "regla de dirección": nothing but nº 20 and nº 21 ever pushes up, §11.7.9).
 * `growth` picks the shoulder of the ledge or its lip; see `CrownGrowth`.
 */
export function erizo(id: string, centreX: number, ledgeTopY: number, growth: CrownGrowth = 'shoulder'): Hazard {
  return {
    type: 'hazard',
    id,
    catalogId: 6,
    shape: crownRect(centreX, ledgeTopY, growth, ERIZO_W, ERIZO_H),
    airCost: 1,
    pushDir: 'lateral',
    growth,
  };
}

/**
 * Catalogue nº 7, **Anémona Pegajosa** (§5, Z2): "atrapa 0,8 s; si sigues dentro a los 1,5 s, ventila 1
 * Aire". The whole flow lives in `game/hazards.ts` (pin → TRAP_HOLD_MS of suppressed input → vent at
 * TRAP_VENT_MS unless a charge of TRAP_ESCAPE_POWER buys the way out): here it is only `trap: true`.
 * A trap never also deals contact damage, so its `pushDir` is never used — it is declared 'lateral'
 * because §11.7.9 forbids 'up' to anything but nº 20 and nº 21.
 *
 * Like the urchin she grows on a ledge, and `growth` says where (see `CrownGrowth`). A trap's placement
 * carries one extra obligation the validator enforces (`validator.trapEscapes`): the crown must have
 * open water under it, because the escape §2.4.5 sells is a DOWNWARD launch and an anemone with rock
 * below it hands Bur straight back to itself, one pip at a time, until the bar is empty.
 */
export function anemona(id: string, centreX: number, ledgeTopY: number, growth: CrownGrowth = 'shoulder'): Hazard {
  return {
    type: 'hazard',
    id,
    catalogId: 7,
    shape: crownRect(centreX, ledgeTopY, growth, ANEMONA_W, ANEMONA_H),
    airCost: 1,
    pushDir: 'lateral',
    trap: true,
    growth,
  };
}

/**
 * Terminal lateral drift of a `corriente` band, in px/s (§5 nº 8: "banda horizontal ±90 px/s").
 *
 * A `ForceField.vector` is an ACCELERATION (§11.2), so the number the GDD promises is not the number
 * the field carries: `accelForDriftX` (physics/forceFields) owns the `v_term = a / DAMPING_X` identity
 * and turns ±90 px/s into ±27 px/s². Writing 90 straight into `vector.x` would have produced a
 * 300 px/s river — three quarters of a full charge, sideways.
 */
export const CURRENT_DRIFT = 90;

/** The acceleration that settles at `CURRENT_DRIFT`: 27 px/s². */
export const CURRENT_ACCEL = accelForDriftX(CURRENT_DRIFT, T);

/**
 * Catalogue nº 8, **Corriente de Arrecife** (§5, Z2+): a horizontal band, "visible como partículas",
 * that pushes sideways and nothing else. It is the verb of the zone — "leer y usar las corrientes" —
 * so it never costs Air and never blocks a line: it moves the one you chose. `dir` is +1 (rightward)
 * or −1 (leftward).
 *
 * `catalogId` is carried so §11.5.5 can see it: the isolation rule is didactic ("las dos primeras
 * apariciones de un peligro nuevo salen solas"), and a current the player has never met before is a
 * new thing to learn whether or not it can take a pip.
 */
export function currentBand(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: 1 | -1,
): ForceField {
  return {
    type: 'forcefield',
    id,
    rect: { x, y, w, h },
    fieldType: 'corriente',
    vector: { x: dir * CURRENT_ACCEL, y: 0 },
    buoyancyMul: 1,
    impulseMul: 1,
    chargeMul: 1,
    opensAscenso: false,
    catalogId: 8,
  };
}

/** How long the Pulpo Camuflado tolerates a guest (§5 nº 9: "a los 0,5 s de reposo te desplaza suave"). */
export const PULPO_REST_MS = 500;

/**
 * Catalogue nº 9, **Pulpo Camuflado** (§5, Z2): "parece repisa; a los 0,5 s de reposo te desplaza
 * suave". He is a real, capturable `Ceiling` — that is the whole trick — with rock restitution and the
 * silhouette of a ledge; only his `maxRestMs` gives him away, and only after you have already landed.
 * When it runs out, `bubbleStep` fires `restRelease('timeout')` and pushes Bur DOWN at
 * REST_RELEASE_PUSH (90 px/s): "desplaza suave", never damage, and never upward (§5, §11.7.9).
 *
 * `material: 'creature'` + `catalogId: 9` is how the shell tells him from a rock ledge without knowing
 * a rule: material picks the body it draws, catalogId picks WHICH creature.
 */
export function pulpoLedge(
  zone: ZoneIndex,
  id: string,
  x: number,
  y: number,
  w: number,
  anchorX: number,
): [Ceiling, Anchor] {
  return perchIn(zone, {
    id,
    x,
    y,
    w,
    anchorX,
    kind: 'impaciente',
    material: 'creature',
    restitution: T.RESTITUTION_ROCK,
    maxRestMs: PULPO_REST_MS,
    catalogId: 9,
  });
}
