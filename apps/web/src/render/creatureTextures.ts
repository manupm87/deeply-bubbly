/**
 * §5 catalogue creatures 1–9 as procedural pixel art, one texture per creature per zone. Silhouette is
 * the primary channel (§8 accessibility: "peligros distinguibles por silueta y patrón además de por
 * color"), so every one of them reads differently at 12–40 px even in greyscale.
 *
 * nº 8 (Corriente de Arrecife) has no texture: a force field is drawn as a band with drifting dots.
 */
import type * as Phaser from 'phaser';
import { commit, gfx, pxDisc, pxDither, pxRing, pxSpikes, type G } from './pixels';
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

/** nº 5 Don Hinchón: 40x40, frame 0 deflated (safe window), frame 1 inflated with spikes out. */
const hinchon: Draw = (g, p, frame) => {
  const inflated = frame === 1;
  const r = inflated ? 17 : 12;
  pxDisc(g, 20, 20, r, p.accent, 0.9);
  pxRing(g, 20, 20, r, p.coral, 1);
  if (inflated) pxSpikes(g, 20, 20, r + 1, 3, 20, p.coral);
  g.fillStyle(p.foam, 1);
  g.fillRect(20 - Math.round(r * 0.5), 20 - 4, 3, 3);
  g.fillRect(20 + Math.round(r * 0.5) - 3, 20 - 4, 3, 3);
  g.fillStyle(0x1e2a38, 1);
  g.fillRect(20 - Math.round(r * 0.5) + 1, 20 - 3, 1, 1);
  g.fillRect(20 + Math.round(r * 0.5) - 2, 20 - 3, 1, 1);
  g.fillStyle(p.coral, 1);
  g.fillRect(18, 20 + Math.round(r * 0.4), 4, inflated ? 1 : 2); // mouth: a line, or a smile
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
