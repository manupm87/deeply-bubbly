/**
 * One display object per `WorldEntity`, and the rule for animating it. Reads the snapshot entity only;
 * it never mutates it and holds no game rule — kinematics come from core (`solidRectAt`, `hazardRectAt`)
 * and the danger window from `hazardActiveAt`, so the tell can never disagree with the simulation.
 */
import type * as Phaser from 'phaser';
import { hazardActiveAt, hazardRectAt, solidRectAt } from '@deeply-bubbly/core';
import type { Ceiling, ForceField, Hazard, Pickup, Wall, WorldEntity } from '@deeply-bubbly/core';
import { DEPTH } from './depth';
import { pxDither, type G } from './pixels';
import { CREATURE_SIZE, TEXTURE_KEYS, boyaKey, creatureKey, paletteOf, pickupKey } from './textures';
import type { ZonePalette } from '../palette';


export interface EntityView {
  /** `timeMs` is `snapshot.timeMs` — simulation time, never wall clock. */
  update(entity: WorldEntity, timeMs: number): void;
  destroy(): void;
}

const WORLD_W = 180;

type Material = Ceiling['material'] | 'reef' | 'hadal';

/** Fill pair + glow colour per material. The bottom face of a capturable ceiling always glows (§2.3). */
function materialTones(m: Material, p: ZonePalette): [number, number, number] {
  switch (m) {
    case 'coral':
      return [p.coral, p.rock, p.foam];
    case 'kelp':
      return [p.kelp, p.rockLight, p.foam];
    case 'jelly':
      return [p.jelly, p.foam, p.foam];
    case 'snow':
      return [p.foam, p.rockLight, p.foam];
    case 'shell':
    case 'foam':
      return [p.foam, p.rockLight, p.foam];
    case 'creature':
      return [p.rockLight, p.kelp, p.foam];
    case 'reef':
      return [p.coral, p.rock, p.rockLight];
    case 'hadal':
      return [p.rock, p.rockLight, p.rockLight];
    default:
      return [p.rock, p.rockLight, p.foam];
  }
}

/** Draws a solid in LOCAL coordinates (0,0 .. w,h). Silhouette + dithering + the bottom glow line. */
function drawSolid(g: G, w: number, h: number, m: Material, capturable: boolean, p: ZonePalette): void {
  const [a, b, glow] = materialTones(m, p);
  g.clear();
  const soft = m === 'jelly' || m === 'snow';
  pxDither(g, 0, 0, w, h, a, b, soft ? 0.55 : 1);
  if (m === 'kelp') {
    g.fillStyle(a, 0.9);
    for (let x = 1; x < w; x += 5) g.fillRect(x, h, 1, 3 + (x % 3));
  }
  if (m === 'creature') {
    g.fillStyle(p.rock, 0.9);
    for (let x = 6; x < w - 4; x += 8) g.fillRect(x, 1, 1, h - 2);
    g.fillStyle(p.foam, 0.9);
    g.fillRect(w, Math.max(0, h - 4), 2, 3); // head poking out to the right
  }
  if (m === 'jelly') {
    g.fillStyle(a, 0.75);
    for (let x = 2; x < w; x += 4) g.fillRect(x, h, 1, 4);
  }
  // Top shadow, then the capture cue: 1 px bright on the bottom face, dim when it cannot capture.
  g.fillStyle(p.rock, 0.35);
  g.fillRect(0, 0, w, 1);
  g.fillStyle(capturable ? glow : p.rockLight, capturable ? 0.95 : 0.35);
  g.fillRect(0, h - 1, w, 1);
}

function solidView(scene: Phaser.Scene, entity: Ceiling | Wall, p: ZonePalette): EntityView {
  const g = scene.add.graphics().setDepth(DEPTH.ledge);
  const capturable = entity.type === 'ceiling' && entity.capturable;
  const material: Material = entity.material;
  drawSolid(g, entity.rect.w, entity.rect.h, material, capturable, p);
  return {
    update(e, timeMs) {
      if (e.type !== 'ceiling' && e.type !== 'wall') return;
      const r = solidRectAt(e, timeMs);
      g.setPosition(Math.round(r.x), Math.round(r.y));
      if (material === 'jelly') g.setAlpha(0.7 + 0.25 * Math.sin(timeMs / 380));
    },
    destroy: () => g.destroy(),
  };
}

