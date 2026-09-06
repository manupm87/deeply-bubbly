/**
 * Charge indicator (GDD §8): a ring around Bur that fills 0 → 360°, whose THICKNESS is the ±15 % drag
 * fine tune, that turns pulsing amber on overcharge and blinks soft red on the last pip. One of the
 * three redundant channels for the same number (the other two are her squash and the dotted arc).
 *
 * Pure UI: it uses the reserved UI colours only, and it never draws over the trajectory (§7 golden rule).
 */
import type * as Phaser from 'phaser';
import type { WorldSnapshot } from '@deeply-bubbly/core';
import { UI } from '../palette';
import { DEPTH } from './depth';

/** Gap between Bur's silhouette and the ring, in design px. */
const GAP = 4;
const MIN_THICKNESS = 1;
const MAX_THICKNESS = 3;
/** Length (px) of the tick that says WHICH WAY the drag fine tune is pulling. */
const TICK = 2;

export class ChargeRing {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.chargeRing);
  }

  update(snapshot: WorldSnapshot): void {
    const g = this.g;
    g.clear();
    const hud = snapshot.hud;
    const b = snapshot.bubble;
    if (b.state !== 'CHARGING' || hud.chargePower <= 0) return;

    const radius = Math.max(6, b.radius + GAP);
    // Whole pixels only: a fractional stroke width is an anti-aliased edge in a pixel-art game.
    const thickness = Math.round(
      MIN_THICKNESS + Math.min(1, Math.abs(hud.fineTune)) * (MAX_THICKNESS - MIN_THICKNESS),
    );
    const t = snapshot.timeMs;

    // White by default: the UI cyan is barely a shade away from the Z1 water (#3fc1c9 / #1f7a8c) and
    // the gauge stopped reading as a gauge. Amber and soft red keep their §8 meanings.
    let colour: number = UI.white;
    let alpha = 0.95;
    if (hud.lastPip) {
      // Soft red blink: on the last pip overcharge stops draining, and the ring says so (§2.2).
      colour = UI.softRed;
      alpha = 0.5 + 0.5 * Math.abs(Math.sin(t / 140));
    } else if (hud.overcharging) {
      colour = UI.amber;
      alpha = 0.55 + 0.45 * Math.abs(Math.sin(t / 110));
    }

    // Track FIRST: Phaser Graphics paints in command order, so a track stroked afterwards would sit
    // on top of the fill along its whole length and erase the one cue that says "how full".
    g.lineStyle(1, UI.panel, 0.75);
    g.strokeCircle(b.pos.x, b.pos.y, radius);
    g.lineStyle(1, UI.dim, 0.45);
    g.strokeCircle(b.pos.x, b.pos.y, radius + 1);

    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * Math.min(1, hud.chargePower);
    g.lineStyle(thickness, colour, alpha);
    g.beginPath();
    g.arc(b.pos.x, b.pos.y, radius, start, end, false);
    g.strokePath();

    this.drawFineTuneTick(b.pos.x, b.pos.y, radius, hud.fineTune, colour, alpha);
  }

  /**
   * The thickness carries the MAGNITUDE of the ±15 % drag fine tune but not its sign, so −15 % and
   * +15 % looked identical. A tick outside the ring points to the side being pulled: left = weaker
   * (drag shorter than neutral), right = stronger.
   */
  private drawFineTuneTick(x: number, y: number, radius: number, fineTune: number, colour: number, alpha: number): void {
    if (Math.abs(fineTune) < 0.02) return;
    const dir = fineTune > 0 ? 1 : -1;
    const from = Math.round(x + dir * (radius + 2));
    this.g.fillStyle(colour, alpha);
    this.g.fillRect(dir > 0 ? from : from - TICK, Math.round(y), TICK, 1);
  }

  destroy(): void {
    this.g.destroy();
  }
}
