/**
 * Procedural pixel art of the world map, baked once at design resolution (1 texture px = 1 design px)
 * like every other texture in the game (SHELL.md "Arte procedural"). Everything is drawn WHITE and
 * tinted at use, so one bubble texture serves the four node states.
 *
 * Circles are rasterised by scanline rather than left to `fillCircle`: a Graphics arc is smoothed by
 * the renderer, and a smoothed 19 px bubble beside a hand-placed 1 px shell is the one thing that
 * makes a pixel-art screen look like a mock-up of itself.
 */
import type Phaser from 'phaser';
import { ensureTexture } from '../uiTextures';
import { NODE_R } from './geometry';

export const MAP_TEX = {
  bubble: 'map.bubble',
  bubbleRing: 'map.bubbleRing',
  glow: 'map.glow',
  lock: 'map.lock',
  shell: 'map.shell',
  island: 'map.island',
  whale: 'map.whale',
  sun: 'map.sun',
} as const;

/** Size of the square a bubble (and its ring) is baked into. */
export const BUBBLE_TEX_SIZE = NODE_R * 2 + 1;
/** The pulsing halo of the current node is one pixel wider on every side. */
export const GLOW_TEX_SIZE = BUBBLE_TEX_SIZE + 4;
export const LOCK_W = 7;
export const LOCK_H = 8;
export const SHELL_W = 5;
export const SHELL_H = 4;
export const ISLAND_W = 44;
export const ISLAND_H = 26;
export const WHALE_W = 72;
export const WHALE_H = 22;
export const SUN_SIZE = 13;

function px(g: Phaser.GameObjects.Graphics, x: number, y: number, w = 1, h = 1, alpha = 1): void {
  g.fillStyle(0xffffff, alpha);
  g.fillRect(x, y, w, h);
}

/** Filled disc of radius `r` centred in a (2r+1)² texture, one scanline at a time. */
function disc(g: Phaser.GameObjects.Graphics, r: number, alpha = 1): void {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.5);
    px(g, r - half, r + dy, half * 2 + 1, 1, alpha);
  }
}

/** The same disc with its interior removed: a 1 px ring, so the outline never blurs. */
function ring(g: Phaser.GameObjects.Graphics, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.5);
    const inner = Math.floor(Math.sqrt(Math.max(0, (r - 1) * (r - 1) - dy * dy)) + 0.5);
    if (Math.abs(dy) >= r - 1 || inner <= 0) {
      px(g, r - half, r + dy, half * 2 + 1, 1);
      continue;
    }
    px(g, r - half, r + dy, half - inner, 1);
    px(g, r + inner + 1, r + dy, half - inner, 1);
  }
}

/** 7×8 padlock: shackle above, body below, keyhole punched by leaving it unpainted. */
function drawLock(g: Phaser.GameObjects.Graphics): void {
  px(g, 2, 0, 3, 1);
  px(g, 1, 1, 1, 2);
  px(g, 5, 1, 1, 2);
  px(g, 0, 3, 7, 5);
  px(g, 3, 4, 1, 3, 0.25);
}

/** 5×4 shell: three ribs, the smallest thing that still reads as the station's conchas. */
function drawShell(g: Phaser.GameObjects.Graphics): void {
  px(g, 1, 0, 3, 1);
  px(g, 0, 1, 5, 2);
  px(g, 1, 3, 3, 1);
  px(g, 2, 1, 1, 2, 0.35);
}

/**
 * 44×26 island: a rounded dome sitting on its own beach, with a palm on the crown. The dome is an
 * ellipse rather than a ramp — a linear widening reads as a tent, which is what the first pass was.
 */
