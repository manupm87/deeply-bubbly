/**
 * Top band of the HUD: air pips on the left, depth ribbon on the right. It owns nothing else —
 * screens, pause and tutorial are separate overlays — and it never touches the world.
 */
import type Phaser from 'phaser';
import type { GameEvent, Tuning, WorldSnapshot } from '@deeply-bubbly/core';
import { UI } from '../palette';
import { AirPips } from './AirPips';
import { DepthMeter } from './DepthMeter';
import type { HudLayout } from './layout';

export class Hud {
  /** Dark scrim under the band so a ledge can never drift behind the pips or the metre counter. */
  private readonly band: Phaser.GameObjects.Graphics;
  private readonly pips: AirPips;
  private readonly depth: DepthMeter;

  constructor(scene: Phaser.Scene, layout: HudLayout, tuningOf?: () => Tuning) {
    this.band = scene.add.graphics();
    this.pips = new AirPips(scene, layout);
    this.depth = new DepthMeter(scene, layout, tuningOf);
    this.drawBand(layout);
  }

  /**
   * The scrim MASKS the world; it does not merely tint it. At 0.34 alpha a rock slab and its cream
   * rest line sat one pip-height under pure-white pips at under 2:1 contrast — so the rows the band
   * actually holds (6 px pips, the 10 px counter) are OPAQUE, and only the 4 px below them fade out.
   * Still a thin strip, not a chrome bar, and well inside the §8 budget of 12 % of H.
   */
  private drawBand(layout: HudLayout): void {
    const solid = layout.top + 12;
    const fade = 5;
    this.band.clear();
    // Starts ABOVE the view: the game camera scrolls to a fractional world y, so it sits up to one
    // design px off the HUD camera and a sliver of ledge used to show along the very top row.
    this.band.fillStyle(UI.panel, 1);
    this.band.fillRect(0, -2, layout.viewW, solid + 2);
    for (let i = 0; i < fade; i++) {
      this.band.fillStyle(UI.panel, 1 - (i + 1) / (fade + 1));
      this.band.fillRect(0, solid + i, layout.viewW, 1);
    }
  }

  layout(layout: HudLayout): void {
    this.drawBand(layout);
    this.pips.layout(layout);
    this.depth.layout(layout);
  }

  sync(snapshot: WorldSnapshot): void {
    this.pips.sync(snapshot.hud, snapshot.timeMs);
    this.depth.sync(snapshot.hud);
  }

  handleEvent(event: GameEvent): void {
    this.pips.handleEvent(event);
  }

  setVisible(value: boolean): void {
    this.band.setVisible(value);
    this.pips.setVisible(value);
    this.depth.setVisible(value);
  }

  destroy(): void {
    this.band.destroy();
    this.pips.destroy();
    this.depth.destroy();
  }
}
