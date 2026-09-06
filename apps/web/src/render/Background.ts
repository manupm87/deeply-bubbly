/**
 * Zone backdrop (SHELL.md "Fondo"): an 8-band vertical gradient that crossfades on `zoneChange`, three
 * parallax reef layers (0.2 / 0.5 / 1.0), god rays plus a caustic shimmer in the shallows of Z1, and a
 * drift of rising micro-bubbles.
 *
 * Everything sits in ONE container pinned to the top of the view every frame. `scrollFactor` is not
 * used on purpose: at integer zoom a scrollFactor-0 object lands at `viewW * (zoom - 1) / 2`, not at
 * the corner of the viewport. Following the camera explicitly is exact at every zoom.
 */
import * as Phaser from 'phaser';
import type { ZoneIndex } from '@deeply-bubbly/core';
import { DEPTH } from './depth';
import { TEXTURE_KEYS, godrayKey, paletteOf } from './textures';
import { mixColor } from './pixels';
import { CAUSTIC_SIZE, LAYER_ALPHA, buildCaustics, buildReefLayer } from './reef';

const BANDS = 8;
const PARALLAX = [0.2, 0.5, 1.0] as const;
const AMBIENT_BUBBLES = 20;
/** World y at which the shallow caustics have completely faded out (top third of Z1: 2880 / 3). */
const CAUSTIC_DEPTH_PX = 960;
const CAUSTIC_ALPHA = 0.11;

const layerKey = (zone: number, layer: number): string => `bg-reef-l${layer}-z${zone}`;
const causticKey = (zone: number): string => `bg-caustic-z${zone}`;

export class Background {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly gradients: [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics];
  private front: 0 | 1 = 0;
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private rays: Phaser.GameObjects.Image[] = [];
  private caustics: Phaser.GameObjects.TileSprite | null = null;
  private readonly bubbles: Phaser.GameObjects.Image[] = [];
  private readonly bubbleSpeed: number[] = [];
  private zone: ZoneIndex;
  private viewW: number;
  private viewH: number;

  constructor(scene: Phaser.Scene, zone: ZoneIndex, viewW: number, viewH: number) {
    this.scene = scene;
    this.zone = zone;
    this.viewW = viewW;
    this.viewH = viewH;
    this.root = scene.add.container(0, 0).setDepth(DEPTH.water);

    this.gradients = [scene.make.graphics({}, false), scene.make.graphics({}, false)];
    for (const g of this.gradients) this.root.add(g.setDepth(0));
    this.gradients[1].setAlpha(0);
    this.paintGradient(this.gradients[0], zone);

    this.buildLayers(zone);
    this.buildRays(zone);
    this.buildBubbles();
  }

  private paintGradient(g: Phaser.GameObjects.Graphics, zone: number): void {
    const p = paletteOf(zone);
    g.clear();
    const bandH = Math.ceil(this.viewH / BANDS);
    for (let i = 0; i < BANDS; i++) {
      g.fillStyle(mixColor(p.waterTop, p.waterBottom, i / (BANDS - 1)), 1);
      g.fillRect(0, i * bandH, this.viewW, bandH);
    }
  }

  private buildLayers(zone: number): void {
    for (const l of this.layers) l.destroy();
    this.layers = [];
    const p = paletteOf(zone);
    for (let i = 0; i < PARALLAX.length; i++) {
      buildReefLayer(this.scene, layerKey(zone, i), zone, i, p);
      const ts = this.scene.make
        .tileSprite({ x: 0, y: 0, width: this.viewW, height: this.viewH, key: layerKey(zone, i) }, false)
        .setOrigin(0, 0)
        .setDepth(1 + i)
        .setAlpha(LAYER_ALPHA[i] ?? 0.3);
      this.layers.push(ts);
      this.root.add(ts);
    }
    this.root.sort('depth');
  }

