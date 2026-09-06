/**
 * Backdrop textures: the reef that lines the WORLD edges, the sparse distant heads that drift across
 * the whole width, and the shallow-water caustic tile.
 *
 * ART DIRECTION (DECISIONS-v1.2 D3): the world is `WORLD_W = 540` px wide and the view shows 180 of
 * it, so the reef is no longer a frame around the play column — it is the two SIDES OF THE WORLD,
 * only visible when Bur explores that far. It is therefore built in two pieces:
 *
 *   - `buildEdgeReef`: an `EDGE_W` px strip, vertically seamless, drawn at world x `0` and
 *     `WORLD_W - EDGE_W`. It is the near layer (parallax 1: it belongs to the world) and it is the
 *     cue that says "this is the wall", matching the solid walls the simulation puts there.
 *   - `buildDistantReef`: a horizontally AND vertically seamless tile of scattered coral heads and
 *     kelp, tiled across the view for the two far parallax layers, so open water is never empty.
 *
 * Nothing here is collidable — the walls of the world are entities.
 */
import type * as Phaser from 'phaser';
import { commit, gfx, hexOf, mixColor, mulberry32, type G } from './pixels';
import type { ZonePalette } from '../palette';

/** Vertical period of every backdrop texture: one chunk tall, so the tiling never beats with content. */
export const LAYER_H = 240;
/** Width of the reef strip that lines each world edge (D3: "arrecife decorativo" at x<0 and x>WORLD_W). */
export const EDGE_W = 40;
/** Horizontal period of the distant-head layers. */
export const DISTANT_TILE_W = 180;

/** Alpha of each backdrop piece over the water: distant reef, never a wall. */
export const LAYER_ALPHA = [0.28, 0.34] as const;
/** Alpha of the two world-edge strips. They are nearer, so they are the strongest silhouette. */
export const EDGE_ALPHA = 0.52;

// -------------------------------------------------------------------------------------------
// World-edge reef
// -------------------------------------------------------------------------------------------

/**
 * Seamless silhouette profile: overlapping half-circle bumps (coral heads) summed with `max`, so the
 * inner boundary is a chain of round domes instead of jagged stair-steps.
 */
function coralProfile(rand: () => number, reach: number): number[] {
  const w = new Array<number>(LAYER_H).fill(2);
  const heads = 7 + Math.round(rand() * 3);
  for (let i = 0; i < heads; i++) {
    const yc = (i + rand() * 0.7) * (LAYER_H / heads);
    const r = 14 + rand() * 22;
    const h = reach * (0.45 + rand() * 0.55);
    for (let d = -Math.ceil(r); d <= Math.ceil(r); d++) {
      const y = (((Math.round(yc) + d) % LAYER_H) + LAYER_H) % LAYER_H;
      const k = d / r;
      const value = h * Math.sqrt(Math.max(0, 1 - k * k));
      if (value > (w[y] ?? 0)) w[y] = value;
    }
  }
  return w.map((v) => Math.min(reach, Math.round(v)));
}

/** Fills the strip from a profile (grown from the OUTER edge inwards) plus a 1 px lit inner rim. */
function paintEdge(g: G, profile: number[], right: boolean, body: number, rim: number): void {
  g.fillStyle(body, 1);
  for (let y = 0; y < LAYER_H; y++) {
    const w = profile[y] ?? 0;
    if (w <= 0) continue;
    if (right) g.fillRect(EDGE_W - w, y, w, 1);
    else g.fillRect(0, y, w, 1);
  }
  g.fillStyle(rim, 1);
  for (let y = 0; y < LAYER_H; y++) {
    const w = profile[y] ?? 0;
    if (w <= 1) continue;
    const prev = profile[(y + LAYER_H - 1) % LAYER_H] ?? 0;
    if (w < prev) continue; // light only the upper half of every dome
    if (right) g.fillRect(EDGE_W - w, y, 1, 1);
    else g.fillRect(w - 1, y, 1, 1);
  }
}

