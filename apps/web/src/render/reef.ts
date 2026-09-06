/**
 * Distant-reef parallax silhouettes and the shallow-water caustic tile.
 *
 * ART DIRECTION: the play column is 180 px wide and must FEEL 180 px wide. The three parallax layers
 * are therefore scenery, not geometry: rounded coral heads and kelp curves hugging the two edges, at
 * low contrast over the water, and always narrower than `MAX_REACH` so the middle of the screen is
 * never encroached on. Nothing here is collidable — the walls of the world are entities.
 */
import type * as Phaser from 'phaser';
import { commit, gfx, hexOf, mixColor, mulberry32, type G } from './pixels';
import type { ZonePalette } from '../palette';

export const LAYER_H = 240;
export const WORLD_W = 180;

/** Max px a layer may eat from an edge: the NEAR layer is the tightest, the far one the widest. */
export const MAX_REACH = [28, 24, 20] as const;
/** Alpha of each layer over the water: distant reef, never a wall. */
export const LAYER_ALPHA = [0.28, 0.34, 0.42] as const;

/**
 * Seamless silhouette profile: overlapping half-circle bumps (coral heads) summed with `max`, so the
 * inner boundary is a chain of round domes instead of the old jagged 6 px stair-steps.
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

/** Fills one edge from a profile, mirroring on the right, plus a 1 px lit rim on the inner boundary. */
function paintEdge(g: G, profile: number[], right: boolean, body: number, rim: number): void {
  g.fillStyle(body, 1);
  for (let y = 0; y < LAYER_H; y++) {
    const w = profile[y] ?? 0;
    if (w <= 0) continue;
    if (right) g.fillRect(WORLD_W - w, y, w, 1);
    else g.fillRect(0, y, w, 1);
  }
  g.fillStyle(rim, 1);
  for (let y = 0; y < LAYER_H; y++) {
    const w = profile[y] ?? 0;
    if (w <= 1) continue;
    const prev = profile[(y + LAYER_H - 1) % LAYER_H] ?? 0;
    const tall = w >= prev; // light only the upper half of every dome
    if (!tall) continue;
    if (right) g.fillRect(WORLD_W - w, y, 1, 1);
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
    const px = right ? WORLD_W - 1 - x : x;
    g.fillRect(px, y, 1, 1);
    if (i % 9 === 4) g.fillRect(right ? px - 2 : px + 1, y, 2, 1); // frond
  }
}

/** Round bumps scattered along the reef line: pebbles and small coral polyps. */
function bumps(g: G, rand: () => number, profile: number[], right: boolean, tone: number): void {
  g.fillStyle(tone, 1);
  for (let i = 0; i < 22; i++) {
    const y = Math.round(rand() * (LAYER_H - 1));
    const edge = profile[y] ?? 0;
    if (edge < 4) continue;
    const x = Math.round(rand() * (edge - 3));
    const s = 1 + Math.round(rand() * 1.4);
    g.fillRect(right ? WORLD_W - 1 - x - s : x, y, s, s);
  }
}

/**
 * One parallax layer. `layer` 0 is the farthest (parallax 0.2) and the palest; 2 is the nearest.
 * Tones are mixed toward the water so the layers read as haze-blued reef rather than as black rock.
 */
export function buildReefLayer(scene: Phaser.Scene, key: string, zone: number, layer: number, p: ZonePalette): void {
  if (scene.textures.exists(key)) return;
  const rand = mulberry32(zone * 131 + layer * 37 + 11);
  const reach = MAX_REACH[layer] ?? 20;
  // The reef is GREEN, not grey: mixing toward rock is what made the old layers read as walls. The
  // far layer is barely more than tinted water; the near one carries the coral warmth.
  const haze = 0.3 + layer * 0.16;
  const body = mixColor(p.waterBottom, p.kelp, haze);
  const rim = mixColor(body, mixColor(p.foam, p.coral, 0.35), 0.3 + layer * 0.12);
  const kelpTone = mixColor(p.kelp, p.waterTop, 0.3 - layer * 0.1);
  const bumpTone = mixColor(p.coral, p.waterBottom, 0.5 - layer * 0.16);

  const g = gfx(scene);
  for (const right of [false, true]) {
    const profile = coralProfile(rand, reach);
    paintEdge(g, profile, right, body, rim);
    bumps(g, rand, profile, right, bumpTone);
    kelpCurve(g, rand, right, reach, kelpTone);
    if (layer > 0) kelpCurve(g, rand, right, reach, kelpTone);
  }
  commit(scene, g, key, WORLD_W, LAYER_H);
}

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
