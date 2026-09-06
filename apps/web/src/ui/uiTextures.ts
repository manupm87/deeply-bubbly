/**
 * Procedural UI textures, generated once at design resolution (1 texture px = 1 design px).
 * All shapes are drawn WHITE so the HUD can tint them; UI colours never appear in the world.
 */
import type Phaser from 'phaser';

export const TEX = {
  pip: 'ui.pip',
  pipEmpty: 'ui.pipEmpty',
  fish: 'ui.fish',
  shell: 'ui.shell',
  pearl: 'ui.pearl',
  hand: 'ui.hand',
} as const;

/** Draws `draw` into an off-screen Graphics and bakes it into a texture (idempotent). */
export function ensureTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.add.graphics();
  g.setVisible(false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

function px(g: Phaser.GameObjects.Graphics, x: number, y: number, w = 1, h = 1, alpha = 1): void {
  g.fillStyle(0xffffff, alpha);
  g.fillRect(x, y, w, h);
}

/** 6×6 air pip: filled bubble with a 2×1 highlight. */
function drawPip(g: Phaser.GameObjects.Graphics): void {
  px(g, 2, 0, 2, 1);
  px(g, 1, 1, 4, 4);
  px(g, 0, 2, 6, 2);
  px(g, 2, 5, 2, 1);
  px(g, 1, 1, 2, 1, 0.35);
}

/** 6×6 empty pip: 1 px ring only. */
function drawPipEmpty(g: Phaser.GameObjects.Graphics): void {
  px(g, 2, 0, 2, 1);
  px(g, 1, 1, 1, 1);
  px(g, 4, 1, 1, 1);
  px(g, 0, 2, 1, 2);
  px(g, 5, 2, 1, 2);
  px(g, 1, 4, 1, 1);
  px(g, 4, 4, 1, 1);
  px(g, 2, 5, 2, 1);
}

/** 7×5 fish marker for the depth ribbon, pointing right. */
function drawFish(g: Phaser.GameObjects.Graphics): void {
  px(g, 0, 1, 2, 3);
  px(g, 2, 0, 3, 5);
  px(g, 5, 1, 2, 3);
  px(g, 0, 2, 1, 1, 0.6);
}

/** 9×8 shell (three ribs). */
function drawShell(g: Phaser.GameObjects.Graphics): void {
  px(g, 3, 0, 3, 1);
  px(g, 1, 1, 7, 2);
  px(g, 0, 3, 9, 4);
  px(g, 2, 7, 5, 1);
  px(g, 2, 3, 1, 4, 0.4);
  px(g, 4, 3, 1, 4, 0.4);
  px(g, 6, 3, 1, 4, 0.4);
}

/** 5×5 pearl. */
function drawPearl(g: Phaser.GameObjects.Graphics): void {
  px(g, 1, 0, 3, 1);
  px(g, 0, 1, 5, 3);
  px(g, 1, 4, 3, 1);
  px(g, 1, 1, 1, 1, 0.35);
}

/** 9×12 ghost hand: index finger up, closed fist. */
function drawHand(g: Phaser.GameObjects.Graphics): void {
  px(g, 3, 0, 2, 4);
  px(g, 1, 4, 7, 3);
  px(g, 0, 5, 9, 5);
  px(g, 1, 10, 7, 2);
  px(g, 3, 1, 1, 2, 0.4);
}

/** Registers every HUD texture on the given scene. Safe to call more than once. */
export function ensureUiTextures(scene: Phaser.Scene): void {
  ensureTexture(scene, TEX.pip, 6, 6, drawPip);
  ensureTexture(scene, TEX.pipEmpty, 6, 6, drawPipEmpty);
  ensureTexture(scene, TEX.fish, 7, 5, drawFish);
  ensureTexture(scene, TEX.shell, 9, 8, drawShell);
  ensureTexture(scene, TEX.pearl, 5, 5, drawPearl);
  ensureTexture(scene, TEX.hand, 9, 12, drawHand);
}