function drawIsland(g: Phaser.GameObjects.Graphics): void {
  const top = 5;
  const domeH = ISLAND_H - top - 4;
  for (let i = 0; i < domeH; i++) {
    // Half an ellipse: full width at the base, a 5 px cap at the top.
    const k = 1 - i / domeH;
    const w = Math.max(5, Math.round(ISLAND_W * Math.sqrt(Math.max(0, 1 - k * k))));
    px(g, Math.round((ISLAND_W - w) / 2), top + i, w, 1);
  }
  // Beach: one paler row under the dome, then the waterline dashes either side of it.
  px(g, 6, ISLAND_H - 4, ISLAND_W - 12, 1, 0.55);
  px(g, 1, ISLAND_H - 3, 9, 1, 0.4);
  px(g, ISLAND_W - 10, ISLAND_H - 3, 9, 1, 0.4);
  // Palm: a 3 px trunk with two fronds, so the silhouette is not a plain hill.
  px(g, 22, 1, 1, 5, 0.9);
  px(g, 19, 0, 3, 1, 0.9);
  px(g, 23, 0, 3, 1, 0.9);
  px(g, 18, 1, 2, 1, 0.7);
  px(g, 25, 1, 2, 1, 0.7);
}

/**
 * 72×22 whale: Ámbar waiting at the bottom of the trench (§2), head to the LEFT. One scanline per row
 * so the belly curve is a curve; the eye is left as a hole and `MapPath` drops an amber pixel in it,
 * which is the only colour on the whole silhouette and the reason she has a name.
 */
function drawWhale(g: Phaser.GameObjects.Graphics): void {
  // Body, one scanline per row: a round head on the left tapering back to the peduncle.
  const body: Array<[number, number, number]> = [
    [5, 16, 31],
    [6, 11, 42],
    [7, 8, 49],
    [8, 6, 53],
    [9, 5, 55],
    [10, 5, 56],
    [11, 5, 56],
    [12, 6, 54],
    [13, 8, 50],
    [14, 12, 43],
    [15, 18, 33],
  ];
  for (const [y, x, w] of body) px(g, x, y, w, 1);
  // Peduncle and flukes, drawn as ONE connected shape: a fluke floating a pixel clear of the body
  // reads as debris, not as a tail.
  const tail: Array<[number, number, number]> = [
    [5, 67, 5],
    [6, 66, 6],
    [7, 65, 7],
    [8, 64, 7],
    [9, 60, 11],
    [10, 60, 11],
    [11, 60, 11],
    [12, 60, 11],
    [13, 64, 7],
    [14, 65, 7],
    [15, 66, 6],
    [16, 67, 5],
  ];
  for (const [y, x, w] of tail) px(g, x, y, w, 1);
  // Dorsal fin above, pectoral fin below.
  px(g, 41, 2, 5, 1);
  px(g, 40, 3, 7, 1);
  px(g, 39, 4, 9, 1);
  px(g, 23, 16, 9, 1);
  px(g, 26, 17, 7, 1);
  // Mouth line and eye socket (the amber pixel goes in the socket, drawn by `MapPath`).
  px(g, 7, 12, 16, 1, 0.3);
  px(g, 12, 9, 2, 2, 0.1);
}

/** 13×13 sun for the surface band. */
function drawSun(g: Phaser.GameObjects.Graphics): void {
  disc(g, 6);
}

export function ensureMapTextures(scene: Phaser.Scene): void {
  const size = BUBBLE_TEX_SIZE;
  ensureTexture(scene, MAP_TEX.bubble, size, size, (g) => disc(g, NODE_R));
  ensureTexture(scene, MAP_TEX.bubbleRing, size, size, (g) => ring(g, NODE_R));
  ensureTexture(scene, MAP_TEX.glow, GLOW_TEX_SIZE, GLOW_TEX_SIZE, (g) => ring(g, NODE_R + 2));
  ensureTexture(scene, MAP_TEX.lock, LOCK_W, LOCK_H, drawLock);
  ensureTexture(scene, MAP_TEX.shell, SHELL_W, SHELL_H, drawShell);
  ensureTexture(scene, MAP_TEX.island, ISLAND_W, ISLAND_H, drawIsland);
  ensureTexture(scene, MAP_TEX.whale, WHALE_W, WHALE_H, drawWhale);
  ensureTexture(scene, MAP_TEX.sun, SUN_SIZE, SUN_SIZE, drawSun);
}
