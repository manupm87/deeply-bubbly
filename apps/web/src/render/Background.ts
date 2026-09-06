/**
 * Zone backdrop (SHELL.md "Fondo"): an 8-band vertical gradient that crossfades on `zoneChange`, three
 * parallax silhouette layers (0.2 / 0.5 / 1.0), god rays in Zone 1 and a drift of rising micro-bubbles.
 *
 * Everything sits in ONE container pinned to the top of the view every frame. `scrollFactor` is not
 * used on purpose: at integer zoom a scrollFactor-0 object lands at `viewW * (zoom - 1) / 2`, not at
 * the corner of the viewport. Following the camera explicitly is exact at every zoom.
 */
import * as Phaser from 'phaser';
import type { ZoneIndex } from '@deeply-bubbly/core';
import { DEPTH } from './depth';
import { TEXTURE_KEYS, godrayKey, paletteOf } from './textures';
import { commit, gfx } from './pixels';
import type { ZonePalette } from '../palette';

const BANDS = 8;
const LAYER_H = 240;
const PARALLAX = [0.2, 0.5, 1.0] as const;
const AMBIENT_BUBBLES = 20;

const layerKey = (zone: number, layer: number): string => `bg-l${layer}-z${zone}`;

/** Deterministic per (zone, layer) so the silhouettes are stable across sessions. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerpChannel = (a: number, b: number, t: number, shift: number): number =>
  Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t) << shift;

const mixColor = (a: number, b: number, t: number): number =>
  lerpChannel(a, b, t, 16) | lerpChannel(a, b, t, 8) | lerpChannel(a, b, t, 0);

/** A wall of rock down both edges; the farther the layer, the darker and the flatter. */
function buildLayerTexture(scene: Phaser.Scene, zone: number, layer: number, p: ZonePalette): void {
  const key = layerKey(zone, layer);
  if (scene.textures.exists(key)) return;
  const g = gfx(scene);
  const rand = mulberry32(zone * 97 + layer * 31 + 7);
  const tone = mixColor(p.rock, p.waterBottom, 0.65 - layer * 0.25);
  const shade = mixColor(tone, p.rockLight, 0.35);
  const maxW = 14 + layer * 12;
  g.fillStyle(tone, 1);
  for (let y = 0; y < LAYER_H; y += 6) {
    const left = Math.round(rand() * maxW);
    const right = Math.round(rand() * maxW);
    g.fillRect(0, y, left, 6);
    g.fillRect(180 - right, y, right, 6);
  }
  g.fillStyle(shade, 0.7);
  for (let i = 0; i < 10 + layer * 6; i++) {
    g.fillRect(Math.round(rand() * 180), Math.round(rand() * LAYER_H), 1 + Math.round(rand() * 2), 1 + Math.round(rand() * 3));
  }
  commit(scene, g, key, 180, LAYER_H);
}

export class Background {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly gradients: [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics];
  private front: 0 | 1 = 0;
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private rays: Phaser.GameObjects.Image[] = [];
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
      buildLayerTexture(this.scene, zone, i, p);
      const ts = this.scene.make
        .tileSprite({ x: 0, y: 0, width: this.viewW, height: this.viewH, key: layerKey(zone, i) }, false)
        .setOrigin(0, 0)
        .setDepth(1 + i)
        .setAlpha(0.45 + i * 0.2);
      this.layers.push(ts);
      this.root.add(ts);
    }
    this.root.sort('depth');
  }

  private buildRays(zone: number): void {
    for (const r of this.rays) r.destroy();
    this.rays = [];
    if (zone !== 0) return; // GDD §3.2: god rays belong to the Superficie
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

  /** Crossfades to the palette of `zone` (600 ms per SHELL.md) and rebuilds the parallax silhouettes. */
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

  destroy(): void {
    this.root.destroy(true);
  }
}
