/**
 * Bur: body + eyes + aura, and every squash/stretch number of GDD §7. The FX module calls the hooks
 * from `GameEvent`s; the continuous part (charge squash, idle breathing, resting flatten, eye aim) is
 * derived from the snapshot in `sync`. No rule lives here — only how a rule looks.
 *
 * The body is the ONE sprite allowed to scale fractionally. The eyes never rotate: they are the
 * emotional channel and must stay readable at 1 px.
 */
import * as Phaser from 'phaser';
import { DEFAULT_TUNING } from '@deeply-bubbly/core';
import type { Tuning, Vec2, WorldSnapshot } from '@deeply-bubbly/core';
import { BUR_TEX_RADIUS, TEXTURE_KEYS } from './textures';
import { DEPTH } from './depth';

/** §7: charge squash 1.00 → 0.78 vertical / 1.22 horizontal, with a 12 Hz 3 % tension wobble. */
const CHARGE_SQUASH = 0.22;
const WOBBLE_HZ = 12;
const WOBBLE_AMP = 0.03;
const STRETCH = 1.35;
const STRETCH_MS = 120;
const IMPACT = 0.7;
const IMPACT_MS = 90;
const IMPACT_ROT_DEG = 8;
const BREATH_AMP = 0.03;
const BLINK_MS = 90;
/** §2.5 shield: a short bright pulse of the aura, so an absorbed hit is not invisible. */
const SHIELD_FLASH_MS = 260;

interface Fx {
  amt: number;
  rotW: number;
}

export class BubbleView {
  private readonly scene: Phaser.Scene;
  /** Live tuning (the panel edits it); presentation constants must not freeze on DEFAULT_TUNING. */
  private readonly tuningOf: () => Tuning;
  private readonly body: Phaser.GameObjects.Image;
  private readonly eyes: Phaser.GameObjects.Image;
  private readonly aura: Phaser.GameObjects.Graphics;
  /** Single tween target: `amt` is the deformation along the current axis, `rotW` the impact wobble. */
  private readonly fx: Fx = { amt: 1, rotW: 0 };
  /** Axis the current deformation is applied along (flight direction / contact normal). */
  private axisRot = 0;
  private blinkUntil = 0;
  private nextBlinkAt = 3000;
  private deflating = false;
  /** Uniform swell, used only by the deflate; kept apart from the axis deformation `fx.amt`. */
  private readonly swell = { k: 1 };
  /** Reused every frame: `sync` runs 60×/s and must not allocate (§11.5.10 in spirit). */
  private readonly gaze: Vec2 = { x: 0, y: 1 };
  /** Aura geometry currently baked into the Graphics, so it is re-tessellated only when it changes. */
  private auraOuter = -1;
  private auraLight = -1;
  private shieldUntil = 0;
  private lastTimeMs = 0;

  constructor(scene: Phaser.Scene, tuningOf: () => Tuning = () => DEFAULT_TUNING) {
    this.scene = scene;
    this.tuningOf = tuningOf;
    this.body = scene.add.image(0, 0, TEXTURE_KEYS.bur).setDepth(DEPTH.bur);
    this.eyes = scene.add.image(0, 0, TEXTURE_KEYS.burEyes).setDepth(DEPTH.bur + 1);
    this.aura = scene.add.graphics().setDepth(DEPTH.bur - 1);
  }

  get gameObject(): Phaser.GameObjects.Image {
    return this.body;
  }

  // -------------------------------------------------------------------------------------------
  // Per-frame, snapshot-driven
  // -------------------------------------------------------------------------------------------

