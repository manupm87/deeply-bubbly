/**
 * Where everything on the world map sits, in DESIGN px of the 180 px column (WORLD-MAP.md §2).
 *
 * Pure arithmetic on purpose: the path, the nodes, the islands and the scene's scrolling all have to
 * agree about the same points, and the moment two of them derive a y on their own the path stops
 * touching the bubbles it connects. Nothing here knows about Phaser.
 *
 * The map is TALLER than the view (18 nodes at 34 px is more than 420) and is scrolled vertically;
 * `height` is what the scene clamps its scroll to.
 */

/** Radius of a level bubble. A node is 19 px across; its touch target is grown to 44 css pt. */
export const NODE_R = 9;
/**
 * Minimum vertical distance between consecutive nodes. It is bigger than the 44 pt target at zoom 2
 * (22 design px), but NOT at the zoom-1 layout, where a touch target is 44 design px: there the gap
 * is stretched to the target (`mapGeometry`), because two overlapping targets mean the deeper node —
 * drawn later, so on top — steals the contact meant for its neighbour.
 */
export const NODE_GAP = 34;
/**
 * How far a node swings from the centre line. It keeps the whole bubble inside the column AND clear of
 * the fixed sound button in the top-right corner: a node whose 44 pt target reached under that plate
 * would be untappable at whatever scroll position happened to park it there.
 */
const PATH_AMPLITUDE = 34;
/** Radians per node of the serpentine; ~7.4 nodes per full swing (Mario's winding path). */
const PATH_STEP = 0.85;
const PATH_PHASE = 0.5;

const TITLE_Y = 24;
const ISLAND_ROW_Y = 74;
const ISLAND_W = 44;
const ISLAND_H = 26;
const ISLAND_GAP = 14;
/** The foam line that separates the islands from the descent. */
const FOAM_Y = 116;
const PATH_TOP = 134;
/** Room under the last node for the trench and Ámbar's silhouette. */
const TRENCH_H = 96;

export interface MapPoint {
  x: number;
  y: number;
}

export interface IslandSlot extends MapPoint {
  w: number;
  h: number;
  /** Top of the two-line name under the island. */
  labelY: number;
}

export interface MapGeometry {
  viewW: number;
  /** Total scrollable height. */
  height: number;
  /** Vertical distance between two consecutive nodes; never less than one touch target. */
  gap: number;
  titleY: number;
  foamY: number;
  islands: IslandSlot[];
  nodes: MapPoint[];
  nodeR: number;
  /** Centre of the whale silhouette at the bottom. */
  whaleY: number;
}

export function mapGeometry(viewW: number, levelCount: number, islandCount: number, touch: number): MapGeometry {
  const cx = viewW / 2;
  // A node owns its whole 44 css pt target: the path can never pack two of them closer than that.
  const gap = Math.max(NODE_GAP, Math.ceil(Math.max(0, touch)));
  const nodes: MapPoint[] = [];
  for (let i = 0; i < levelCount; i++) {
    nodes.push({
      x: Math.round(cx + PATH_AMPLITUDE * Math.sin(i * PATH_STEP + PATH_PHASE)),
      y: PATH_TOP + i * gap,
    });
  }
  const islands: IslandSlot[] = [];
  const span = ISLAND_W + ISLAND_GAP;
  for (let i = 0; i < islandCount; i++) {
    islands.push({
      x: Math.round(cx + (i - (islandCount - 1) / 2) * span),
      y: ISLAND_ROW_Y,
      w: ISLAND_W,
      h: ISLAND_H,
      labelY: ISLAND_ROW_Y + Math.round(ISLAND_H / 2) + 4,
    });
  }
  const lastY = nodes.length > 0 ? (nodes[nodes.length - 1]?.y ?? PATH_TOP) : PATH_TOP;
  return {
    viewW,
    height: lastY + TRENCH_H,
    gap,
    titleY: TITLE_Y,
    foamY: FOAM_Y,
    islands,
    nodes,
    nodeR: NODE_R,
    whaleY: lastY + 58,
  };
}

/** Linear blend of two 0xRRGGBB colours, `t` in 0..1. Used for the zone gradient of the path. */
export function mixColour(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const lerp = (shift: number): number => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * k) << shift;
  };
  return lerp(16) | lerp(8) | lerp(0);
}
