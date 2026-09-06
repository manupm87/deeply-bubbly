/**
 * §7 anticipation beat: "3 burbujitas orbitan a Bur mientras carga, más rápido cuanta más carga".
 *
 * Three 1 px satellites on a circle just outside her silhouette, 120° apart, spinning from SLOW_RPS to
 * FAST_RPS as the charge fills. It reads the snapshot only and owns no rule; it exists so the charge
 * has a fourth, purely peripheral channel — the one you catch without looking straight at Bur.
 */
import type * as Phaser from 'phaser';
import type { WorldSnapshot } from '@deeply-bubbly/core';
import { TEXTURE_KEYS } from './textures';
import { DEPTH } from './depth';

const COUNT = 3;
/** Turns per second at zero charge and at full charge. */
const SLOW_RPS = 0.35;
const FAST_RPS = 2.4;
/** Distance from her centre to the orbit, on top of the current radius. */
const GAP = 7;
const WOBBLE_PX = 1;
const FOAM = 0xe8f6f3;

export class ChargeOrbit {
  private readonly dots: Phaser.GameObjects.Image[] = [];
  private phase = 0;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < COUNT; i++) {
      const dot = scene.add.image(0, 0, TEXTURE_KEYS.dot).setDepth(DEPTH.chargeOrbit).setVisible(false);
      // Foam, never the reserved pure white: these belong to the world, not to the UI (§8).
      dot.setTint(FOAM);
      this.dots.push(dot);
    }
  }

  /** `dtMs` is the real frame delta: the orbit is presentation and keeps turning through a hitstop. */
  update(snapshot: WorldSnapshot, dtMs: number): void {
    const b = snapshot.bubble;
    const power = Math.min(1, Math.max(0, snapshot.hud.power));
    // See `ChargeRing`: a live gesture is `aimOrigin !== null`, which survives the single RESTING
    // step a mid-air capture parks the aim in.
    if (b.aimOrigin === null) {
      this.hide();
      return;
    }

    const rps = SLOW_RPS + (FAST_RPS - SLOW_RPS) * power;
    this.phase = (this.phase + (rps * dtMs) / 1000) % 1;
    const radius = b.radius + GAP;

    for (let i = 0; i < this.dots.length; i++) {
      const dot = this.dots[i];
      if (!dot) continue;
      const angle = (this.phase + i / COUNT) * Math.PI * 2;
      // A slightly elliptical orbit reads as depth without ever leaving the pixel grid.
      const wobble = WOBBLE_PX * Math.sin(angle * 2);
      dot.setVisible(true);
      dot.setPosition(
        Math.round(b.pos.x + Math.cos(angle) * (radius + wobble)),
        Math.round(b.pos.y + Math.sin(angle) * (radius * 0.75 + wobble)),
      );
      dot.setAlpha(0.35 + 0.45 * power);
    }
  }

  private hide(): void {
    for (const dot of this.dots) dot.setVisible(false);
  }

  destroy(): void {
    for (const dot of this.dots) dot.destroy();
    this.dots.length = 0;
  }
}
