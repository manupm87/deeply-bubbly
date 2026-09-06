/**
 * Depth ribbon (GDD §8): an 8 px vertical band on the right with the zone marks of the ZONES table,
 * a fish marker at the current depth, a grey record tick and the localised metre counter. The
 * counter is smoothed to at most DEPTH_COUNTER_MAX_STEP_M per frame because metres per pixel change
 * 11× between zones and an unsmoothed reading is illegible in Z6.
 */
import type Phaser from 'phaser';
import type { HudData, Tuning } from '@deeply-bubbly/core';
import { DEFAULT_TUNING, WORLD_BOTTOM_PX, ZONES, metersToPx } from '@deeply-bubbly/core';
import { UI } from '../palette';
import type { HudLayout } from './layout';
import { formatMeters, pixelText } from './text';
import { TEX, ensureUiTextures } from './uiTextures';

const RIBBON_W = 8;

export class DepthMeter {
  private readonly tuningOf: () => Tuning;
  private readonly ribbon: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly fish: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.Text;
  private layoutRef: HudLayout;
  private shownM = 0;
  private lastLabel = '';
  private lastRecordM = -1;
  /** Last integer metre already formatted: `Intl.NumberFormat` must not run 60×/s to be discarded. */
  private lastRounded = -1;

  constructor(scene: Phaser.Scene, layout: HudLayout, tuningOf: () => Tuning = () => DEFAULT_TUNING) {
    ensureUiTextures(scene);
    this.tuningOf = tuningOf;
    this.layoutRef = layout;
    this.ribbon = scene.add.graphics();
    this.marks = scene.add.graphics();
    this.fish = scene.add.image(0, 0, TEX.fish);
    this.fish.setOrigin(1, 0.5);
    this.fish.setTint(UI.amber);
    this.text = pixelText(scene, {
      x: 0,
      y: 0,
      text: '',
      size: 10,
      zoom: layout.zoom,
      color: UI.white,
      originX: 1,
      originY: 0,
    });
    this.layout(layout);
  }

  private get ribbonX(): number {
    return this.layoutRef.viewW - this.layoutRef.margin - RIBBON_W;
  }

  /**
   * The ribbon starts BELOW the top band (§8: "banda superior ≤ 12 % de H", `HudLayout.bandH`), which
   * is where the metre counter lives. That is the one number the band budget really governs here — a
   * vertical depth scale cannot live inside a 12 % band — and it also ends the counter/fish overlap.
   */
  private get ribbonTop(): number {
    return this.layoutRef.top + this.layoutRef.bandH;
  }

  private get ribbonH(): number {
    return Math.max(24, this.layoutRef.thumbY - 6 - this.ribbonTop);
  }

  layout(layout: HudLayout): void {
    this.layoutRef = layout;
    this.text.setPosition(layout.viewW - layout.margin, layout.top);
    this.drawRibbon();
    this.lastRecordM = -1;
  }

  /** Static part: panel, outline and zone marks. */
  private drawRibbon(): void {
    const x = this.ribbonX;
    const y = this.ribbonTop;
    const h = this.ribbonH;
    this.ribbon.clear();
    this.ribbon.fillStyle(UI.panel, 0.55);
    this.ribbon.fillRect(x, y, RIBBON_W, h);
    this.ribbon.lineStyle(1, UI.cyan, 0.5);
    this.ribbon.strokeRect(x + 0.5, y + 0.5, RIBBON_W - 1, h - 1);
    for (const zone of ZONES) {
      if (zone.startPx <= 0) continue;
      const my = y + Math.round((zone.startPx / WORLD_BOTTOM_PX) * h);
      this.ribbon.fillStyle(UI.cyan, 0.35);
      this.ribbon.fillRect(x, my, RIBBON_W, 1);
    }
  }

  /** Ribbon y for a depth in metres. */
  private yFor(meters: number): number {
    const px = metersToPx(Math.max(0, meters));
    const f = Math.min(1, Math.max(0, px / WORLD_BOTTOM_PX));
    return this.ribbonTop + Math.round(f * this.ribbonH);
  }

  sync(hud: HudData): void {
    const step = this.tuningOf().DEPTH_COUNTER_MAX_STEP_M;
    const target = Number.isFinite(hud.depthM) ? Math.max(0, hud.depthM) : 0;
    const delta = target - this.shownM;
    this.shownM += Math.max(-step, Math.min(step, delta));

    const rounded = Math.round(this.shownM);
    if (rounded !== this.lastRounded) {
      this.lastRounded = rounded;
      const label = formatMeters(rounded);
      if (label !== this.lastLabel) {
        this.lastLabel = label;
        this.text.setText(label);
      }
    }

    this.fish.setPosition(this.ribbonX - 1, this.yFor(this.shownM));

    if (hud.bestDepthM !== this.lastRecordM) {
      this.lastRecordM = hud.bestDepthM;
      this.marks.clear();
      if (hud.bestDepthM > 0) {
        this.marks.fillStyle(UI.dim, 0.9);
        this.marks.fillRect(this.ribbonX - 2, this.yFor(hud.bestDepthM), RIBBON_W + 4, 1);
      }
    }
  }

  setVisible(value: boolean): void {
    this.ribbon.setVisible(value);
    this.marks.setVisible(value);
    this.fish.setVisible(value);
    this.text.setVisible(value);
  }

  destroy(): void {
    this.ribbon.destroy();
    this.marks.destroy();
    this.fish.destroy();
    this.text.destroy();
  }
}