/** A curving kelp stalk with small fronds. Seamless: the sine period divides LAYER_H exactly. */
function kelpCurve(g: G, rand: () => number, right: boolean, reach: number, tone: number): void {
  const baseX = 1 + rand() * (reach * 0.5);
  const amp = 2 + rand() * 3;
  const periods = 2 + Math.floor(rand() * 2);
  const phase = rand() * Math.PI * 2;
  const top = Math.round(rand() * LAYER_H);
  const len = Math.round(LAYER_H * (0.3 + rand() * 0.3));
  g.fillStyle(tone, 1);
  for (let i = 0; i < len; i++) {
    const y = (top + i) % LAYER_H;
    const bend = Math.sin((i / LAYER_H) * periods * Math.PI * 2 + phase) * amp;
    const x = Math.round(baseX + bend + (i / len) * 3);
    const px = right ? EDGE_W - 1 - x : x;
    g.fillRect(px, y, 1, 1);
    if (i % 9 === 4) g.fillRect(right ? px - 2 : px + 1, y, 2, 1); // frond
  }
}

/** Round bumps scattered along the reef line: pebbles and small coral polyps. */
function bumps(g: G, rand: () => number, profile: number[], right: boolean, tone: number): void {
  g.fillStyle(tone, 1);
  for (let i = 0; i < 26; i++) {
    const y = Math.round(rand() * (LAYER_H - 1));
    const edge = profile[y] ?? 0;
    if (edge < 4) continue;
    const x = Math.round(rand() * (edge - 3));
    const s = 1 + Math.round(rand() * 1.4);
    g.fillRect(right ? EDGE_W - 1 - x - s : x, y, s, s);
  }
}

/**
 * One world-edge reef strip, `EDGE_W` wide and vertically seamless. `right` mirrors the profile so the
 * mass hugs the correct side; the two sides get different seeds so the world does not look folded.
 */
export function buildEdgeReef(scene: Phaser.Scene, key: string, zone: number, right: boolean, p: ZonePalette): void {
  if (scene.textures.exists(key)) return;
  const rand = mulberry32(zone * 131 + (right ? 977 : 311));
  // The reef is GREEN, not grey: mixing toward rock is what makes a layer read as a wall of stone.
  const body = mixColor(p.waterBottom, p.kelp, 0.62);
  const rim = mixColor(body, mixColor(p.foam, p.coral, 0.35), 0.42);
  const kelpTone = mixColor(p.kelp, p.waterTop, 0.18);
  const bumpTone = mixColor(p.coral, p.waterBottom, 0.34);

  const g = gfx(scene);
  const profile = coralProfile(rand, EDGE_W);
  paintEdge(g, profile, right, body, rim);
  bumps(g, rand, profile, right, bumpTone);
  kelpCurve(g, rand, right, EDGE_W, kelpTone);
  kelpCurve(g, rand, right, EDGE_W, kelpTone);
  commit(scene, g, key, EDGE_W, LAYER_H);
}

// -------------------------------------------------------------------------------------------
// Distant heads across the width
// -------------------------------------------------------------------------------------------

/** Heads per tile on each far layer: sparse enough that open water stays open (D3, *Hungry Shark*). */
const HEADS_PER_TILE = [3, 5] as const;

/** One coral head: a dome of `r` px sitting on the tile, wrapped on both axes so the tile is seamless. */
function head(g: G, cx: number, cy: number, r: number, squash: number): void {
  for (let dy = -Math.ceil(r); dy <= 0; dy++) {
    const k = dy / r;
    const half = Math.round(r * Math.sqrt(Math.max(0, 1 - k * k)));
    if (half <= 0) continue;
    const y = (((cy + Math.round(dy * squash)) % LAYER_H) + LAYER_H) % LAYER_H;
    for (let dx = -half; dx <= half; dx++) {
      const x = (((cx + dx) % DISTANT_TILE_W) + DISTANT_TILE_W) % DISTANT_TILE_W;
      g.fillRect(x, y, 1, 1);
    }
  }
}

/**
 * One far parallax layer: a tile of scattered coral heads and short kelp tufts, seamless on BOTH axes
 * so it can be tiled across a 540 px world and scrolled horizontally with the camera.
 * `layer` 0 is the farthest and the palest.
 */