  sync(snapshot: WorldSnapshot): void {
    const b = snapshot.bubble;
    const t = snapshot.timeMs;
    this.lastTimeMs = t;
    const base = b.radius / BUR_TEX_RADIUS;

    let sx = 1;
    let sy = 1;
    if (b.state === 'CHARGING') {
      const power = snapshot.hud.chargePower;
      const wobble = 1 + WOBBLE_AMP * Math.sin((t / 1000) * WOBBLE_HZ * Math.PI * 2);
      sy = (1 - CHARGE_SQUASH * power) * wobble;
      sx = (1 + CHARGE_SQUASH * power) / wobble;
    } else if (b.state === 'RESTING') {
      sy = 0.9; // she settles against the ceiling
      sx = 1.08;
    } else {
      const breath = BREATH_AMP * Math.sin((t / 1000) * Math.PI * 2); // 3 % at 1 Hz
      sy = 1 - breath;
      sx = 1 + breath;
    }

    this.body.setPosition(b.pos.x, b.pos.y);
    const k = this.swell.k;
    this.body.setScale(base * sx * k * (1 / this.fx.amt), base * sy * k * this.fx.amt);
    this.body.setRotation(this.axisRot + this.fx.rotW);

    this.syncEyes(b.pos, this.eyeDirection(snapshot), base, b.state === 'RESTING', t);
    this.drawAura(b.pos, b.radius, b.lastChargePower, t);
  }

  /** Eyes look where the shot is going while charging, and where she is flying otherwise (§7). */
  private eyeDirection(snapshot: WorldSnapshot): Vec2 {
    const b = snapshot.bubble;
    const gaze = this.gaze;
    if (b.state === 'CHARGING' || b.state === 'IDLE') {
      gaze.x = Math.sin(b.aimTheta);
      gaze.y = Math.cos(b.aimTheta);
      return gaze;
    }
    const speed = Math.hypot(b.vel.x, b.vel.y);
    gaze.x = speed < 8 ? 0 : b.vel.x / speed;
    gaze.y = speed < 8 ? 1 : b.vel.y / speed;
    return gaze;
  }

  private syncEyes(pos: Vec2, dir: Vec2, base: number, resting: boolean, timeMs: number): void {
    const reach = Math.max(1.5, 2.4 * base);
    this.eyes.setPosition(pos.x + dir.x * reach, pos.y - 1.5 * base + dir.y * reach * 0.5);
    this.eyes.setScale(Math.max(1, Math.round(base)));

    if (resting && timeMs >= this.nextBlinkAt) {
      this.blinkUntil = timeMs + BLINK_MS;
      this.nextBlinkAt = timeMs + 3000 + Math.random() * 1000; // §7: a blink every 3–4 s at rest
    }
    const blinking = timeMs < this.blinkUntil;
    const key = blinking ? TEXTURE_KEYS.burEyesBlink : TEXTURE_KEYS.burEyes;
    if (this.eyes.texture.key !== key) this.eyes.setTexture(key);
  }

  /**
   * Aura ring: guarantees the MIN_SILHOUETTE_PX readability floor (§2.6) — as pressure shrinks Bur,
   * the aura grows, so she never becomes a dot. Its brightness carries the light radius of §11.4.
   */
  private drawAura(pos: Vec2, radius: number, lastPower: number, timeMs: number): void {
    const t = this.tuningOf();
    const grow = Math.max(0, t.RADIUS_BASE - radius) * 0.7;
    const outer = Math.max(t.MIN_SILHOUETTE_PX / 2, radius + 1.5 + grow);
    const light = t.LIGHT_RADIUS_BASE + (t.LIGHT_RADIUS_CHARGED - t.LIGHT_RADIUS_BASE) * lastPower;

    // The circles are drawn ONCE around the local origin and then moved: re-tessellating three
    // circles every frame was the most expensive thing in the render path.
    if (Math.abs(outer - this.auraOuter) > 0.05 || Math.abs(light - this.auraLight) > 0.05) {
      this.auraOuter = outer;
      this.auraLight = light;
      this.aura.clear();
      this.aura.fillStyle(0xa8e6f0, 0.05);
      this.aura.fillCircle(0, 0, light);
      this.aura.lineStyle(1, 0xa8e6f0, 0.35);
      this.aura.strokeCircle(0, 0, outer);
      this.aura.lineStyle(1, 0xe8f6f3, 0.18);
      this.aura.strokeCircle(0, 0, outer + 2);
    }
    this.aura.setPosition(pos.x, pos.y);
    if (!this.deflating) {
      const flashing = timeMs < this.shieldUntil;
      this.aura.setAlpha(flashing ? 1 : 0.85);
      this.aura.setScale(flashing ? 1 + 0.25 * ((this.shieldUntil - timeMs) / SHIELD_FLASH_MS) : 1);
    }
  }