  /** God rays and the caustic net both belong to the Superficie (GDD §3.2); nothing else has light. */
  private buildRays(zone: number): void {
    for (const r of this.rays) r.destroy();
    this.rays = [];
    this.caustics?.destroy();
    this.caustics = null;
    if (zone !== 0) return;
    const key = godrayKey(zone);
    if (!this.scene.textures.exists(key)) return;
    for (let i = 0; i < 3; i++) {
      const ray = this.scene.make
        .image({ x: 30 + i * 60, y: 0, key }, false)
        .setOrigin(0.5, 0)
        .setDepth(5)
        .setAlpha(0.1)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.rays.push(ray);
      this.root.add(ray);
    }
    buildCaustics(this.scene, causticKey(zone), paletteOf(zone));
    this.caustics = this.scene.make
      .tileSprite({ x: 0, y: 0, width: this.viewW, height: this.viewH, key: causticKey(zone) }, false)
      .setOrigin(0, 0)
      .setDepth(4)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.root.add(this.caustics);
    this.root.sort('depth');
  }

  private buildBubbles(): void {
    for (let i = 0; i < AMBIENT_BUBBLES; i++) {
      const b = this.scene.make
        .image({ x: Math.random() * this.viewW, y: Math.random() * this.viewH, key: TEXTURE_KEYS.particle }, false)
        .setDepth(6)
        .setAlpha(0.15 + Math.random() * 0.25);
      this.bubbles.push(b);
      this.bubbleSpeed.push(6 + Math.random() * 14);
      this.root.add(b);
    }
  }

  /** Crossfades to the palette of `zone` (600 ms per SHELL.md) and rebuilds the parallax reef. */
  setZone(zone: ZoneIndex, crossfadeMs = 600): void {
    if (zone === this.zone) return;
    this.zone = zone;
    const back = this.gradients[this.front === 0 ? 1 : 0];
    const front = this.gradients[this.front];
    this.paintGradient(back, zone);
    this.scene.tweens.add({ targets: back, alpha: 1, duration: crossfadeMs });
    this.scene.tweens.add({ targets: front, alpha: 0, duration: crossfadeMs });
    this.front = this.front === 0 ? 1 : 0;
    this.buildLayers(zone);
    this.buildRays(zone);
  }

  resize(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    this.paintGradient(this.gradients[this.front], this.zone);
    for (const l of this.layers) l.setSize(viewW, viewH);
    this.caustics?.setSize(viewW, viewH);
  }

  /** `cameraY` is the world y of the top of the view; `dtMs` the real frame time (ambient life). */
  update(timeMs: number, cameraY: number, dtMs: number): void {
    this.root.setPosition(0, Math.round(cameraY));
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer) layer.tilePositionY = cameraY * (PARALLAX[i] ?? 1);
    }
    for (let i = 0; i < this.rays.length; i++) {
      this.rays[i]?.setAlpha(0.06 + 0.06 * (0.5 + 0.5 * Math.sin(timeMs / 1400 + i * 1.7)));
    }
    this.updateCaustics(timeMs, cameraY);
    const dt = Math.min(0.05, dtMs / 1000);
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (!b) continue;
      b.y -= (this.bubbleSpeed[i] ?? 8) * dt;
      b.x += Math.sin(timeMs / 900 + i) * 0.08;
      if (b.y < -2) {
        b.y = this.viewH + 2;
        b.x = Math.random() * this.viewW;
      }
    }
  }

  /**
   * Sunlight on the water: the net drifts sideways much faster than it sinks, and it dies out over the
   * top third of Z1 so the shimmer is a property of the shallows, not a permanent overlay.
   */
  private updateCaustics(timeMs: number, cameraY: number): void {
    const c = this.caustics;
    if (!c) return;
    const shallow = Math.max(0, 1 - Math.max(0, cameraY) / CAUSTIC_DEPTH_PX);
    c.setAlpha(CAUSTIC_ALPHA * shallow * shallow * shallow * (0.7 + 0.3 * Math.sin(timeMs / 2600)));
    // Wrap on the CAUSTIC tile, not on the reef layer height: 240 % 96 = 48, so the old constant
    // teleported the whole field half a tile sideways every ~62 s.
    c.tilePositionX = (timeMs / 260) % CAUSTIC_SIZE;
    c.tilePositionY = (cameraY * 0.75 + timeMs / 900) % CAUSTIC_SIZE;
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
