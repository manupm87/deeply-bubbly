/**
 * Debug-only surface of the shell. Everything here is inert unless this is a dev build or the page was
 * loaded with `?debug=1` — the same gate `main.ts` uses for the `__db` handle — so a plain production
 * load registers nothing, keeps no reference alive and pays nothing per frame.
 *
 * The button registry exists for the e2e suite: a test taps the REAL button by dispatching a touch at
 * the rect it actually occupies on screen, instead of reaching into the scene graph and calling the
 * callback behind it. Nothing in the game reads this module.
 */
import type Phaser from 'phaser';
import type { ScaleState } from './context';

/** What one registered button reports about itself, in DESIGN px. */
export interface DebugButtonInfo {
  id: string;
  label: string;
  /**
   * What the control IS, when its look is its meaning and the label cannot say it: a world-map node
   * reports 'locked' / 'available' / 'completed' / 'noContent' so a test can assert the state core
   * computed instead of reading pixels. Optional; ordinary buttons leave it out.
   */
  state?: string;
  /** Centre of the button in design px. */
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

/** The same rect converted to CSS px of the page, ready for a synthetic touch. */
export type DebugButtonRect = DebugButtonInfo;

export interface DebugButtonSource {
  debugInfo(): DebugButtonInfo;
}

let enabled: boolean | null = null;

/** Dev build, or `?debug=1`. Read once: the query string cannot change without a reload. */
export function debugEnabled(): boolean {
  if (enabled === null) {
    let flagged = false;
    try {
      flagged = new URLSearchParams(globalThis.location.search).has('debug');
    } catch {
      flagged = false;
    }
    enabled = import.meta.env.DEV || flagged;
  }
  return enabled;
}

const sources = new Set<DebugButtonSource>();

export function registerDebugButton(source: DebugButtonSource): void {
  if (!debugEnabled()) return;
  sources.add(source);
}

export function unregisterDebugButton(source: DebugButtonSource): void {
  sources.delete(source);
}

/** A game object is on screen only if it and every container above it are visible. */
export function effectivelyVisible(object: Phaser.GameObjects.Container): boolean {
  let node: Phaser.GameObjects.Container | null = object;
  while (node) {
    if (!node.visible) return false;
    node = node.parentContainer;
  }
  return true;
}

/**
 * Every live button, in CSS px of the page. The HUD camera maps design (0,0) to the top-left of the
 * letterboxed column, so the conversion is the same `offset + design × zoom` `scale.ts` lays out with.
 */
export function debugButtons(scale: ScaleState): DebugButtonRect[] {
  const out: DebugButtonRect[] = [];
  for (const source of sources) {
    // A button whose scene was torn down without destroying it would throw here; a debug read must
    // never be the thing that breaks a test run, so it is simply dropped.
    let info: DebugButtonInfo;
    try {
      info = source.debugInfo();
    } catch {
      continue;
    }
    out.push({
      ...info,
      x: scale.offsetX + info.x * scale.zoom,
      y: scale.offsetY + info.y * scale.zoom,
      w: info.w * scale.zoom,
      h: info.h * scale.zoom,
    });
  }
  return out;
}
