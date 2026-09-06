/**
 * Pull gauge (GDD §8, DECISIONS-v1.2 D2): a ring around Bur that fills 0 → 360° with how far the sling
 * is drawn, shows EMPTY inside the cancel radius, turns amber when the pull asks for a direction Bur
 * cannot take, and blinks soft red on the last pip. One of the three redundant channels for the same
 * number (the other two are her squash and the dotted arc).
 *
 * Pure UI: it uses the reserved UI colours only, and it never draws over the trajectory (§7 golden rule).
 */
import type * as Phaser from 'phaser';
import type { WorldSnapshot } from '@deeply-bubbly/core';
import { UI } from '../palette';
import { DEPTH } from './depth';

/** Gap between Bur's silhouette and the ring, in design px. */
const GAP = 4;
/** Whole pixels only: a fractional stroke width is an anti-aliased edge in a pixel-art game. */
const THICKNESS = 2;

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
    // Drawn for the WHOLE gesture, zero power included: D2 asks the ring to show empty while the
    // finger is inside the cancel radius, which is how the player sees "aquí no hay tiro".
    // `aimOrigin`, not the state: a rest capture parks a live aim in RESTING for one step (core's
    // `enterRest`), and the three power channels must not blink out under a finger that never moved.
    if (b.aimOrigin === null) return;

    const radius = Math.max(6, b.radius + GAP);
    const t = snapshot.timeMs;

    // White by default: the UI cyan is barely a shade away from the Z1 water (#3fc1c9 / #1f7a8c) and
    // the gauge stopped reading as a gauge. Amber and soft red keep their §8 meanings.
    let colour: number = UI.white;
    let alpha = 0.95;
    if (hud.lastPip) {
      colour = UI.softRed;
      alpha = 0.5 + 0.5 * Math.abs(Math.sin(t / 140));
    } else if (!b.aimValid) {
      // D2: the pull is asking Bur to go up, and the shot was clamped to the horizontal. Same amber
      // the guide is painted in, so the two cues say one thing.
      colour = UI.amber;
      alpha = 0.55 + 0.45 * Math.abs(Math.sin(t / 110));
    }

    // Track FIRST: Phaser Graphics paints in command order, so a track stroked afterwards would sit
    // on top of the fill along its whole length and erase the one cue that says "how full".
    g.lineStyle(1, UI.panel, 0.75);
    g.strokeCircle(b.pos.x, b.pos.y, radius);
    g.lineStyle(1, UI.dim, 0.45);
    g.strokeCircle(b.pos.x, b.pos.y, radius + 1);

    // Inside the cancel radius the track is all there is: an empty ring, and no arc to promise a shot
    // the release is going to refuse.
    if (hud.cancelZone || hud.power <= 0) return;

    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * Math.min(1, hud.power);
    g.lineStyle(THICKNESS, colour, alpha);
    g.beginPath();
    g.arc(b.pos.x, b.pos.y, radius, start, end, false);
    g.strokePath();
  }

  destroy(): void {
    this.g.destroy();
  }
}
