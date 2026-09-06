/**
 * Procedural pixel art (SHELL.md "Arte procedural"). Every texture is generated at DESIGN resolution
 * (1 texture px = 1 design px) so nothing is ever sampled fractionally. There are no external assets.
 *
 * Zone-dependent keys carry a `-z<zone>` suffix and are built lazily on `zoneChange`. Rasters live in
 * `pixels.ts`; the §5 catalogue lives in `creatureTextures.ts`.
 */
import type * as Phaser from 'phaser';
import type { PickupType, ZoneIndex } from '@deeply-bubbly/core';
import { UI, ZONE_PALETTES, type ZonePalette } from '../palette';
import { commit, gfx, hexOf, pxDisc, pxRing } from './pixels';
import { buildCreatures } from './creatureTextures';

export { CREATURE_SIZE, CREATURE_FRAMES } from './creatureTextures';

/** Zone-independent keys. */
export const TEXTURE_KEYS = {
  bur: 'bur',
  burEyes: 'bur-eyes',
  burEyesBlink: 'bur-eyes-blink',
  particle: 'particle-bubble',
  dot: 'dot',
  snow: 'snow',
} as const;

/** Bur's texture is drawn at this radius; BubbleView scales by `bubble.radius / BUR_TEX_RADIUS`. */
export const BUR_TEX_RADIUS = 7;

export const pickupKey = (p: PickupType, zone: number): string => `pickup-${p}-z${zone}`;
/** §5 catalogue creature; `frame` is only used by Don Hinchón (0 = deflated, 1 = inflated). */
export const creatureKey = (catalogId: number, zone: number, frame = 0): string =>
  `hazard-${catalogId}-z${zone}-${frame}`;
export const boyaKey = (zone: number): string => `boya-z${zone}`;
export const godrayKey = (zone: number): string => `godray-z${zone}`;

export const paletteOf = (zone: number): ZonePalette => ZONE_PALETTES[zone] ?? ZONE_PALETTES[0];

// -----------------------------------------------------------------------------------------------
// Zone-independent
// -----------------------------------------------------------------------------------------------

/** Bur at her base radius. She is the ONE sprite allowed to scale fractionally (§7 squash & stretch). */
function buildBur(scene: Phaser.Scene): void {
  const g = gfx(scene);
  pxDisc(g, 7, 7, BUR_TEX_RADIUS, 0x9fdfe6, 0.28);
  pxRing(g, 7, 7, BUR_TEX_RADIUS, 0xe8f6f3, 0.95);
  g.fillStyle(0xe8f6f3, 0.85);
  g.fillRect(4, 3, 2, 1); // 2x1 highlight, top-left (GDD §8)
  g.fillRect(3, 4, 1, 1);
  commit(scene, g, TEXTURE_KEYS.bur, 15, 15);
}

/** Two 1 px eyes, and their closed counterpart for the blink. Origin is the centre of the pair. */
function buildEyes(scene: Phaser.Scene): void {
  const open = gfx(scene);
  open.fillStyle(0x1e2a38, 1);
  open.fillRect(1, 1, 1, 1);
  open.fillRect(5, 1, 1, 1);
  commit(scene, open, TEXTURE_KEYS.burEyes, 7, 3);

  const blink = gfx(scene);
  blink.fillStyle(0x1e2a38, 1);
  blink.fillRect(0, 1, 3, 1);
  blink.fillRect(4, 1, 3, 1);
  commit(scene, blink, TEXTURE_KEYS.burEyesBlink, 7, 3);
}

function buildBits(scene: Phaser.Scene): void {
  const bubble = gfx(scene);
  bubble.fillStyle(0xe8f6f3, 0.9);
  bubble.fillRect(1, 0, 1, 1);
  bubble.fillRect(0, 1, 1, 1);
  bubble.fillRect(2, 1, 1, 1);
  bubble.fillRect(1, 2, 1, 1);
  commit(scene, bubble, TEXTURE_KEYS.particle, 3, 3);

  const dot = gfx(scene);
  dot.fillStyle(UI.white, 1);
  dot.fillRect(0, 0, 2, 2);
  commit(scene, dot, TEXTURE_KEYS.dot, 2, 2);

  const snow = gfx(scene);
  snow.fillStyle(0xd8e8ee, 1);
  snow.fillRect(0, 0, 1, 1);
  commit(scene, snow, TEXTURE_KEYS.snow, 1, 1);
}

