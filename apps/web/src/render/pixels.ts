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

/** Midpoint-rasterised filled disc: integer rows only, so the edge stays crisp. */
export function pxDisc(g: G, cx: number, cy: number, r: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  const ri = Math.round(r);
  for (let y = -ri; y <= ri; y++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, ri * ri - y * y)));
    g.fillRect(cx - dx, cy + y, dx * 2 + 1, 1);
  }
}

/** 1 px outline of a raster disc (disc r minus disc r-1). */
export function pxRing(g: G, cx: number, cy: number, r: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  const ri = Math.round(r);
  for (let y = -ri; y <= ri; y++) {
    const outer = Math.floor(Math.sqrt(Math.max(0, ri * ri - y * y)));
    const inner = Math.floor(Math.sqrt(Math.max(0, (ri - 1) * (ri - 1) - y * y)));
    if (Math.abs(y) >= ri - 1) {
      g.fillRect(cx - outer, cy + y, outer * 2 + 1, 1);
    } else {
      g.fillRect(cx - outer, cy + y, outer - inner, 1);
      g.fillRect(cx + inner + 1, cy + y, outer - inner, 1);
    }
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
