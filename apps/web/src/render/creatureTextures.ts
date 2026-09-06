/**
 * §5 catalogue creatures 1–9 as procedural pixel art, one texture per creature per zone. Silhouette is
 * the primary channel (§8 accessibility: "peligros distinguibles por silueta y patrón además de por
 * color"), so every one of them reads differently at 12–40 px even in greyscale.
 *
 * nº 8 (Corriente de Arrecife) has no texture: a force field is drawn as a band with drifting dots.
 */
import type * as Phaser from 'phaser';
import { commit, gfx, mixColor, pxDisc, pxDither, pxRing, pxSpikes, type G } from './pixels';
import type { ZonePalette } from '../palette';

/** Canonical size of every creature texture in design px. Content sizes hitboxes to match. */
export const CREATURE_SIZE: Readonly<Record<number, { w: number; h: number }>> = {
  1: { w: 24, h: 12 },
  2: { w: 10, h: 16 },
  3: { w: 26, h: 14 },
  4: { w: 12, h: 8 },
  5: { w: 40, h: 40 },
  6: { w: 14, h: 14 },
  7: { w: 16, h: 14 },
  9: { w: 18, h: 12 },
};

type Draw = (g: G, p: ZonePalette, frame: number) => void;

/** nº 1 Medusa Farolillo: dome cap + four tentacles. Trampoline, never a perch. */
const medusa: Draw = (g, p) => {
  pxDisc(g, 12, 10, 8, p.jelly, 0.45);
  pxRing(g, 12, 10, 8, p.jelly, 0.9);
  g.fillStyle(0x000000, 0);
  g.fillRect(0, 11, 24, 1); // flat underside: Bur hits the cap from below
  g.fillStyle(p.jelly, 0.9);
  g.fillRect(0, 10, 24, 2);
  g.fillStyle(p.foam, 0.8);
  for (const x of [5, 10, 14, 19]) g.fillRect(x, 3, 1, 1);
};

/** nº 2 Alga Cinta: a ribbon of kelp, soft and absorbing. */
const alga: Draw = (g, p) => {
  pxDither(g, 3, 0, 4, 16, p.kelp, p.rockLight, 1);
  g.fillStyle(p.kelp, 0.85);
  for (let y = 0; y < 16; y += 2) g.fillRect(y % 4 === 0 ? 1 : 7, y, 2, 2);
};

/** nº 3 Tortuga Paseante: shell with plates, head to the right. */
const tortuga: Draw = (g, p) => {
  pxDisc(g, 13, 12, 11, p.rock, 1);
  g.fillStyle(0x000000, 0);
  g.fillRect(0, 13, 26, 1);
  pxDither(g, 2, 4, 22, 8, p.kelp, p.rockLight, 1);
  g.fillStyle(p.rock, 1);
  for (const x of [8, 13, 18]) g.fillRect(x, 4, 1, 8);
  g.fillRect(2, 8, 22, 1);
  g.fillStyle(p.foam, 0.9);
  g.fillRect(24, 9, 2, 3); // head
  g.fillStyle(0x1e2a38, 1);
  g.fillRect(25, 10, 1, 1);
};

/** nº 4 Banco de Peces Payaso: one little fish; the shoal is many of these. */
const payaso: Draw = (g, p) => {
  g.fillStyle(p.coral, 1);
  g.fillRect(2, 2, 8, 4);
  g.fillRect(3, 1, 5, 6);
  g.fillStyle(p.foam, 1);
  g.fillRect(4, 1, 1, 6);
  g.fillRect(7, 1, 1, 6);
  g.fillStyle(p.coral, 1);
  g.fillRect(0, 2, 2, 4); // tail
  g.fillStyle(0x1e2a38, 1);
  g.fillRect(8, 3, 1, 1);
};

/** Integer-rastered ellipse: the only shape that lets a fish body break out of a circle. */
function pxEllipse(g: G, cx: number, cy: number, rx: number, ry: number, colour: number, alpha = 1): void {
  g.fillStyle(colour, alpha);
  for (let y = -ry; y <= ry; y++) {
    const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    g.fillRect(cx - dx, cy + y, dx * 2 + 1, 1);
  }
}

/**
 * nº 5 Don Hinchón: 40x40. Frame 0 is the deflated fish (the safe window), frame 1 the puffed ball.
 *
 * ART DIRECTION: as a saturated yellow disc with orange rays and a neutral human face he read as a
 * cartoon SUN — friendly, and the single loudest thing on screen, louder than the rest lines that are
 * supposed to be the clearest cue in the game. So: a muted sand body (never the raw zone accent), a
 * tail and a fin that break the circle, spots for greyscale texture, and a scowl. Cross and puffed —
 * a grumpy fish, not a menace. Nothing in him is brighter than the water's own foam tint.
 */