export function buildDistantReef(scene: Phaser.Scene, key: string, zone: number, layer: number, p: ZonePalette): void {
  if (scene.textures.exists(key)) return;
  const rand = mulberry32(zone * 131 + layer * 37 + 11);
  const haze = 0.34 + layer * 0.2;
  const body = mixColor(p.waterBottom, p.kelp, haze);
  const rim = mixColor(body, mixColor(p.foam, p.coral, 0.3), 0.22 + layer * 0.1);

  const g = gfx(scene);
  g.fillStyle(body, 1);
  const count = HEADS_PER_TILE[layer] ?? 4;
  const tops: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const cx = Math.round(rand() * DISTANT_TILE_W);
    const cy = Math.round(((i + rand() * 0.6) * LAYER_H) / count);
    const r = 8 + Math.round(rand() * (10 + layer * 8));
    head(g, cx, cy, r, 0.55 + rand() * 0.3);
    tops.push([cx, (((cy - r) % LAYER_H) + LAYER_H) % LAYER_H]);
  }
  // A 1 px lit crown on each dome: without it the far layers read as smudges, not as reef.
  g.fillStyle(rim, 1);
  for (const [cx, top] of tops) {
    for (let dx = -2; dx <= 2; dx++) {
      g.fillRect((((cx + dx) % DISTANT_TILE_W) + DISTANT_TILE_W) % DISTANT_TILE_W, (top + 1) % LAYER_H, 1, 1);
    }
  }
  commit(scene, g, key, DISTANT_TILE_W, LAYER_H);
}

// -------------------------------------------------------------------------------------------
// Caustics
// -------------------------------------------------------------------------------------------

export const CAUSTIC_SIZE = 96;
/** Wavy light streaks per tile. Six over 96 px is one every 16 px: shimmer, never wallpaper. */
const CAUSTIC_STREAKS = 6;

/**
 * Seamless caustic shimmer for the shallows.
 *
 * ART DIRECTION: the previous attempt traced a level set of an interference field, which is what a
 * caustic net really is — and at 1 px per design px it came out as a field of closed potato rings the
 * same size, hue and SHAPE as an air pickup, so the one collectable of Zone 1 vanished into it. Light
 * on water is therefore drawn as what it looks like from below instead: long, ROUGHLY HORIZONTAL
 * ripple streaks, broken into dashes. Elongated shapes can never be confused with a round pickup, and
 * the streak brightens only where the ripple is locally flat, which is exactly where light pools.
 */
export function buildCaustics(scene: Phaser.Scene, key: string, p: ZonePalette): void {
  if (scene.textures.exists(key)) return;
  const s = CAUSTIC_SIZE;
  const canvas = scene.textures.createCanvas(key, s, s);
  if (!canvas) return;
  const c = canvas.getContext();
  c.clearRect(0, 0, s, s);
  const line = hexOf(mixColor(p.foam, p.waterTop, 0.45));
  const bright = hexOf(mixColor(p.foam, p.waterTop, 0.1));
  const k = (Math.PI * 2) / s;
  const spacing = s / CAUSTIC_STREAKS;
  for (let i = 0; i < CAUSTIC_STREAKS; i++) {
    // Integer wave numbers only, so both harmonics close on themselves across the tile.
    const phase = i * 1.9;
    const y0 = i * spacing;
    for (let x = 0; x < s; x++) {
      const wave = 3.4 * Math.sin(k * 2 * x + phase) + 1.7 * Math.sin(k * 3 * x - phase * 1.3);
      const slope = 6.8 * Math.cos(k * 2 * x + phase) + 5.1 * Math.cos(k * 3 * x - phase * 1.3);
      const flat = 1 - Math.min(1, Math.abs(slope) / 6);
      if (flat < 0.2) continue; // the streak breaks up where the ripple is steep
      const y = (((y0 + Math.round(wave)) % s) + s) % s;
      c.fillStyle = flat > 0.6 ? bright : line;
      c.fillRect(x, y, 1, 1);
      if (flat > 0.82) c.fillRect(x, (y + 1) % s, 1, 1); // 2 px where the light really pools
    }
  }
  canvas.refresh();
}
