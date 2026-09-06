/**
 * Pooled particle bursts (GDD §7): 6–10 microbubbles in the launch tail, 12 on impact, 14 on pop,
 * 4 sparkles on pickup, plus the ambient marine-snow layer from Z4 (zone index 3).
 *
 * One Phaser emitter per effect, all in explode mode (`emitting: false`), so nothing is allocated at
 * runtime: Phaser recycles the particle objects inside each emitter. All coordinates are WORLD px.
 */
import Phaser from 'phaser';
import type { Vec2, ZoneIndex } from '@deeply-bubbly/core';
import { ZONE_PALETTES } from '../palette';
import { DEPTH } from '../render/depth';

export const PARTICLE_TEXTURE = 'particle-bubble';

/**
 * In front of every world entity and BEHIND the dotted trajectory and Bur: §7's golden rule ("ningún
 * efecto puede tapar la trayectoria punteada") outranks its own "delante de todo" for the snow layer.
 */
export const FX_DEPTH: number = DEPTH.particles;
export const SNOW_DEPTH: number = DEPTH.snow;

/** Marine snow appears from Z4 = zone index 3. */
export const SNOW_FROM_ZONE = 3;
const SNOW_COUNT = 120;
const SNOW_PARALLAX = 0.3;

type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

/** BootScene owns the real texture; this is the guarded fallback so FX never depend on boot order. */
function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PARTICLE_TEXTURE)) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xe8f6f3, 1);
  g.fillRect(0, 0, 3, 3);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 1, 1);
  g.generateTexture(PARTICLE_TEXTURE, 3, 3);
  g.destroy();
}

/** Phaser degrees: 0 = right, 90 = down (y grows downward, same as the world). */
function degOf(v: Vec2): number {
  return Phaser.Math.RadToDeg(Math.atan2(v.y, v.x));
}

export class Particles {
  private readonly scene: Phaser.Scene;
  private readonly tail: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly hit: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly pop: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparkle: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly snow: Phaser.GameObjects.Particles.ParticleEmitter;
  private snowOn = false;
  private lastCamY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureTexture(scene);
    const foam = ZONE_PALETTES[0].foam;

    this.tail = this.emitter({
      speed: { min: 18, max: 55 },
      lifespan: { min: 260, max: 520 },
      alpha: { start: 0.85, end: 0 },
      tint: foam,
    });
    this.hit = this.emitter({
      speed: { min: 40, max: 120 },
      lifespan: { min: 280, max: 620 },
      alpha: { start: 0.95, end: 0 },
      tint: foam,
    });
    this.pop = this.emitter({
      speed: { min: 10, max: 38 },
      lifespan: { min: 900, max: 1500 },
      alpha: { start: 0.9, end: 0 },
      accelerationY: -26, // microbubbles rise
      tint: foam,
    });
    this.sparkle = this.emitter({
      speed: { min: 22, max: 62 },
      lifespan: { min: 240, max: 460 },
      alpha: { start: 1, end: 0 },
      tint: foam,
    });

    this.snow = scene.add.particles(0, 0, PARTICLE_TEXTURE, {
      speed: { min: 2, max: 9 },
      angle: { min: 60, max: 120 }, // drifting downward
      lifespan: 16000,
      alpha: { start: 0.42, end: 0.05 },
      frequency: -1,
      emitting: false,
      tint: 0x9fb8c4,
    });
    this.snow.setDepth(SNOW_DEPTH).setScrollFactor(SNOW_PARALLAX);
  }

  private emitter(extra: EmitterConfig): Phaser.GameObjects.Particles.ParticleEmitter {
    const e = this.scene.add.particles(0, 0, PARTICLE_TEXTURE, { frequency: -1, emitting: false, ...extra });
    e.setDepth(FX_DEPTH);
    return e;
  }

  /** 6–10 microbubbles thrown backwards from the launch point. */
  launchTail(at: Vec2, vel: Vec2): void {
    const back = degOf(vel) + 180;
    this.tail.setEmitterAngle({ min: back - 26, max: back + 26 });
    this.tail.explode(Phaser.Math.Between(6, 10), at.x, at.y);
  }

  /** 12 particles at the contact point, sprayed along the surface normal. */
  impact(at: Vec2, normal: Vec2): void {
    const out = degOf(normal);
    this.hit.setEmitterAngle({ min: out - 55, max: out + 55 });
    this.hit.explode(12, at.x, at.y);
  }

  /** 14 slowly rising bubbles when Bur pops. */
  deflate(at: Vec2): void {
    this.pop.setEmitterAngle({ min: 200, max: 340 });
    this.pop.explode(14, at.x, at.y);
  }

  /** 4 sparkles radiating from a collected pickup. */
  pickup(at: Vec2): void {
    this.sparkle.setEmitterAngle({ min: 0, max: 360 });
    this.sparkle.explode(4, at.x, at.y);
  }

  /** §2.5: the shell shield absorbed a hit — a wide ring of sparks, so the hit that cost nothing shows. */
  shield(at: Vec2): void {
    this.sparkle.setEmitterAngle({ min: 0, max: 360 });
    this.sparkle.explode(10, at.x, at.y);
  }

  /** Enables the ambient snow from Z4 on and tints the bursts with the zone's foam colour. */
  setZone(zone: ZoneIndex): void {
    const palette = ZONE_PALETTES[zone] ?? ZONE_PALETTES[0];
    for (const e of [this.tail, this.hit, this.pop, this.sparkle]) e.setParticleTint(palette.foam);
    const on = zone >= SNOW_FROM_ZONE;
    if (on === this.snowOn) return;
    this.snowOn = on;
    if (!on) this.snow.killAll();
  }

  /**
   * Keeps ~120 snow particles alive inside the visible band. The emitter itself never moves (moving it
   * would drag its particles and cancel the parallax); only the SPAWN position follows the camera, on
   * the side the camera is travelling towards, so nothing pops into view.
   */
  update(cameraY: number, viewH: number): void {
    if (!this.snowOn) {
      this.lastCamY = cameraY;
      return;
    }
    const descending = cameraY >= this.lastCamY;
    this.lastCamY = cameraY;
    const alive = this.snow.getAliveParticleCount();
    const missing = SNOW_COUNT - alive;
    if (missing <= 0) return;
    // Emitter-local coordinates of the visible band, given the emitter sits at world 0 with parallax.
    const top = cameraY * SNOW_PARALLAX;
    const seeding = alive === 0;
    const batch = seeding ? missing : Math.min(missing, 3);
    for (let i = 0; i < batch; i++) {
      const x = Phaser.Math.Between(-12, 192);
      const y = seeding
        ? top + Math.random() * viewH
        : descending
          ? top + viewH + Math.random() * 40
          : top - Math.random() * 40;
      this.snow.emitParticleAt(x, y, 1);
    }
  }

  destroy(): void {
    for (const e of [this.tail, this.hit, this.pop, this.sparkle, this.snow]) e.destroy();
  }
}
