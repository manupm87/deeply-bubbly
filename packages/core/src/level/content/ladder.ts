/**
 * The ladder vocabulary of the 540 px world (DECISIONS-v1.2 D3, D4). Every hand-authored chunk of every
 * zone is a LADDER: 3–5 declared rest points, top to bottom, each one reachable from the one above with
 * a single shot from rest. This file owns the geometry of that ladder; the zone files own its meaning.
 *
 * **Why a rung is placed where it is.** Bur rests UNDER a ceiling (§2.3): a landing is an arc that passes
 * the ledge's NEAR edge — the one it meets first — while already below it, and then floats back up into
 * its underside. Three consequences, and they are the whole authoring law of the zone files:
 *
 *  1. A rung directly below the previous one is not a landing at all: Bur meets its TOP face and bounces.
 *     The lateral gap has to clear the ledge, so `MIN_HOP_X_PX` is a physical minimum, not a taste.
 *  2. The anchor hangs `inset` px PAST the near edge, in the direction of travel. A shot cannot reverse
 *     horizontally (nothing but a `corriente` pushes sideways), so an anchor on the far side of a wide
 *     shelf is unreachable however hard you pull. Measured with the real integrator, a rung is reachable
 *     when `inset + HOP_X_MARGIN_PX <= |Δx| <= MAX_HOP_X_DESIGN_PX`, and the ledge's WIDTH is irrelevant.
 *  3. Therefore the ladder alternates across the column on its own, which is what makes the 540 px world
 *     read as more than one screen with scenery: `VIEW_W` is 180, so a 70-120 px hop is between a third
 *     and two thirds of a screen of lateral travel, and the camera has to follow (D3).
 *
 * **Every hop is a third of a chunk.** The ladder used to spend 17-19 shots between a station and its
 * boya, and at ~2,2 s a shot that stretch alone broke pillar 3's 35 s. Three rungs a chunk at 80 px each,
 * the seam included, is 240 px in three shots. Four-rung chunks (53 px hops) exist, but each one costs a
 * shot, so a stretch can afford very few of them. `pacing.adversarial.test.ts` holds the clock.
 *
 * **What the view allows.** The view is `VIEW_W` = 180 px and `CAM_DEADZONE_X` parks Bur at 35-65 % of it,
 * so after a hop she sits on the LEADING edge of the dead zone: 63 px of water ahead of her and 117 px
 * behind. `MIN_HOP_X_PX` is 70, so a hop that keeps the same direction always has its rest point out of
 * the view, and a hop that REVERSES has it in view up to 117 px. That is why these ladders zigzag, why
 * `MAX_HOP_X_DESIGN_PX` is 120, and why a same-direction hop is a deliberate spend: the sweeps below, which
 * make the camera travel and keep the 540 px column in use (D3), and little else.
 *
 * **The two cornices.** A death sends Bur to the last boya, and §2.4.2 puts that respawn at `WORLD_W / 2`
 * on the seam, in open water where she floats up: every chunk's exit must have a ceiling over that column.
 * Bur reaches a cornice past its near edge, so where the cornice can sit depends on the side she comes
 * from, and a zigzag only closes if the exit changes side:
 *
 *   `EXIT_X_WEST`  (245) is met travelling LEFT; the next hop reverses to the right.
 *   `EXIT_X_EAST`  (295) is met travelling RIGHT; the next hop reverses to the left.
 *
 * A three-rung chunk swaps side and a four-rung chunk keeps it, so a chunk is written against the exit
 * above it (`ladderIn`'s `fromX`) and an immersion needs an odd number of four-rung chunks to come back
 * to the west exit its station expects. The H3 selector has to honour this pairing (BACKLOG C6).
 */
import { LEDGE_H, perchIn } from './builders';
import { DEFAULT_TUNING } from '../../tuning';
import type { PerchSpec } from './builders';
import type { Anchor, Ceiling, Wall, ZoneIndex } from '../../types';

