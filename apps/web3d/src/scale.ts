/**
 * Viewport scaling: fixed 180 px design width, elastic height (GDD §8), like `apps/web/src/scale.ts`.
 *
 * One deliberate difference: the zoom may be fractional. §8's integer rule exists to protect
 * nearest-neighbour pixel art; here it would only cost a phone its side bars. The visible height keeps
 * the same `clamp(h / zoom, 320, 420)`, so the design view the rules are written against is unchanged.
 */
import { DEFAULT_TUNING } from '@deeply-bubbly/core';
import type { ScaleState } from './context';

export const DESIGN_W = DEFAULT_TUNING.VIEW_W;
export const MIN_VIEW_H = 320;
export const MAX_VIEW_H = 420;

export function computeScale(cssW: number, cssH: number): ScaleState {
  const w = Math.max(1, Math.floor(cssW));
  const h = Math.max(1, Math.floor(cssH));
  const zoom = Math.min(w / DESIGN_W, h / MIN_VIEW_H);
  const viewH = Math.min(MAX_VIEW_H, Math.max(MIN_VIEW_H, Math.floor(h / zoom)));
  const offsetX = Math.max(0, Math.floor((w - DESIGN_W * zoom) / 2));
  const offsetY = Math.max(0, Math.floor((h - viewH * zoom) / 2));
  return { zoom, viewW: DESIGN_W, viewH, offsetX, offsetY };
}
