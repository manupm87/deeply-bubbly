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
 *
 * **The edge marker.** D3 made the world three screens wide and D4 keeps `MAX_HOP_X_PX` above the width
 * of the view, so the point a shot lands on is very often OUTSIDE the 180 px window while the player is
 * aiming at it — measured over the MVP campaign, 61 % of the hops, by up to 87 px. The guide runs off
 * the same edge, which is the one moment the scaffold of §2.7 stops scaffolding. So when the last dot
 * is off screen, a small chevron is pinned to that edge at the dot's depth: "the arc ends this far
 * down, that way". It reads nothing and decides nothing — it is the last point of `snapshot.trajectory`
 * clamped to the viewport, and it exists so a shot at an unseen ledge is still a shot the player aims.
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

/** Design px the edge chevron is inset from the border of the view, and half its height. */
const EDGE_INSET = 3;
const CHEVRON_H = 5;

export class Trajectory {
  private readonly dots: Phaser.GameObjects.Image[] = [];
  private readonly edge: Phaser.GameObjects.Graphics;
  private readonly settings: Settings | null;

  // `tuningOf` is still accepted so the scene wiring and the live tuning panel do not have to change;
  // since D2 the amber cue comes from `bubble.aimValid` and nothing here reads a constant.
  constructor(scene: Phaser.Scene, _tuningOf: () => Tuning = () => DEFAULT_TUNING, settings: Settings | null = null) {
    this.settings = settings;
    for (let i = 0; i < MAX_DOTS; i++) {
      this.dots.push(scene.add.image(0, 0, TEXTURE_KEYS.dot).setDepth(DEPTH.trajectory).setVisible(false));
    }
    this.edge = scene.add.graphics().setDepth(DEPTH.trajectory);
  }

  update(snapshot: WorldSnapshot): void {
    const path = snapshot.trajectory;
    const assisted = this.settings?.assistedTrajectory === true;
    const wanted = assisted ? MAX_DOTS : Math.min(MAX_DOTS, Math.max(0, snapshot.trajectoryDots));
    if (path.length < 2 || wanted === 0) {
      this.hideFrom(0);
      this.edge.clear();
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
    this.drawEdgeMarker(snapshot, path[path.length - 1], colour, baseAlpha);
  }

  /**
   * The chevron of the file header: drawn only when the arc's last point is horizontally outside the
   * view, at that edge and at the point's own depth (itself clamped, so a very deep landing still
   * reads as "below and to the side" instead of vanishing off a corner).
   */
  private drawEdgeMarker(
    snapshot: WorldSnapshot,
    last: { x: number; y: number } | undefined,
    colour: number,
    alpha: number,
  ): void {
    const g = this.edge;
    g.clear();
    if (!last) return;
    const cam = snapshot.camera;
    // The DRAWN view (D5 peek included): the chevron marks the edge of what the player can see.
    const left = cam.renderX;
    const right = cam.renderX + cam.viewW;
    if (last.x >= left && last.x <= right) return;

    const toRight = last.x > right;
    const x = Math.round(toRight ? right - EDGE_INSET : left + EDGE_INSET);
    const top = cam.renderY + CHEVRON_H;
    const y = Math.round(Math.min(cam.renderY + cam.viewH - CHEVRON_H, Math.max(top, last.y)));
    const dir = toRight ? 1 : -1;
    g.fillStyle(colour, alpha);
    g.fillTriangle(x + dir * 3, y, x - dir * 2, y - CHEVRON_H, x - dir * 2, y + CHEVRON_H);
  }

  /**
   * "Aquí no mando", straight off the snapshot (D2). Core publishes the answer now — `aimValid` is
   * false exactly while the pull asks Bur to go UP and the direction was clamped to the horizontal —
   * so the shell no longer has to reconstruct the rule from a pointer it holds in viewport px and a
   * camera offset it cannot see.
   */
  private aimValid(snapshot: WorldSnapshot): boolean {
    const b = snapshot.bubble;
    if (b.aimOrigin === null) return true;
    return b.aimValid;
  }

  private hideFrom(index: number): void {
    for (let i = index; i < this.dots.length; i++) this.dots[i]?.setVisible(false);
  }

  destroy(): void {
    for (const d of this.dots) d.destroy();
    this.dots.length = 0;
    this.edge.destroy();
  }
}
