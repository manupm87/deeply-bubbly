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
import { commit, gfx, hexOf, mixColor, pxDisc, pxRing } from './pixels';
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

/** `frame` 1 is the "inhaled" frame of the 1 Hz bubble breath; only air pickups have one. */
export const pickupKey = (p: PickupType, zone: number, frame = 0): string =>
  `pickup-${p}-z${zone}${frame === 1 ? '-b' : ''}`;
/** §5 catalogue creature; `frame` is only used by Don Hinchón (0 = deflated, 1 = inflated). */
export const creatureKey = (catalogId: number, zone: number, frame = 0): string =>
  `hazard-${catalogId}-z${zone}-${frame}`;
export const boyaKey = (zone: number): string => `boya-z${zone}`;
export const godrayKey = (zone: number): string => `godray-z${zone}`;

export const paletteOf = (zone: number): ZonePalette => ZONE_PALETTES[zone] ?? ZONE_PALETTES[0];

// -----------------------------------------------------------------------------------------------
// Zone-independent
// -----------------------------------------------------------------------------------------------

/**
 * Bur at her base radius. She is the ONE sprite allowed to scale fractionally (§7 squash & stretch).
 *
 * ART DIRECTION: she used to be a hollow hoop filled with the water's own colour at 0.28, which made
 * her the lowest-contrast object on screen and very nearly the same drawing as an air pickup — and
 * under the §7 stretch her single 1 px rim resampled into a broken dashed outline. She is a BODY now:
 * an interior clearly lighter than any water, a bright glassy rim and a dark 1 px contour outside it,
 * so the silhouette survives whatever scale the stretch asks for.
 */
function buildBur(scene: Phaser.Scene): void {
  const g = gfx(scene);
  pxRing(g, 7, 7, BUR_TEX_RADIUS, 0x16323d, 0.45); // contour: holds the shape when she stretches
  pxDisc(g, 7, 7, BUR_TEX_RADIUS - 1, 0xbfeef2, 0.58);
  pxRing(g, 7, 7, BUR_TEX_RADIUS - 1, 0xe8f6f3, 1);
  g.fillStyle(0x5fa8bc, 0.35); // she is a sphere: a short shade arc on the lower right
  for (const [x, y] of [[11, 8], [11, 9], [10, 10], [9, 11], [8, 11]] as const) g.fillRect(x, y, 1, 1);
  g.fillStyle(0xe8f6f3, 1);
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

  // 4x4 aim dot: a 2x2 UI-white core inside a 1 px dark outline, so the guide survives on pale water.
  const dot = gfx(scene);
  dot.fillStyle(0x0a1520, 0.45);
  for (const [x, y] of [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]] as const) {
    dot.fillRect(x, y, 1, 1);
  }
  dot.fillStyle(UI.white, 1);
  dot.fillRect(1, 1, 2, 2);
  commit(scene, dot, TEXTURE_KEYS.dot, 4, 4);

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
  /** A bubble, not a disc: a glassy rim, a bright 2 px highlight up-left, almost empty inside. */
  const air = (key: string, r: number): void => {
    const g = gfx(scene);
    pxDisc(g, r, r, r - 1, mixColor(p.foam, p.waterTop, 0.55), 0.35);
    pxRing(g, r, r, r, p.foam, 0.95);
    g.fillStyle(mixColor(p.foam, p.waterBottom, 0.45), 0.7);
    g.fillRect(r, r + r - 1, 1, 1); // a touch of shade on the low rim
    g.fillStyle(p.foam, 1);
    g.fillRect(r - 2, r - 2, 2, 1);
    g.fillRect(r - 2, r - 1, 1, 1);
    commit(scene, g, key, r * 2 + 1, r * 2 + 1);
  };
  air(pickupKey('aire', zone), 3);
  air(pickupKey('aire', zone, 1), 4);
  air(pickupKey('aireGrande', zone), 6);
  air(pickupKey('aireGrande', zone, 1), 7);

  /**
   * A bead, not a sparkle. The old 5 px raster disc collapsed into a plus sign at this size, so the
   * small pearl is drawn by hand: rounded 4x4 body, warm rim, one bright glint up-left.
   */
  const body = mixColor(p.foam, p.accent, 0.45);
  const shade = mixColor(p.accent, p.rock, 0.45);
  const small = gfx(scene);
  small.fillStyle(p.accent, 1);
  small.fillRect(1, 0, 2, 4);
  small.fillRect(0, 1, 4, 2);
  small.fillStyle(body, 1);
  small.fillRect(1, 1, 2, 2);
  small.fillStyle(shade, 0.9);
  small.fillRect(2, 2, 1, 1);
  small.fillStyle(p.foam, 1);
  small.fillRect(1, 1, 1, 1);
  commit(scene, small, pickupKey('perla', zone), 4, 4);

  const big = gfx(scene);
  pxDisc(big, 3, 3, 3, body, 1);
  pxRing(big, 3, 3, 3, p.accent, 1);
  big.fillStyle(shade, 0.85);
  big.fillRect(3, 4, 2, 1);
  big.fillStyle(p.foam, 1);
  big.fillRect(2, 2, 1, 1);
  commit(scene, big, pickupKey('perlaGrande', zone), 7, 7);

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