/** ms of warning left before this hazard turns dangerous, or Infinity when it already is / never tells. */
function tellCountdown(h: Hazard, timeMs: number): number {
  const period = h.periodMs;
  const tell = h.tellMs;
  if (period === undefined || tell === undefined || !(period > 0)) return Infinity;
  const fraction = h.activeFraction ?? 1;
  if (fraction >= 1) return Infinity;
  const raw = ((timeMs + (h.phaseMs ?? 0)) % period + period) % period;
  const activeEnd = fraction * period;
  return raw < activeEnd ? Infinity : period - raw;
}

function hazardView(scene: Phaser.Scene, entity: Hazard, zone: number, p: ZonePalette): EntityView {
  const cx = entity.shape.x + entity.shape.w / 2;
  const cy = entity.shape.y + entity.shape.h / 2;
  const key = creatureKey(entity.catalogId, zone, 0);
  const hasArt = scene.textures.exists(key) && CREATURE_SIZE[entity.catalogId] !== undefined;

  if (!hasArt) {
    const g = scene.add.graphics().setDepth(DEPTH.hazard);
    drawSolid(g, entity.shape.w, entity.shape.h, 'coral', false, p);
    return {
      update(e, timeMs) {
        if (e.type !== 'hazard') return;
        const r = hazardRectAt(e, timeMs);
        g.setPosition(Math.round(r.x), Math.round(r.y));
        g.setAlpha(hazardActiveAt(e, timeMs) ? 1 : 0.5);
      },
      destroy: () => g.destroy(),
    };
  }

  const sprite = scene.add.sprite(cx, cy, key).setDepth(DEPTH.hazard);
  const multiFrame = entity.catalogId === 5;
  return {
    update(e, timeMs) {
      if (e.type !== 'hazard') return;
      const r = hazardRectAt(e, timeMs);
      sprite.setPosition(Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2));
      const active = hazardActiveAt(e, timeMs);
      if (multiFrame) sprite.setTexture(creatureKey(5, zone, active ? 1 : 0));
      const countdown = tellCountdown(e, timeMs);
      const telling = countdown <= (e.tellMs ?? 0);
      if (active) {
        sprite.clearTint();
        sprite.setAlpha(1);
      } else if (telling) {
        // The tell is a rhythm, not a colour: it flashes and jitters 1 px so it reads in greyscale
        // too (§8 accessibility). Never a scale pulse: the art is pixel-exact and must not resample.
        const t = 1 - countdown / Math.max(1, e.tellMs ?? 1);
        sprite.setTint(p.accent);
        sprite.setAlpha(0.7 + 0.3 * Math.abs(Math.sin(timeMs / 70)));
        sprite.y += Math.sin(timeMs / 55) > 0 ? Math.round(t) : 0;
      } else {
        sprite.setTint(0x8e9aa8);
        sprite.setAlpha(0.6);
      }
    },
    destroy: () => sprite.destroy(),
  };
}

const FIELD_TONES: Readonly<Record<ForceField['fieldType'], number>> = {
  corriente: 0x6fd8c6,
  fumarola: 0xff9a3c,
  salmuera: 0xb48ad8,
  frio: 0x7fb8d8,
  descendente: 0x4f7a9a,
};

