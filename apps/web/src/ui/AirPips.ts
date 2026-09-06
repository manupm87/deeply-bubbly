/**
 * Air pips (GDD §8): 6×6 bubbles at the top-left. Pips beyond the zone capacity are drawn dimmed,
 * the whole row blinks soft red on the last pip, and every air change spawns a one-shot ghost pip.
 * No rule lives here: the counts come straight from HudData.
 */
import type Phaser from 'phaser';
import type { GameEvent, HudData } from '@deeply-bubbly/core';
import { UI } from '../palette';
import type { HudLayout } from './layout';
import { TEX, ensureUiTextures } from './uiTextures';

const PIP = 6;
const GAP = 2;
const MAX_PIPS = 12;
/** Soft red blink: full cycle in ms. */
const BLINK_MS = 900;

export class AirPips {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private layoutRef: HudLayout;
  private lastAir = -1;
  private lastMax = -1;
  private lastBase = -1;
  private lastPipMode = false;

  constructor(scene: Phaser.Scene, layout: HudLayout) {
    this.scene = scene;
    this.layoutRef = layout;
    ensureUiTextures(scene);
    this.root = scene.add.container(0, 0);
    for (let i = 0; i < MAX_PIPS; i++) {
      const img = scene.add.image(i * (PIP + GAP), 0, TEX.pip);
      img.setOrigin(0, 0);
      img.setVisible(false);
      this.images.push(img);
      this.root.add(img);
    }
    this.layout(layout);
  }

  layout(layout: HudLayout): void {
    this.layoutRef = layout;
    this.root.setPosition(layout.margin, layout.top);
  }

  /** Redraws only when the counts change; the blink runs every frame. */
  sync(hud: HudData, timeMs: number): void {
    const base = Math.max(0, Math.min(MAX_PIPS, Math.round(hud.airMaxBase)));
    const max = Math.max(0, Math.min(base, Math.round(hud.airMax)));
    const air = Math.max(0, Math.min(base, Math.round(hud.air)));
    if (air !== this.lastAir || max !== this.lastMax || base !== this.lastBase || hud.lastPip !== this.lastPipMode) {
      this.lastAir = air;
      this.lastMax = max;
      this.lastBase = base;
      this.lastPipMode = hud.lastPip;
      this.redraw(air, max, base, hud.lastPip);
    }
    if (hud.lastPip) {
      const phase = (timeMs % BLINK_MS) / BLINK_MS;
      const alpha = 0.5 + 0.5 * Math.abs(Math.sin(phase * Math.PI));
      const first = this.images[0];
      if (first && first.visible) first.setAlpha(alpha);
    }
  }

  private redraw(air: number, max: number, base: number, lastPip: boolean): void {
    for (let i = 0; i < this.images.length; i++) {
      const img = this.images[i];
      if (!img) continue;
      if (i >= base) {
        img.setVisible(false);
        continue;
      }
      img.setVisible(true);
      if (i < air) {
        img.setTexture(TEX.pip);
        img.setTint(lastPip ? UI.softRed : UI.white);
        img.setAlpha(1);
      } else if (i < max) {
        img.setTexture(TEX.pipEmpty);
        img.setTint(UI.cyan);
        img.setAlpha(0.8);
      } else {
        img.setTexture(TEX.pipEmpty);
        img.setTint(UI.dim);
        img.setAlpha(0.45);
      }
    }
  }

  /** Air changes get a short ghost pip so the loss/gain is visible without moving the row. */
  handleEvent(event: GameEvent): void {
    if (event.type === 'airLost') this.pop(Math.max(0, Math.round(event.air)), UI.softRed, 3);
    else if (event.type === 'airGained') this.pop(Math.max(0, Math.round(event.air) - 1), UI.white, -3);
  }

  private pop(index: number, tint: number, dy: number): void {
    if (index < 0 || index >= MAX_PIPS) return;
    const x = this.layoutRef.margin + index * (PIP + GAP);
    const ghost = this.scene.add.image(x, this.layoutRef.top, TEX.pip);
    ghost.setOrigin(0, 0);
    ghost.setTint(tint);
    this.scene.tweens.add({
      targets: ghost,
      y: this.layoutRef.top + dy,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => ghost.destroy(),
    });
  }

  setVisible(value: boolean): void {
    this.root.setVisible(value);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
