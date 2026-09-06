/**
 * HUD layout in DESIGN px. Nothing here is an absolute pixel budget: every vertical measure is a
 * fraction of the visible height (GDD §8), so a 320 px and a 420 px view lay out identically.
 */
import type { ScaleState } from '../context';

export interface HudLayout {
  /** Integer zoom of the HUD camera (design px → css px). */
  zoom: number;
  viewW: number;
  viewH: number;
  /** First usable y: below the notch / status bar. */
  top: number;
  /** Height of the top band; never more than 12 % of the view. */
  bandH: number;
  /** Horizontal margin. */
  margin: number;
  /** Minimum touch target in design px (44 css pt). */
  touch: number;
  /** y where the always-clear bottom third begins (the thumb lives below it). */
  thumbY: number;
}

/** Top band budget (GDD §8). */
export const BAND_FRACTION = 0.12;

let cachedInsetTopCss: number | null = null;

/**
 * Reads env(safe-area-inset-top) once through a probe element. CSS env() cannot be read from JS
 * directly, so the value is parked in a padding and read back through getComputedStyle.
 */
export function safeAreaInsetTopCss(): number {
  if (cachedInsetTopCss !== null) return cachedInsetTopCss;
  let value = 0;
  if (typeof document !== 'undefined') {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);';
    document.body.appendChild(probe);
    const parsed = Number.parseFloat(getComputedStyle(probe).paddingTop);
    if (Number.isFinite(parsed)) value = parsed;
    probe.remove();
  }
  cachedInsetTopCss = value;
  return value;
}

/** Test seam: forces the cached inset (also used to invalidate it). */
export function setSafeAreaInsetTopCss(value: number | null): void {
  cachedInsetTopCss = value;
}

/**
 * The HUD is pushed below the inset. If the inset eats more than the band budget the HUD still goes
 * down and the world is cropped at the top, never the other way round (GDD §8).
 */
export function computeLayout(scale: ScaleState): HudLayout {
  const zoom = Math.max(1, Math.round(scale.zoom));
  const viewW = scale.viewW;
  const viewH = scale.viewH;
  const insetDesign = Math.max(0, (safeAreaInsetTopCss() - scale.offsetY) / zoom);
  const top = Math.round(Math.min(insetDesign, viewH * 0.25)) + 3;
  return {
    zoom,
    viewW,
    viewH,
    top,
    bandH: Math.round(viewH * BAND_FRACTION),
    margin: 4,
    touch: 44 / zoom,
    thumbY: Math.round(viewH * (2 / 3)),
  };
}
