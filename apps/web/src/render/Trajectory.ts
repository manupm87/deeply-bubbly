/**
 * Dotted aim guide (GDD §2.7, §8). `snapshot.trajectory` is the arc core already predicted with the very
 * same integrator, exact until the first bounce; this module only samples it down to
 * `snapshot.trajectoryDots` points and fades them out. It predicts nothing.
 *
 * The guide goes dim amber when the aim is NOT being recalculated (§2.1: "la guía se pinta en ámbar
 * tenue para decir aquí no mando").
 *
 * Accessibility "trayectoria asistida" (§8) lives here and nowhere else: the arc core hands over is
 * ALREADY the full arc up to the first bounce in every zone, so the assist is purely how densely it is
 * sampled — the shell stops honouring the per-zone `trajectoryDots` budget and draws the whole path.
 * No rule changes: nothing after the first bounce and no force field is ever drawn.
 */
import type * as Phaser from 'phaser';
import { DEFAULT_TUNING } from '@deeply-bubbly/core';
import type { Tuning, WorldSnapshot } from '@deeply-bubbly/core';
import type { Settings } from '../context';
import { TEXTURE_KEYS } from './textures';
import { DEPTH } from './depth';
import { UI } from '../palette';

/** Hard cap on the pool; TRAJECTORY_DOTS is 6 at its largest (§11.6), the assist may ask for more. */
const MAX_DOTS = 16;

export class Trajectory {
  private readonly dots: Phaser.GameObjects.Image[] = [];
  private readonly tuningOf: () => Tuning;
  private readonly settings: Settings | null;

  constructor(scene: Phaser.Scene, tuningOf: () => Tuning = () => DEFAULT_TUNING, settings: Settings | null = null) {
    this.tuningOf = tuningOf;
    this.settings = settings;
    for (let i = 0; i < MAX_DOTS; i++) {
      this.dots.push(scene.add.image(0, 0, TEXTURE_KEYS.dot).setDepth(DEPTH.trajectory).setVisible(false));
    }
  }

  update(snapshot: WorldSnapshot): void {
    const path = snapshot.trajectory;
    const assisted = this.settings?.assistedTrajectory === true;
    const wanted = assisted ? MAX_DOTS : Math.min(MAX_DOTS, Math.max(0, snapshot.trajectoryDots));
    if (path.length < 2 || wanted === 0) {
      this.hideFrom(0);
      return;
    }

    const valid = this.aimValid(snapshot);
    const colour = valid ? UI.white : UI.amber;
    const baseAlpha = valid ? 0.9 : 0.45;

    // Index 0 is Bur herself, so there are `path.length - 1` distinct positions to sample. Asking for
    // more dots than that used to round two of them onto the same pixel — a double-bright dot that
    // broke the alpha ramp and wasted one of the (already few) guides.
    const count = Math.min(wanted, path.length - 1);
    for (let i = 0; i < count; i++) {
      const u = (i + 1) / count;
      const point = path[Math.min(path.length - 1, Math.round(u * (path.length - 1)))];
      const dot = this.dots[i];
      if (!point || !dot) continue;
      dot.setVisible(true);
      dot.setPosition(Math.round(point.x), Math.round(point.y));
      dot.setTint(colour);
      // The first dot is the anchor of the read: full strength, then a steady fade down the arc.
      dot.setAlpha(baseAlpha * (i === 0 ? 1 : 0.85 - (i / count) * 0.3));
    }
    this.hideFrom(count);
  }

  /**
   * Snapshot-only test for §2.1's "aquí no mando" state. The shell cannot call `computeAim` honestly:
   * the pointer it holds is in viewport px and core converts it with a camera offset FROZEN at the
   * start of the hold (`GameWorld.pointerCamY`), which the snapshot does not expose. Both published
   * halves of the rule are readable here instead:
   *   - `dragDist` is always the true |pointer - aimOrigin|, so the anti-jitter disc is exact;
   *   - `lastAimValid` is only ever written on a VALID frame, so a charge that still has none has
   *     never had a valid direction — the "pull back like a slingshot" case §2.1 is about.
   * A pointer that crosses back above the origin after a valid frame keeps the bright guide; that is a
   * deliberate under-report, never an over-report.
   */
  private aimValid(snapshot: WorldSnapshot): boolean {
    const b = snapshot.bubble;
    if (b.state !== 'CHARGING') return true;
    if (b.lastAimValid === null) return false;
    return b.dragDist >= this.tuningOf().AIM_MIN_RADIUS;
  }

  private hideFrom(index: number): void {
    for (let i = index; i < this.dots.length; i++) this.dots[i]?.setVisible(false);
  }

  destroy(): void {
    for (const d of this.dots) d.destroy();
    this.dots.length = 0;
  }
}