const T = DEFAULT_TUNING;

/** Top edge of every chunk's entry ledge, in chunk-local px. */
export const ENTRY_LEDGE_Y = 18;

/** Top edge of every chunk's exit cornice. `240 + ENTRY_LEDGE_Y - EXIT_LEDGE_Y` = the 80 px seam. */
export const EXIT_LEDGE_Y = 178;

/** The seam between two chunks: the drop from one chunk's exit anchor to the next chunk's entry anchor. */
export const SEAM_DROP_PX = T.CHUNK_H + ENTRY_LEDGE_Y - EXIT_LEDGE_Y;

/** Exit met travelling left. See the file header. */
export const EXIT_X_WEST = 245;

/** Exit met travelling right. See the file header. */
export const EXIT_X_EAST = 295;

/** Width of the exit cornice: inside the 24-60 px band, and the ceiling the respawn chain needs. */
export const CORNICE_W = 60;

/** How far past its near edge the cornice's rest point sits: what lets both exits span `WORLD_W / 2`. */
export const CORNICE_INSET = 30;

/** Default distance from a ledge's near edge to its anchor. Small = the arc barely has to clear the lip. */
export const LEDGE_INSET = 12;

/**
 * Margin over `inset` that a hop's lateral gap must keep. Measured against the real integrator over the
 * whole 40-102 px band of drops: a rung is met from `inset + ~25` px and comfortably from `inset + 45`.
 */
export const HOP_X_MARGIN_PX = 45;

/** Smallest lateral gap any authored hop uses. Below this the target's top face is what Bur meets. */
export const MIN_HOP_X_PX = LEDGE_INSET + HOP_X_MARGIN_PX + 13;

/** Largest lateral gap any authored hop uses: the reach rule's own `MAX_HOP_X_PX` in every zone. */
export const MAX_HOP_X_DESIGN_PX = 120;

/** Left band of the world reserved for side structures (reef, rock): no rung's ledge may reach into it. */
export const SIDE_BAND_L = 44;

/** Right band of the world reserved for side structures. */
export const SIDE_BAND_R = T.WORLD_W - 44;

/** Middle rung of a three-rung chunk: every hop, seam included, is the same 80 px. */
export const MID_Y = 98;

/** Inner rungs of a four-rung chunk: 54 + 53 + 53 px, then the 80 px seam. */
export const UPPER_Y = 72;
export const LOWER_Y = 125;

/** The station ladder: its second rung is the wide shelf the station respawn floats up into. */
export const RUNG_Y_STATION = { entry: ENTRY_LEDGE_Y, terrace: 88, lower: 135, exit: EXIT_LEDGE_Y } as const;

/** One rung of a ladder: WHERE Bur rests, plus whatever the zone's catalogue makes of the ledge. */
export interface RungSpec extends Omit<PerchSpec, 'id' | 'x' | 'w' | 'anchorX'> {
  /** x of the rest point (the `Anchor`), not of the ledge. */
  x: number;
  /** Ledge width; 24–48 for a normal rung (§4.1), wider for a cornice or a station shelf. */
  w?: number;
  /** Distance from the near edge to the anchor. Bigger = a longer hop is needed to get under it. */
  inset?: number;
}

/** A placed rung: the ledge, its declared rest point, and the edge the arc has to pass to reach it. */
export interface Rung {
  ceiling: Ceiling;
  anchor: Anchor;
  /** x of the edge the arriving arc passes; a crown grown on the LIP hangs here (§5 nº 6, nº 7). */
  nearEdge: number;
}

/** Default ledge width of a rung: inside the 24–48 px band §4.1 asks of a re-authored zone. */
const DEFAULT_RUNG_W = 40;

/**
 * Places one rung. `fromX` is the anchor the arc leaves, which is the only thing that decides which
 * edge of the ledge is the near one — and therefore where the ledge sits around its own rest point.
 */