  /** §2.5: the shield ate a hit. Bur swells and her aura flares for a beat — no pip was lost. */
  shieldFlash(): void {
    this.shieldUntil = this.lastTimeMs + SHIELD_FLASH_MS;
    this.scene.tweens.killTweensOf(this.swell);
    this.swell.k = 1.25;
    this.scene.tweens.add({ targets: this.swell, k: 1, duration: SHIELD_FLASH_MS, ease: 'Quad.easeOut' });
  }

  // -------------------------------------------------------------------------------------------
  // Event-driven hooks (called by the FX module from GameEvents)
  // -------------------------------------------------------------------------------------------

  /** Manual squash toward `power` (0..1) along the vertical, e.g. a scripted tutorial beat. */
  squash(power: number, durationMs = 120): void {
    this.axisRot = 0;
    this.tweenAmt(1 - CHARGE_SQUASH * Math.min(1, Math.max(0, power)), durationMs, 'Quad.easeOut');
  }

  /** §7: 1.35 along the flight axis for 120 ms, returning with easeOutElastic. */
  stretch(dir: Vec2): void {
    this.axisRot = Math.atan2(dir.y, dir.x) - Math.PI / 2;
    this.scene.tweens.killTweensOf(this.fx);
    // killTweensOf also kills the rotW tween of a bounce < 260 ms ago; without this Bur stays tilted.
    this.fx.rotW = 0;
    this.fx.amt = STRETCH;
    this.scene.tweens.add({ targets: this.fx, amt: 1, duration: STRETCH_MS, ease: 'Elastic.easeOut' });
  }

  /** §7: 0.70 along the contact normal for 90 ms, plus a damped ±8° rotation. */
  impact(normal: Vec2): void {
    this.axisRot = Math.atan2(normal.y, normal.x) - Math.PI / 2;
    this.scene.tweens.killTweensOf(this.fx);
    this.fx.amt = IMPACT;
    this.fx.rotW = Phaser.Math.DegToRad(IMPACT_ROT_DEG) * (Math.random() < 0.5 ? -1 : 1);
    this.scene.tweens.add({ targets: this.fx, amt: 1, duration: IMPACT_MS, ease: 'Quad.easeOut' });
    this.scene.tweens.add({ targets: this.fx, rotW: 0, duration: 260, ease: 'Elastic.easeOut' });
  }

  /** §2.4: she loosens and fades over DEFLATE_MS. */
  deflate(durationMs = this.tuningOf().DEFLATE_MS): void {
    if (this.deflating) return;
    this.deflating = true;
    this.scene.tweens.killTweensOf(this.fx);
    this.scene.tweens.killTweensOf(this.swell);
    this.axisRot = 0;
    this.fx.amt = 1;
    this.fx.rotW = 0;
    this.shieldUntil = 0;
    this.swell.k = 1;
    this.scene.tweens.add({ targets: this.swell, k: 1.5, duration: durationMs, ease: 'Sine.easeIn' });
    this.scene.tweens.add({
      targets: [this.body, this.eyes, this.aura],
      alpha: 0,
      duration: durationMs,
      ease: 'Sine.easeIn',
    });
  }

  /** Respawn: she re-forms. Cancels everything the deflate left behind. */
  reform(): void {
    this.deflating = false;
    this.shieldUntil = 0;
    this.scene.tweens.killTweensOf(this.fx);
    this.scene.tweens.killTweensOf(this.swell);
    this.scene.tweens.killTweensOf([this.body, this.eyes, this.aura]);
    this.swell.k = 1;
    this.fx.amt = 1;
    this.fx.rotW = 0;
    this.axisRot = 0;
    this.body.setAlpha(1);
    this.eyes.setAlpha(1);
    this.aura.setAlpha(0.85);
    this.aura.setScale(1);
    this.swell.k = 0.2;
    this.scene.tweens.add({ targets: this.swell, k: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private tweenAmt(to: number, durationMs: number, ease: string): void {
    this.scene.tweens.killTweensOf(this.fx);
    this.fx.rotW = 0;
    this.scene.tweens.add({ targets: this.fx, amt: to, duration: durationMs, ease });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.fx);
    this.scene.tweens.killTweensOf(this.swell);
    this.body.destroy();
    this.eyes.destroy();
    this.aura.destroy();
  }
}
