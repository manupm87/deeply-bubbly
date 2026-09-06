/**
 * The rubber band of the slingshot (DECISIONS-v1.2 D2, GDD §8): a 1 px line from the point of the
 * glass the finger first touched to where the finger is now, a fork ring at that origin, and an "X"
 * over it while the release would CANCEL the shot.
 *
 * It is the one cue that says "the origin is where you pressed, not where Bur is" — the whole reason
 * the gesture reads as Angry Birds instead of as a swipe. The other two power channels (the ring
 * around Bur and the dotted arc) live in `ChargeRing` and `Trajectory`.
 *
 * WHY IT LATCHES THE POINTER: `bubble.aimOrigin` is a world position measured against the camera
 * offset core froze for this contact, and the shell cannot see that offset. What the player must see
 * is a band pinned to the GLASS, so the origin is latched here in viewport design px on the frame the
 * gesture starts — the same sample core converted — and converted back to world coordinates with the
 * camera actually being drawn. No rule is duplicated: this module decides nothing about the shot.
 */
import type * as Phaser from 'phaser';
import type { PointerInput, Vec2, WorldSnapshot } from '@deeply-bubbly/core';
import { UI } from '../palette';
import { DEPTH } from './depth';

/** Radius of the fork ring drawn at the origin. */
const FORK_R = 3;
/**
 * Half-length of each stroke of the cancel "X". Deliberately larger than a thumb's contact patch
 * (~12 design px across at zoom 2): the mark sits exactly under the finger by construction — a cancel
 * means the finger is within PULL_CANCEL_PX of the origin — so a small one is invisible on a phone.
 * The emptied ring around Bur is still the channel that reads first; this is its confirmation.
 */
const CROSS_R = 9;

export class SlingBand {
  private readonly g: Phaser.GameObjects.Graphics;
  /** Viewport design px of the first touch of the current gesture; null while there is no gesture. */
  private origin: Vec2 | null = null;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.slingBand);
  }

  /** `pointer` is the live sample in viewport design px — the same one handed to `world.update`. */
  update(snapshot: WorldSnapshot, pointer: Readonly<PointerInput>): void {
    const b = snapshot.bubble;
    // A LIVE gesture, not the AIMING state: a rest capture parks a running aim in RESTING for one step
    // before the next input phase resumes it, and `aimOrigin` is what core keeps across that frame.
    // Keying on the state instead drops the latch there and re-latches from the CURRENT finger on the
    // next frame, so the band would draw a near-zero pull while a full-power shot is loaded — exactly
    // contradicting the ring and the guide it exists to corroborate.
    const aiming = b.aimOrigin !== null;
    if (!aiming) {
      this.origin = null;
      this.g.clear();
      return;
    }
    // First frame of the gesture: core froze its origin from exactly this pointer sample.
    if (this.origin === null) this.origin = { x: pointer.x, y: pointer.y };

    const cam = snapshot.camera;
    // `renderX/renderY`, not `x/y`: this is the camera actually being DRAWN, peek included (D5), so
    // the band stays pinned to the glass under the finger while the view is peeked.
    const ox = Math.round(this.origin.x + cam.renderX);
    const oy = Math.round(this.origin.y + cam.renderY);
    const fx = Math.round(pointer.x + cam.renderX);
    const fy = Math.round(pointer.y + cam.renderY);

    const cancel = snapshot.hud.cancelZone;
    const colour = cancel ? UI.dim : b.aimValid ? UI.white : UI.amber;
    const alpha = cancel ? 0.5 : 0.85;

    const g = this.g;
    g.clear();
    g.lineStyle(1, colour, alpha);
    g.strokeCircle(ox, oy, FORK_R);
    if (!cancel) {
      g.lineBetween(ox, oy, fx, fy);
      // A 2 px pip under the finger closes the read: the band has a grip, not a loose end.
      g.fillStyle(colour, alpha);
      g.fillRect(fx - 1, fy - 1, 2, 2);
      return;
    }
    // D2: "es el equivalente a devolver el pájaro a la horquilla". No band, and an X over the fork.
    g.lineBetween(ox - CROSS_R, oy - CROSS_R, ox + CROSS_R, oy + CROSS_R);
    g.lineBetween(ox - CROSS_R, oy + CROSS_R, ox + CROSS_R, oy - CROSS_R);
  }

  destroy(): void {
    this.g.destroy();
  }
}
