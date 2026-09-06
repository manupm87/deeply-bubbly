/**
 * One display object per `WorldEntity`, and the rule for animating it. Reads the snapshot entity only;
 * it never mutates it and holds no game rule — kinematics come from core (`solidRectAt`, `hazardRectAt`)
 * and the danger window from `hazardActiveAt`, so the tell can never disagree with the simulation.
 */
import type * as Phaser from 'phaser';
import { hazardActiveAt, hazardRectAt, solidRectAt, terminalDriftX } from '@deeply-bubbly/core';
import type { Ceiling, ForceField, Hazard, Pickup, Tuning, Wall, WorldEntity } from '@deeply-bubbly/core';
import { DEPTH } from './depth';
import { drawGlowLine, drawSolidBody, type SolidMaterial } from './solids';

import { CREATURE_SIZE, TEXTURE_KEYS, boyaKey, creatureKey, paletteOf, pickupKey } from './textures';
import type { ZonePalette } from '../palette';


export interface EntityView {
  /** `timeMs` is `snapshot.timeMs` — simulation time, never wall clock. */
  update(entity: WorldEntity, timeMs: number): void;
  destroy(): void;
}

const WORLD_W = 180;

function solidView(scene: Phaser.Scene, entity: Ceiling | Wall, p: ZonePalette): EntityView {
  const g = scene.add.graphics().setDepth(DEPTH.ledge);
  const glow = scene.add.graphics().setDepth(DEPTH.ledge + 1);
  const capturable = entity.type === 'ceiling' && entity.capturable;
  const material: SolidMaterial = entity.material;
  const { w, h } = entity.rect;
  // §5 nº 9's whole trick is that he IS a ledge, so he arrives here and not in `hazardView`; the
  // catalogue number is what lets the body drawer give him his own silhouette (§8: silhouette first).
  const catalogId = entity.type === 'ceiling' ? entity.catalogId : undefined;
  drawSolidBody(g, w, h, material, p, catalogId);
  drawGlowLine(glow, w, h, material, capturable, p);
  const bright = capturable && material !== 'jelly';
  return {
    update(e, timeMs) {
      if (e.type !== 'ceiling' && e.type !== 'wall') return;
      const r = solidRectAt(e, timeMs);
      const x = Math.round(r.x);
      const y = Math.round(r.y);
      g.setPosition(x, y);
      glow.setPosition(x, y);
      // The rest-line breathes so the eye finds it first; a jelly's underside never does.
      if (bright) glow.setAlpha(0.82 + 0.18 * Math.sin(timeMs / 520));
      // A shallow pulse: deeper than this and the jelly's pink washes out into the water's own hue.
      if (material === 'jelly') g.setAlpha(0.88 + 0.12 * Math.sin(timeMs / 380));
    },
    destroy: () => {
      g.destroy();
      glow.destroy();
    },
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
    drawSolidBody(g, entity.shape.w, entity.shape.h, 'coral', p);
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
  // A crown grown on a shelf's LIP hangs from it: same art, turned over, so the arms still point away
  // from the rock they are attached to (§8: the silhouette has to say where the thing is anchored).
  sprite.setFlipY(entity.growth === 'lip');
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
        // Dormant = RECEDED INTO THE WATER, not dead. NO tint: a multiply over a warm body is what
        // turned Don Hinchón olive-khaki, and any tint does it — a tint can only darken. Alpha alone
        // lets the water itself wash him out while his own hue survives. The state still reads in
        // greyscale (§8): dormant is the deflated frame, spines in, and the tell flashes and jitters.
        sprite.clearTint();
        sprite.setAlpha(0.45);
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

/**
 * A translucent band whose drifting dots show the flow direction at a glance (§5 nº 8).
 *
 * A `corriente` is the VERB of Zone 2 ("leer y usar las corrientes", §3.2), not scenery, so it is the
 * one field that has to be legible in a glance from a moving bubble: a denser stream of dots, a
 * visible tint, and two edge lines with a chevron rhythm that says which way the water goes even in
 * greyscale (§8: never colour alone).
 */
function fieldView(scene: Phaser.Scene, entity: ForceField, tuning: () => Tuning): EntityView {
  const tone = FIELD_TONES[entity.fieldType];
  const flow = entity.fieldType === 'corriente';
  const g = scene.add.graphics().setDepth(DEPTH.forcefield).setPosition(entity.rect.x, entity.rect.y);
  g.fillStyle(tone, flow ? 0.2 : 0.14);
  g.fillRect(0, 0, entity.rect.w, entity.rect.h);
  g.fillStyle(tone, flow ? 0.5 : 0.35);
  g.fillRect(0, 0, entity.rect.w, 1);
  g.fillRect(0, entity.rect.h - 1, entity.rect.w, 1);

  const speed = Math.hypot(entity.vector.x, entity.vector.y) || 1;
  const dirX = entity.vector.x / speed;
  const dirY = entity.vector.y / speed;

  if (flow && entity.rect.h > 8) {
    // 3 px chevrons along both edges, pointing downstream: the shape of the arrow, not a colour, so
    // the direction survives greyscale and a colour-blind reader (§8).
    g.fillStyle(tone, 0.6);
    const apex = dirX >= 0 ? 1 : 0;
    const tail = dirX >= 0 ? 0 : 1;
    for (let x = 4; x < entity.rect.w - 4; x += 12) {
      for (const y of [2, entity.rect.h - 5]) {
        g.fillRect(x + tail, y, 1, 1);
        g.fillRect(x + apex, y + 1, 1, 1);
        g.fillRect(x + tail, y + 2, 1, 1);
      }
    }
  }

  const density = flow ? 380 : 900;
  const cap = flow ? 30 : 14;
  const count = Math.max(4, Math.min(cap, Math.round((entity.rect.w * entity.rect.h) / density)));
  const dots: Phaser.GameObjects.Image[] = [];
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < count; i++) {
    px.push(entity.rect.x + ((i * 37) % Math.max(1, entity.rect.w)));
    py.push(entity.rect.y + ((i * 53) % Math.max(1, entity.rect.h)));
    const dot = scene.add.image(px[i] ?? 0, py[i] ?? 0, TEXTURE_KEYS.particle);
    dots.push(dot.setDepth(DEPTH.forcefield).setTint(tone).setAlpha(flow ? 0.85 : 0.7));
  }
  let last = -1;
  // A `corriente`'s dots travel at the terminal drift the physics settles at, so what the eye reads is
  // the speed Bur is about to be given. The identity lives in core (`terminalDriftX`) and is never
  // restated here. Every other field keeps the old cosmetic rate; none of them is a verb.
  return {
    update(_e, timeMs) {
      // Read per frame, from the LIVE tuning: the panel of §11.6 can move DAMPING_X mid-session, and a
      // drift frozen at load would draw the water at a speed the simulation no longer gives Bur.
      const drift = flow ? terminalDriftX(speed, tuning()) : Math.min(40, 6 + speed * 0.15);
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
  const breathes = entity.pickupType === 'aire' || entity.pickupType === 'aireGrande';
  let frame = -1;
  return {
    update(_e, timeMs) {
      const t = (timeMs + seed) / 1000;
      sprite.y = Math.round(entity.pos.y + Math.sin(t * 2) * 1.5);
      if (!breathes) return;
      // A bubble breathes at 1 Hz. Two integer-sized frames, never a fractional scale: the art is
      // drawn at design resolution and resampling it would be the one thing this project forbids.
      const next = Math.sin(t * Math.PI * 2) > 0 ? 1 : 0;
      if (next !== frame) {
        frame = next;
        sprite.setTexture(pickupKey(entity.pickupType, zone, next));
      }
      sprite.setAlpha(0.88 + 0.12 * Math.sin(t * 6));
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
export function createEntityView(
  scene: Phaser.Scene,
  entity: WorldEntity,
  zone: number,
  tuning: () => Tuning,
): EntityView | null {
  const p = paletteOf(zone);
  switch (entity.type) {
    case 'ceiling':
    case 'wall':
      return solidView(scene, entity, p);
    case 'hazard':
      return hazardView(scene, entity, zone, p);
    case 'forcefield':
      return fieldView(scene, entity, tuning);
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
