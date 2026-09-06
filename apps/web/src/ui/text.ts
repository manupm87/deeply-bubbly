/**
 * Text helper for the HUD. There is no bitmap font asset (and '"Press Start 2P"' is not available
 * offline), so we use the system monospace stack at pixel sizes and bake the glyph texture at the
 * resolution it will actually be shown at.
 *
 * That resolution is `zoom × devicePixelRatio`, not the zoom alone: on a phone whose window is short
 * enough for the design zoom to collapse to 1 (§8's `min(floor(w/180), floor(h/320))`), a 10 px glyph
 * baked at resolution 1 and then blown up by a 3× device ratio turned the smaller letters into solid
 * blocks. The cap keeps the texture sane on a 4× display.
 */
import type Phaser from 'phaser';
import { css } from '../palette';
import { strings } from './strings';

export const MONO_FAMILY =
  'ui-monospace, "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace';

/** Only three sizes exist in the whole HUD; anything else breaks the pixel rhythm. */
export type TextSize = 8 | 10 | 12;

export interface PixelTextConfig {
  x: number;
  y: number;
  text: string;
  /** Design px. Default 8. */
  size?: TextSize;
  /** 0xRRGGBB. Default white. */
  color?: number;
  /** Origin, default top-left. */
  originX?: number;
  originY?: number;
  /** Integer zoom of the HUD camera; used as the text resolution. */
  zoom: number;
  alpha?: number;
}

/** Creates a Text object already positioned, coloured and resolution-matched to the zoom. */
export function pixelText(scene: Phaser.Scene, cfg: PixelTextConfig): Phaser.GameObjects.Text {
  const size: TextSize = cfg.size ?? 8;
  const text = scene.add.text(cfg.x, cfg.y, cfg.text, {
    fontFamily: MONO_FAMILY,
    fontSize: `${size}px`,
    color: css(cfg.color ?? 0xffffff),
    align: 'center',
  });
  text.setResolution(textResolution(cfg.zoom));
  text.setOrigin(cfg.originX ?? 0, cfg.originY ?? 0);
  if (cfg.alpha !== undefined) text.setAlpha(cfg.alpha);
  return text;
}

/** Upper bound on the baked resolution: beyond this the texture cost stops buying legibility. */
const MAX_TEXT_RESOLUTION = 8;

/** Device pixels per design pixel for a text drawn at `zoom`, clamped to something sane. */
export function textResolution(zoom: number): number {
  const dpr = typeof globalThis.devicePixelRatio === 'number' && globalThis.devicePixelRatio > 0 ? globalThis.devicePixelRatio : 1;
  const wanted = Math.round(Math.max(1, zoom) * dpr);
  return Math.min(MAX_TEXT_RESOLUTION, Math.max(1, wanted));
}

let formatter: Intl.NumberFormat | null = null;

function numberFormat(): Intl.NumberFormat {
  if (formatter === null) {
    const locale = typeof navigator === 'undefined' ? 'es' : navigator.language;
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  }
  return formatter;
}

/** Localised depth reading, e.g. "1.284 m" in es-ES and "1,284 m" in en-US. */
export function formatMeters(m: number): string {
  const safe = Number.isFinite(m) ? Math.max(0, m) : 0;
  return `${numberFormat().format(Math.round(safe))} ${strings().metres}`;
}