export function rungIn(zone: ZoneIndex, id: string, spec: RungSpec, fromX: number): Rung {
  const w = spec.w ?? DEFAULT_RUNG_W;
  const inset = spec.inset ?? LEDGE_INSET;
  const goingRight = spec.x >= fromX;
  const x = goingRight ? spec.x - inset : spec.x + inset - w;
  const [ceiling, anchor] = perchIn(zone, { ...spec, id, x, w, anchorX: spec.x });
  return { ceiling, anchor, nearEdge: goingRight ? x : x + w };
}

/** A whole chunk ladder: the rungs in descent order, and the ids §11.2 wants declared on the chunk. */
export interface Ladder {
  rungs: Rung[];
  /** `[...ceilings, ...anchors]`, ready to spread into a chunk's `entities`. */
  entities: (Ceiling | Anchor)[];
  entryAnchorId: string;
  exitAnchorId: string;
}

/**
 * Builds a chunk's ladder. Rung ids are `${prefix}-1`, `${prefix}-2`… and each anchor is `${id}-a`
 * (`anchorIdOf`), so a chunk file never spells an id twice and a hazard can name the rung it grows on.
 *
 * `fromX` is the exit above the chunk, `EXIT_X_WEST` or `EXIT_X_EAST`: it decides which edge of the entry
 * ledge is the near one, and the chunk's own x's only make sense against it (see the file header).
 */
export function ladderIn(zone: ZoneIndex, prefix: string, specs: readonly RungSpec[], from: number): Ladder {
  const rungs: Rung[] = [];
  let fromX = from;
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (spec === undefined) continue;
    rungs.push(rungIn(zone, `${prefix}-${i + 1}`, spec, fromX));
    fromX = spec.x;
  }
  const first = rungs[0];
  const last = rungs[rungs.length - 1];
  if (first === undefined || last === undefined) throw new Error(`ladder '${prefix}' has no rungs`);
  return {
    rungs,
    entities: [...rungs.map((r) => r.ceiling), ...rungs.map((r) => r.anchor)],
    entryAnchorId: first.anchor.id,
    exitAnchorId: last.anchor.id,
  };
}

/** The exit cornice of a chunk, at `EXIT_X_WEST` or `EXIT_X_EAST`: it spans `WORLD_W / 2` (file header). */
export const exitRung = (x: number): RungSpec => ({ x, y: EXIT_LEDGE_Y, w: CORNICE_W, inset: CORNICE_INSET });

/** A normal rung: 40 px of ledge with its rest point just past the lip. */
export const rung = (x: number, y: number, extra: Partial<RungSpec> = {}): RungSpec => ({ x, y, ...extra });

/** Height of an authored ledge, re-exported so a chunk file never restates it. */
export { LEDGE_H };

/**
 * The side structures of D3: "paredes laterales sólidas … arrecife decorativo en Z1–Z3". They live in
 * the two reserved bands and nothing else does, so a rung is never wedged against one and a probe shot
 * can never be certified through a rock the player can see. Each entry is `[topY, height]`.
 */
export interface SideStructures {
  left?: readonly [number, number];
  right?: readonly [number, number];
}

/** Builds the side slabs of a chunk with the zone's own wall maker (rock in Z1, reef in Z2). */
export function sideStructures(
  prefix: string,
  spec: SideStructures,
  make: (id: string, x: number, y: number, w: number, h: number) => Wall,
): Wall[] {
  const out: Wall[] = [];
  if (spec.left !== undefined) out.push(make(`${prefix}-reef-l`, 0, spec.left[0], SIDE_BAND_L, spec.left[1]));
  if (spec.right !== undefined) {
    out.push(make(`${prefix}-reef-r`, SIDE_BAND_R, spec.right[0], T.WORLD_W - SIDE_BAND_R, spec.right[1]));
  }
  return out;
}
