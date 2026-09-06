/**
 * Base for every full-screen HUD overlay (station, fail, campaign, pause, title). Overlays fade in
 * over the frozen scene — there is no scene switch and no reload — and they swallow the pointer so
 * a tap on the overlay never reaches the world.
 */
import type Phaser from 'phaser';
import type { PointerInput } from '@deeply-bubbly/core';
import { UI } from '../palette';
import type { HudLayout } from './layout';

export interface Slot {
  /** Centre of the slot in design px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Bottom-third action row: the giant primary button under the thumb and, to its LEFT, the smaller
 * secondary slot reserved for the rewarded-video placeholders (GDD §8).
 *
 * `withSecondary` is false while that slot is hidden (a first death: "Segundo aliento" only appears
 * from the fourth failure, §6.5). The giant then CENTRES, instead of staying pinned right with 70 px
 * of empty dim beside it and the readouts above it centred on a different axis.
 */
export function bottomSlots(layout: HudLayout, withSecondary = true): { giant: Slot; slot: Slot } {
  const giantW = Math.round(layout.viewW * 0.58);
  const slotW = Math.round(layout.viewW * 0.31);
  const giantH = Math.min(48, Math.max(34, Math.round(layout.viewH * 0.1)));
  const y = Math.round(layout.viewH * 0.82);
  const giantX = withSecondary ? layout.viewW - layout.margin - giantW / 2 : layout.viewW / 2;
  return {
    giant: { x: giantX, y, w: giantW, h: giantH },
    slot: { x: layout.margin + slotW / 2, y, w: slotW, h: giantH - 6 },
  };
}

/**
 * The small secondary action, centred above the action row of `bottomSlots` and clear of its 44 pt
 * touch target: it must never be the button a thumb reaching for "Seguir bajando" lands on.
 */
export function secondarySlot(layout: HudLayout): { x: number; y: number; w: number; h: number } {
  return { x: Math.round(layout.viewW / 2), y: Math.round(layout.viewH * 0.68), w: 46, h: 16 };
}

export const FADE_MS = 220;

export class Overlay {
  readonly root: Phaser.GameObjects.Container;
  protected readonly scene: Phaser.Scene;
  protected layoutRef: HudLayout;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private shown = false;

  constructor(scene: Phaser.Scene, layout: HudLayout, pointer?: PointerInput, dimAlpha = 0.72) {
    this.scene = scene;
    this.layoutRef = layout;
    this.root = scene.add.container(0, 0);
    this.root.setVisible(false);
    this.dim = scene.add.rectangle(0, 0, layout.viewW, layout.viewH, UI.panel, dimAlpha);
    this.dim.setOrigin(0, 0);
    this.dim.setInteractive();
    // BOTH halves of the gesture: Phaser's globalTopOnly stops the HUD scene's captured pointer from
    // reaching GameScene, so a finger that went down on the world and came up over an overlay used to
    // leave `pointer.down` true — a charge that never ended — until the next button tap or a blur.
    const swallow = (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      event: Phaser.Types.Input.EventData,
    ): void => {
      event.stopPropagation();
      if (pointer) pointer.down = false;
    };
    this.dim.on('pointerdown', swallow);
    this.dim.on('pointerup', swallow);
    this.root.add(this.dim);
  }

  layout(layout: HudLayout): void {
    this.layoutRef = layout;
    this.dim.setSize(layout.viewW, layout.viewH);
    this.dim.setInteractive();
  }

  protected add(...objects: Phaser.GameObjects.GameObject[]): void {
    this.root.add(objects);
  }

  get visible(): boolean {
    return this.shown;
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.root.setVisible(true);
    this.root.setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: FADE_MS, ease: 'Quad.easeOut' });
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.scene.tweens.killTweensOf(this.root);
    this.root.setVisible(false);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy(true);
  }
}
