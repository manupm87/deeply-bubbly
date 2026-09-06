/**
 * Low-level pixel-art primitives shared by every texture builder and by the per-entity Graphics of
 * `EntityViews`. Nothing here knows about the game: it rasterises discs, rings and dithered rects at
 * integer coordinates so no edge is ever anti-aliased.
 */
import * as Phaser from 'phaser';

export type G = Phaser.GameObjects.Graphics;

/** A Graphics that is NOT on the display list; used only as a canvas for `generateTexture`. */
export const gfx = (scene: Phaser.Scene): G => new Phaser.GameObjects.Graphics(scene);

/** Bakes `g` into texture `key` (replacing any previous one) and disposes of it. */
export function commit(scene: Phaser.Scene, g: G, key: string, w: number, h: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  g.generateTexture(key, w, h);
  g.destroy();
}

export const hexOf = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Filled disc, integer rows only so the edge stays crisp.
 *
 * A pixel belongs to the disc when its distance ROUNDS to `r` or less. The naive `sqrt(r*r - y*y)`
 * test collapses the last row to a single pixel, which is what turned every small circle in the game
 * into a plus sign or a gear; this convention keeps a 3 px bubble round.
 */
export function pxDisc(g: G, cx: number, cy: number, r: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  const ri = Math.round(r);
  const edge = (ri + 0.5) * (ri + 0.5);
  for (let y = -ri; y <= ri; y++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, edge - y * y)));
    g.fillRect(cx - dx, cy + y, dx * 2 + 1, 1);
  }
}

/** 1 px outline of the same disc: the pixels whose distance rounds to exactly `r`. */
export function pxRing(g: G, cx: number, cy: number, r: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  const ri = Math.round(r);
  const outer = (ri + 0.5) * (ri + 0.5);
  const inner = (ri - 0.5) * (ri - 0.5);
  for (let y = -ri; y <= ri; y++) {
    const hi = Math.floor(Math.sqrt(Math.max(0, outer - y * y)));
    const lo = Math.ceil(Math.sqrt(Math.max(0, inner - y * y)));
    if (lo > hi) continue;
    g.fillRect(cx - hi, cy + y, hi - lo + 1, 1);
    g.fillRect(cx + lo, cy + y, hi - lo + 1, 1);
  }
}

/**
 * Two-tone checker dithering (SHELL.md): the only shading technique in the game. `phase` shifts the
 * checker so neighbouring rects do not line up into a visible grid.
 */
export function pxDither(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  a: number,
  b: number,
  alpha = 1,
  phase = 0,
): void {
  g.fillStyle(a, alpha);
  g.fillRect(x, y, w, h);
  g.fillStyle(b, alpha);
  for (let j = 0; j < h; j++) {
    for (let i = (j + phase) % 2; i < w; i += 2) g.fillRect(x + i, y + j, 1, 1);
  }
}

/** Symmetric spike ring (erizo, anemone crown): `n` 1 px spikes of length `len` around a centre. */
export function pxSpikes(g: G, cx: number, cy: number, r: number, len: number, n: number, color: number): void {
  g.fillStyle(color, 1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let s = 0; s < len; s++) {
      g.fillRect(Math.round(cx + dx * (r + s)), Math.round(cy + dy * (r + s)), 1, 1);
    }
  }
}

const lerpChannel = (a: number, b: number, t: number, shift: number): number =>
  Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t) << shift;

/** Linear blend of two 0xRRGGBB colours. The only way art code is allowed to invent a tone. */
export const mixColor = (a: number, b: number, t: number): number =>
  lerpChannel(a, b, t, 16) | lerpChannel(a, b, t, 8) | lerpChannel(a, b, t, 0);

/** Deterministic PRNG so every procedural silhouette is identical across sessions and screenshots. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