/** A translucent band whose drifting dots show the flow direction at a glance (§5 nº 8). */
function fieldView(scene: Phaser.Scene, entity: ForceField): EntityView {
  const tone = FIELD_TONES[entity.fieldType];
  const g = scene.add.graphics().setDepth(DEPTH.forcefield).setPosition(entity.rect.x, entity.rect.y);
  g.fillStyle(tone, 0.14);
  g.fillRect(0, 0, entity.rect.w, entity.rect.h);
  g.fillStyle(tone, 0.35);
  g.fillRect(0, 0, entity.rect.w, 1);
  g.fillRect(0, entity.rect.h - 1, entity.rect.w, 1);

  const speed = Math.hypot(entity.vector.x, entity.vector.y) || 1;
  const dirX = entity.vector.x / speed;
  const dirY = entity.vector.y / speed;
  const count = Math.max(4, Math.min(14, Math.round((entity.rect.w * entity.rect.h) / 900)));
  const dots: Phaser.GameObjects.Image[] = [];
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < count; i++) {
    px.push(entity.rect.x + ((i * 37) % Math.max(1, entity.rect.w)));
    py.push(entity.rect.y + ((i * 53) % Math.max(1, entity.rect.h)));
    const dot = scene.add.image(px[i] ?? 0, py[i] ?? 0, TEXTURE_KEYS.particle);
    dots.push(dot.setDepth(DEPTH.forcefield).setTint(tone).setAlpha(0.7));
  }
  let last = -1;
  const drift = Math.min(40, 6 + speed * 0.15);
  return {
    update(_e, timeMs) {
      const dt = last < 0 ? 0 : Math.min(0.1, (timeMs - last) / 1000);
      last = timeMs;
      for (let i = 0; i < dots.length; i++) {
        let x = (px[i] ?? 0) + dirX * drift * dt;
        let y = (py[i] ?? 0) + dirY * drift * dt;
        if (x < entity.rect.x) x += entity.rect.w;
        if (x > entity.rect.x + entity.rect.w) x -= entity.rect.w;
        if (y < entity.rect.y) y += entity.rect.h;
        if (y > entity.rect.y + entity.rect.h) y -= entity.rect.h;
        px[i] = x;
        py[i] = y;
        dots[i]?.setPosition(Math.round(x), Math.round(y));
      }
    },
    destroy() {
      g.destroy();
      for (const d of dots) d.destroy();
    },
  };
}

function pickupView(scene: Phaser.Scene, entity: Pickup, zone: number): EntityView {
  const sprite = scene.add
    .image(entity.pos.x, entity.pos.y, pickupKey(entity.pickupType, zone))
    .setDepth(DEPTH.pickup);
  const seed = (entity.pos.x * 7 + entity.pos.y * 13) % 1000;
  const blinks = entity.pickupType === 'aire' || entity.pickupType === 'aireGrande';
  return {
    update(_e, timeMs) {
      const t = (timeMs + seed) / 1000;
      sprite.y = Math.round(entity.pos.y + Math.sin(t * 2) * 1.5);
      if (blinks) sprite.setAlpha(0.8 + 0.2 * Math.sin(t * 6));
    },
    destroy: () => sprite.destroy(),
  };
}

function boyaView(scene: Phaser.Scene, worldY: number, zone: number): EntityView {
  const sprite = scene.add.image(WORLD_W / 2, worldY, boyaKey(zone)).setDepth(DEPTH.boya).setAlpha(0.85);
  return {
    update(_e, timeMs) {
      sprite.y = Math.round(worldY + Math.sin(timeMs / 700) * 2);
    },
    destroy: () => sprite.destroy(),
  };
}

/** The rest station is a calm band of light: no geometry, just a place that reads as safe. */
function stationView(scene: Phaser.Scene, worldY: number, p: ZonePalette): EntityView {
  const g = scene.add.graphics().setDepth(DEPTH.station).setPosition(0, worldY);
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    g.fillStyle(p.foam, 0.14 + 0.16 * Math.sin((i / bands) * Math.PI));
    g.fillRect(0, (i * 240) / bands, WORLD_W, 240 / bands);
  }
  // NOT a 1 px light line across the column: that is the visual language of a capturable ledge's
  // bottom glow (§2.3). A rest station is a dotted THRESHOLD plus a wide soft halo under it.
  g.fillStyle(p.foam, 0.75);
  for (let x = 2; x < WORLD_W; x += 6) g.fillRect(x, 0, 3, 1);
  g.fillStyle(p.foam, 0.16);
  g.fillRect(0, 1, WORLD_W, 3);
  return {
    update(_e, timeMs) {
      g.setAlpha(0.85 + 0.15 * Math.sin(timeMs / 900));
    },
    destroy: () => g.destroy(),
  };
}

/** Returns null for entities with no visual of their own (anchors: authoring data, debug-only). */
export function createEntityView(scene: Phaser.Scene, entity: WorldEntity, zone: number): EntityView | null {
  const p = paletteOf(zone);
  switch (entity.type) {
    case 'ceiling':
    case 'wall':
      return solidView(scene, entity, p);
    case 'hazard':
      return hazardView(scene, entity, zone, p);
    case 'forcefield':
      return fieldView(scene, entity);
    case 'pickup':
      return pickupView(scene, entity, zone);
    case 'boya':
      return boyaView(scene, entity.worldY, zone);
    case 'station':
      return stationView(scene, entity.worldY, p);
    case 'anchor':
      return null;
  }
}
