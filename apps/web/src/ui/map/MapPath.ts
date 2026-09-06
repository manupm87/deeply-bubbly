/**
 * The water the map is drawn on and the winding path that joins the nodes (WORLD-MAP.md §2).
 *
 * The column is tinted by AREA: each stretch takes the palette of the GDD zone its levels belong to
 * (`palette.ts` ZONE_PALETTES), blended from `waterTop` to `waterBottom` across that stretch, so a
 * player scrolling down watches the ocean go from turquoise to black exactly as the descent does.
 * Everything here is decoration: it reads the statuses only to know which zone a stretch belongs to.
 */
import type Phaser from 'phaser';
import type { LevelStatus } from '@deeply-bubbly/core';
import { ZONE_PALETTES } from '../../palette';
import type { MapGeometry } from './geometry';
import { NODE_R, mixColour } from './geometry';
import { MAP_TEX } from './mapTextures';

/** Height of one band of the gradient. Small enough to read as a gradient, big enough to be cheap. */
const BAND_H = 4;
/** Spacing of the dots that draw the path between two nodes. */
const DOT_STEP = 5;

/** The zone a map y belongs to, and how far down that zone's stretch it is (0..1). */
function zoneAt(y: number, geom: MapGeometry, statuses: readonly LevelStatus[]): { zone: number; t: number } {
  const first = geom.nodes[0]?.y ?? 0;
  const raw = (y - first) / geom.gap;
  const index = Math.min(statuses.length - 1, Math.max(0, Math.round(raw)));
  const zone = statuses[index]?.level.zone ?? 0;
  let start = index;
  let end = index;
  while (start > 0 && statuses[start - 1]?.level.zone === zone) start--;
  while (end < statuses.length - 1 && statuses[end + 1]?.level.zone === zone) end++;
  const span = end - start;
  const t = span <= 0 ? 0.5 : Math.min(1, Math.max(0, (raw - start) / span));
  return { zone, t };
}

export class MapPath {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    geom: MapGeometry,
    statuses: readonly LevelStatus[],
  ) {
    this.g = scene.add.graphics();
    parent.add(this.g);
    this.drawWater(geom, statuses);
    this.drawSurface(scene, parent, geom);
    this.drawPath(geom);
    this.drawTrench(scene, parent, geom);
  }

  /** Zone gradient down the whole column; there is no camera behind it, so it is drawn once. */
  private drawWater(geom: MapGeometry, statuses: readonly LevelStatus[]): void {
    for (let y = 0; y < geom.height; y += BAND_H) {
      const { zone, t } = zoneAt(y + BAND_H / 2, geom, statuses);
      const palette = ZONE_PALETTES[Math.min(ZONE_PALETTES.length - 1, zone)] ?? ZONE_PALETTES[0];
      this.g.fillStyle(mixColour(palette.waterTop, palette.waterBottom, t), 1);
      this.g.fillRect(0, y, geom.viewW, Math.min(BAND_H, geom.height - y));
    }
  }

  /**
   * Sun and foam: the top of the ocean, so the map has a "here is the air" end (§2 "superficie").
   * The sun goes on the LEFT — the top-right corner belongs to the sound button, which is fixed to the
   * screen and would sit on top of it the moment the map scrolls.
   */
  private drawSurface(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, geom: MapGeometry): void {
    const sun = scene.add.image(24, geom.titleY, MAP_TEX.sun).setTint(ZONE_PALETTES[0].accent);
    sun.setAlpha(0.85);
    parent.add(sun);
    // A waterline, not a dashed rule: one continuous line with foam crests riding over it.
    const foam = ZONE_PALETTES[0].foam;
    this.g.fillStyle(foam, 0.35);
    this.g.fillRect(0, geom.foamY + 1, geom.viewW, 1);
    this.g.fillStyle(foam, 0.8);
    for (let x = 0; x < geom.viewW; x += 9) {
      this.g.fillRect(x, geom.foamY, 4, 1);
      this.g.fillRect(x + 5, geom.foamY + 2, 3, 1);
    }
  }

  /** Dotted line from node to node: the road of a Mario map, drawn as pixels, never as a stroke. */
  private drawPath(geom: MapGeometry): void {
    this.g.fillStyle(ZONE_PALETTES[0].foam, 0.45);
    for (let i = 1; i < geom.nodes.length; i++) {
      const a = geom.nodes[i - 1];
      const b = geom.nodes[i];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.round(length / DOT_STEP));
      for (let k = 1; k < steps; k++) {
        const s = k / steps;
        // Skip the pixels the bubbles themselves cover, or the path pokes out of them.
        if (s * length < NODE_R + 2 || (1 - s) * length < NODE_R + 2) continue;
        this.g.fillRect(Math.round(a.x + dx * s) - 1, Math.round(a.y + dy * s) - 1, 2, 2);
      }
    }
  }

  /**
   * The bottom of the column: a jagged trench floor and Ámbar's silhouette above it (§2). She is drawn
   * in the hadal zone's own foam grey rather than in the panel colour — at 3 % brightness a darker
   * silhouette on black is not a silhouette, it is nothing — with one amber pixel for an eye.
   */
  private drawTrench(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, geom: MapGeometry): void {
    const deep = ZONE_PALETTES[ZONE_PALETTES.length - 1] ?? ZONE_PALETTES[0];
    const whale = scene.add.image(Math.round(geom.viewW / 2), geom.whaleY, MAP_TEX.whale);
    whale.setTint(deep.foam).setAlpha(0.55);
    parent.add(whale);
    const eye = scene.add.rectangle(Math.round(geom.viewW / 2) - 23, geom.whaleY - 2, 2, 2, deep.accent);
    eye.setOrigin(0.5, 0.5);
    parent.add(eye);

    // Trench floor: humps of rock along the last rows of the map.
    const floorY = geom.height - 14;
    this.g.fillStyle(deep.rock, 1);
    for (let x = 0; x < geom.viewW; x += 2) {
      const h = 6 + Math.round(4 * Math.sin(x * 0.21) + 3 * Math.sin(x * 0.07));
      this.g.fillRect(x, floorY + (14 - h), 2, h);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