/** Idempotent. */
export function buildCommonTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEXTURE_KEYS.bur)) return;
  buildBur(scene);
  buildEyes(scene);
  buildBits(scene);
}

// -----------------------------------------------------------------------------------------------
// Zone-dependent
// -----------------------------------------------------------------------------------------------

function buildPickups(scene: Phaser.Scene, zone: number, p: ZonePalette): void {
  const air = (key: string, r: number): void => {
    const g = gfx(scene);
    pxDisc(g, r, r, r, 0xcfeef5, 0.35);
    pxRing(g, r, r, r, p.foam, 0.95);
    g.fillStyle(p.foam, 0.9);
    g.fillRect(r - Math.ceil(r / 2), r - Math.ceil(r / 2), 1, 1);
    commit(scene, g, key, r * 2 + 1, r * 2 + 1);
  };
  air(pickupKey('aire', zone), 3);
  air(pickupKey('aireGrande', zone), 6);

  const pearl = (key: string, r: number): void => {
    const g = gfx(scene);
    pxDisc(g, r, r, r, p.foam, 1);
    pxRing(g, r, r, r, p.accent, 0.8);
    g.fillStyle(p.accent, 0.9);
    g.fillRect(r - 1, r - 1, 1, 1);
    commit(scene, g, key, r * 2 + 1, r * 2 + 1);
  };
  pearl(pickupKey('perla', zone), 2);
  pearl(pickupKey('perlaGrande', zone), 4);

  const shell = gfx(scene);
  pxDisc(shell, 5, 8, 5, p.coral, 1);
  shell.fillStyle(p.foam, 0.55);
  for (let i = 0; i < 3; i++) shell.fillRect(2 + i * 2, 4 + i, 1, 5 - i);
  shell.fillStyle(p.rock, 0.9);
  shell.fillRect(0, 9, 11, 1);
  commit(scene, shell, pickupKey('concha', zone), 11, 10);
}

/** Anchored bubble marking a silent respawn point (§3.1): a bubble on a short tether. */
function buildBoya(scene: Phaser.Scene, zone: number, p: ZonePalette): void {
  const g = gfx(scene);
  pxDisc(g, 5, 5, 4, p.accent, 0.35);
  pxRing(g, 5, 5, 4, p.accent, 0.95);
  g.fillStyle(p.foam, 0.6);
  g.fillRect(5, 10, 1, 3);
  g.fillStyle(p.rock, 1);
  g.fillRect(3, 13, 5, 1);
  commit(scene, g, boyaKey(zone), 10, 14);
}

/** Soft vertical light shaft; `Background` animates its alpha with a sine. */
function buildGodray(scene: Phaser.Scene, zone: number, p: ZonePalette): void {
  const key = godrayKey(zone);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const w = 32;
  const h = 420; // MAX_VIEW_H: never scaled, so the shaft always covers the tallest viewport
  const canvas = scene.textures.createCanvas(key, w, h);
  if (!canvas) return;
  const c = canvas.getContext();
  const vertical = c.createLinearGradient(0, 0, 0, h);
  vertical.addColorStop(0, hexOf(p.accent));
  vertical.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = vertical;
  c.fillRect(0, 0, w, h);
  // Soft left/right falloff, punched into the alpha channel so the shaft has no hard edges.
  const horizontal = c.createLinearGradient(0, 0, w, 0);
  horizontal.addColorStop(0, 'rgba(0,0,0,0)');
  horizontal.addColorStop(0.5, 'rgba(0,0,0,1)');
  horizontal.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = horizontal;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
  canvas.refresh();
}

/** Idempotent per zone: cheap to call on every `zoneChange`. */
export function buildZoneTextures(scene: Phaser.Scene, zone: ZoneIndex): void {
  buildCommonTextures(scene);
  if (scene.textures.exists(boyaKey(zone))) return;
  const p = paletteOf(zone);
  buildPickups(scene, zone, p);
  buildBoya(scene, zone, p);
  buildGodray(scene, zone, p);
  buildCreatures(scene, zone, p, creatureKey);
}
