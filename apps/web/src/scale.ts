/**
 * Integer-zoom scaling (SHELL.md "Escalado", GDD §8): fixed 180 px design width, elastic height.
 *
 * The whole shell works in DESIGN px. This module is the only place that knows about css pixels:
 * it turns a canvas size into a `ScaleState` and lays the Phaser cameras out from it.
 */
import * as Phaser from 'phaser';
import { DEFAULT_TUNING } from '@deeply-bubbly/core';
import type { GameContext, ScaleState } from './context';

/**
 * Fixed design width of the VIEWPORT (GDD §8 / tuning.VIEW_W). Since D3 the WORLD is three of these
 * wide (`WORLD_W = 540`) and the camera scrolls across it, so this number sizes the letterbox and the
 * HUD, never the world.
 */
export const DESIGN_W = DEFAULT_TUNING.VIEW_W;
export const MIN_VIEW_H = 320;
export const MAX_VIEW_H = 420;

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * `zoom = max(1, min(floor(w / 180), floor(h / 320)))` — always an integer, never below 1, and never so
 * large that the visible height would drop under 320 design px. The visible height is then
 * `clamp(floor(h / zoom), 320, 420)`: on tall screens you see MORE world downward, never less.
 */
export function computeScale(cssW: number, cssH: number): ScaleState {
  const w = Math.max(1, Math.floor(cssW));
  const h = Math.max(1, Math.floor(cssH));
  const zoom = Math.max(1, Math.min(Math.floor(w / DESIGN_W), Math.floor(h / MIN_VIEW_H)));
  const viewH = clampInt(Math.floor(h / zoom), MIN_VIEW_H, MAX_VIEW_H);
  const offsetX = Math.max(0, Math.floor((w - DESIGN_W * zoom) / 2));
  const offsetY = Math.max(0, Math.floor((h - viewH * zoom) / 2));
  return { zoom, viewW: DESIGN_W, viewH, offsetX, offsetY };
}

/**
 * Places a camera so that world coordinates `(leftX..leftX+viewW, topY..topY+viewH)` fill the
 * letterboxed area. `leftX` is `snapshot.camera.renderX` (D3 + D5): the world is wider than the view,
 * and what the shell places is always the camera as DRAWN — the peek included.
 *
 * `setScroll` alone is wrong once `zoom > 1`: Phaser centres `worldView` on `scroll + size/2` and then
 * divides by the zoom, so the top-left of the view drifts by `size * (zoom - 1) / (2 * zoom)`.
 * `centerOn` states the intent directly and is exact at every zoom.
 */
export function layoutCamera(
  cam: Phaser.Cameras.Scene2D.Camera,
  s: ScaleState,
  topY = 0,
  leftX = 0,
): void {
  cam.setViewport(s.offsetX, s.offsetY, s.viewW * s.zoom, s.viewH * s.zoom);
  cam.setZoom(s.zoom);
  cam.setRoundPixels(true);
  cam.centerOn(leftX + s.viewW / 2, topY + s.viewH / 2);
}

/**
 * Scroll an already laid-out camera so `(leftX, topY)` is the world position of its top-left corner.
 * The zoom is re-asserted every frame — and it is ALWAYS the integer design zoom (§8): nothing in the
 * shell may scale the world by a fraction, or nearest-neighbour sampling stops landing on whole pixels.
 */
export function scrollCameraTo(
  cam: Phaser.Cameras.Scene2D.Camera,
  s: ScaleState,
  topY: number,
  leftX = 0,
): void {
  cam.setZoom(s.zoom);
  cam.centerOn(leftX + s.viewW / 2, topY + s.viewH / 2);
}

/**
 * Recomputes `ctx.scale` on every canvas resize, tells the world its new visible height and re-lays out
 * the camera of every running scene. Emits `'scaleChanged'` on the bus so scenes can re-flow their HUD.
 * Returns a detach function.
 */
export function attachResize(game: Phaser.Game, ctx: GameContext): () => void {
  const apply = (): void => {
    const next = computeScale(game.scale.gameSize.width, game.scale.gameSize.height);
    // Mutated in place: every module holds the same `ctx.scale` reference.
    Object.assign(ctx.scale, next);
    ctx.world.setViewHeight(next.viewH);
    // D3: the world is WORLD_W wide and the camera clamps its follow to `[0, WORLD_W - viewW]`, so
    // core has to be told how wide the view actually is — it is a constant today, but the clamp is
    // core's and the number is the shell's.
    ctx.world.setViewWidth(next.viewW);
    for (const scene of game.scene.getScenes(true)) {
      const cam = scene.cameras?.main;
      if (cam) layoutCamera(cam, next);
    }
    ctx.bus.emit('scaleChanged', ctx.scale);
  };

  game.scale.on(Phaser.Scale.Events.RESIZE, apply);
  apply();
  return () => {
    game.scale.off(Phaser.Scale.Events.RESIZE, apply);
  };
}
