/**
 * Resaca warning (GDD §2.4.2: "1,6 s de aviso con flecha y silbido"). When Bur drifts above the top of
 * the view core opens a grace window and emits `resacaWarning`; from the player's seat she is simply
 * GONE, and without this the pip she is about to lose has no cause on screen.
 *
 * It draws an amber arrow at the top edge pointing at her, blinking, plus the metres she is off-screen
 * as a bare number. It owns no rule: the window it lives inside is `bubble.flags.resacaUntil`, and the
 * whistle is Audio's half of the same event.
 */
import type Phaser from 'phaser';
import type { WorldSnapshot } from '@deeply-bubbly/core';
import { UI } from '../palette';
import type { HudLayout } from './layout';

const BLINK_MS = 220;
const ARROW_W = 9;
const ARROW_H = 7;

export class ResacaWarning {
  private readonly g: Phaser.GameObjects.Graphics;
  private layoutRef: HudLayout;
  private visible = false;

  constructor(scene: Phaser.Scene, layout: HudLayout) {
    this.layoutRef = layout;
    this.g = scene.add.graphics();
    this.g.setVisible(false);
  }

  layout(layout: HudLayout): void {
    this.layoutRef = layout;
  }

  /** Driven by the snapshot, not by the event: the window closes on its own when Bur comes back. */
  sync(snapshot: WorldSnapshot, hidden: boolean): void {
    const until = snapshot.bubble.flags.resacaUntil;
    const on = !hidden && until > 0 && snapshot.timeMs < until;
    if (!on) {
      if (this.visible) {
        this.visible = false;
        this.g.clear();
        this.g.setVisible(false);
      }
      return;
    }
    this.visible = true;
    this.g.setVisible(true);
    this.draw(snapshot);
  }

  private draw(snapshot: WorldSnapshot): void {
    const l = this.layoutRef;
    const above = snapshot.bubble.pos.y < snapshot.camera.renderY;
    // Viewport px: Bur's world x is up to WORLD_W (D3), the arrow lives on the 180 px HUD column.
    const burX = snapshot.bubble.pos.x - snapshot.camera.renderX;
    const x = Math.round(Math.min(l.viewW - 8, Math.max(8, burX)));
    const y = above ? l.top + l.bandH + 6 : Math.round(l.viewH * 0.62);
    const dir = above ? -1 : 1;
    const alpha = 0.45 + 0.55 * Math.abs(Math.sin(snapshot.timeMs / BLINK_MS));

    this.g.clear();
    this.g.fillStyle(UI.amber, alpha);
    // Solid triangle + stem: readable at 1 px and distinguishable from every world silhouette.
    for (let i = 0; i < ARROW_H; i++) {
      const w = Math.max(1, Math.round(((ARROW_H - i) / ARROW_H) * ARROW_W));
      this.g.fillRect(x - Math.floor(w / 2), y + dir * i, w, 1);
    }
    // Stem on the far side of the base, so the arrow reads as pointing away from the screen edge.
    this.g.fillRect(x - 1, dir < 0 ? y + 1 : y - 5, 2, 5);
  }

  destroy(): void {
    this.g.destroy();
  }
}