const hinchon: Draw = (g, p, frame) => {
  const inflated = frame === 1;
  const body = mixColor(mixColor(p.accent, p.coral, 0.45), p.rock, 0.14);
  const belly = mixColor(body, p.foam, 0.4);
  const spot = mixColor(body, 0x16202c, 0.45);
  const fin = mixColor(p.coral, p.rock, 0.35);
  const rx = inflated ? 15 : 14;
  const ry = inflated ? 15 : 9;

  // Caudal fin at the left, drawn first so the body overlaps its root.
  g.fillStyle(fin, 1);
  for (let i = 0; i < 6; i++) {
    const spread = inflated ? 2 + i : 2 + Math.round(i * 1.8);
    g.fillRect(20 - rx - 4 + i, 20 - spread, 1, spread * 2 + 1);
  }
  pxEllipse(g, 20, 20, rx, ry, 0x16202c, 0.7); // 1 px dark contour: he must hold up over pale water
  pxEllipse(g, 20, 20, rx - 1, ry - 1, body, 1);
  pxEllipse(g, 20, 20 + Math.round(ry * 0.6), rx - 7, Math.max(1, Math.round(ry * 0.26)), belly, 0.5);
  if (inflated) {
    // Spines, not sunrays: short, uneven, and rooted in the dark contour.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const len = 2 + (i % 3);
      g.fillStyle(fin, 1);
      for (let t = 0; t < len; t++) {
        g.fillRect(Math.round(20 + Math.cos(a) * (rx + t)), Math.round(20 + Math.sin(a) * (ry + t)), 1, 1);
      }
    }
  }
  g.fillStyle(fin, 0.75); // pectoral fin, on his flank — at the very bottom it read as a red smear
  const fx = 20 - Math.round(rx * 0.45);
  const fy = 20 + Math.round(ry * 0.35);
  g.fillRect(fx, fy, 5, 2);
  g.fillRect(fx + 1, fy + 2, 3, 1);
  g.fillStyle(spot, 0.85);
  for (const [dx, dy] of [[-7, -4], [-2, -6], [4, -3], [1, 1], [-4, 2]] as const) {
    g.fillRect(20 + dx, 20 + Math.round(dy * (ry / 12)), 2, 1);
  }

  const ex = 20 + Math.round(rx * 0.34);
  const ey = 20 - Math.round(ry * 0.3);
  g.fillStyle(p.foam, 1);
  g.fillRect(ex, ey, 4, 3);
  g.fillStyle(0x1e2a38, 1);
  g.fillRect(ex + 2, ey + 1, 2, 2); // pupil forward: he is looking at whoever woke him up
  g.fillRect(ex - 1, ey - 1, 4, 1); // brow sloping down over the eye: cross, never sad
  g.fillRect(ex - 2, ey, 1, 1);
  // Beak at the FRONT, level with the eye: a short frown with a 1 px underbite.
  const mx = 20 + rx - 5;
  const my = 20 + Math.round(ry * 0.12);
  g.fillRect(mx, my, 4, 1);
  g.fillRect(mx - 1, my - 1, 1, 1);
  g.fillRect(mx + 2, my + 1, 2, 1);
};

/** nº 6 Erizo Coralino: static spiky ball. Its orange breaks the palette on purpose (§5). */
const erizo: Draw = (g, p) => {
  pxDisc(g, 7, 7, 4, 0xf26b4f, 1);
  pxSpikes(g, 7, 7, 5, 2, 12, 0xff8c3c);
  g.fillStyle(p.rock, 1);
  g.fillRect(6, 6, 1, 1);
  g.fillRect(8, 7, 1, 1);
};

/** nº 7 Anémona Pegajosa: a base with a crown of waving arms. */
const anemona: Draw = (g, p) => {
  pxDither(g, 4, 9, 8, 5, p.coral, p.rock, 1);
  g.fillStyle(p.jelly, 0.95);
  for (let i = 0; i < 7; i++) {
    const x = 1 + i * 2;
    const top = i % 2 === 0 ? 1 : 3;
    g.fillRect(x, top, 1, 9 - top);
    g.fillRect(x, top, 2, 1);
  }
};

/** nº 9 Pulpo Camuflado: looks like a ledge, has eyes and eight stubs. */
const pulpo: Draw = (g, p) => {
  pxDither(g, 0, 0, 18, 7, p.rock, p.rockLight, 1);
  g.fillStyle(p.rock, 1);
  for (let i = 0; i < 8; i++) g.fillRect(1 + i * 2, 7, 1, 3 + (i % 2));
  g.fillStyle(p.foam, 0.9);
  g.fillRect(5, 3, 2, 2);
  g.fillRect(11, 3, 2, 2);
  g.fillStyle(0x1e2a38, 1);
  g.fillRect(6, 4, 1, 1);
  g.fillRect(12, 4, 1, 1);
};

const DRAWERS: Readonly<Record<number, Draw>> = {
  1: medusa,
  2: alga,
  3: tortuga,
  4: payaso,
  5: hinchon,
  6: erizo,
  7: anemona,
  9: pulpo,
};

/** Creatures with more than one frame; the renderer picks the frame from the hazard's phase. */
export const CREATURE_FRAMES: Readonly<Record<number, number>> = { 5: 2 };

export function buildCreatures(
  scene: Phaser.Scene,
  zone: number,
  palette: ZonePalette,
  key: (catalogId: number, zone: number, frame: number) => string,
): void {
  for (const [idText, draw] of Object.entries(DRAWERS)) {
    const id = Number(idText);
    const size = CREATURE_SIZE[id];
    if (!size) continue;
    const frames = CREATURE_FRAMES[id] ?? 1;
    for (let f = 0; f < frames; f++) {
      const g = gfx(scene);
      draw(g, palette, f);
      commit(scene, g, key(id, zone, f), size.w, size.h);
    }
  }
}
