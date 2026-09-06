/**
 * Generates every procedural texture for the starting zone and hands over to whichever scene owns the
 * screen next. There is nothing to preload: the whole game's art is code (SHELL.md "Arte procedural").
 *
 * It is also the fork of the boot flow (WORLD-MAP.md §3): a returning player lands on the world map,
 * which is the main menu, and a first-ever player drops straight into the game and the wordless
 * tutorial — §8 forbids a modal, a menu included, before it. `main.ts` decides which of the two this
 * is (`ctx.mapPending`); Boot only routes, so the textures are built exactly once either way.
 */
import * as Phaser from 'phaser';
import type { ZoneIndex } from '@deeply-bubbly/core';
import { getContext } from '../context';
import { buildCommonTextures, buildZoneTextures } from '../render/textures';

export const SCENE_KEYS = { boot: 'Boot', game: 'Game', hud: 'Hud', map: 'Map' } as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    const ctx = getContext(this);
    buildCommonTextures(this);
    // The world already exists when Boot runs, so the starting zone is known: a checkpoint start can
    // begin in Zone 3 and must not spend its first second building Zone 1's palette.
    const zone: ZoneIndex = ctx.snapshot?.zone ?? 0;
    buildZoneTextures(this, zone);

    if (ctx.mapPending) {
      // Consumed here: a new run started FROM the map comes back through Boot, and asking the same
      // question twice would put the menu between the player and the level they just chose.
      ctx.mapPending = false;
      this.scene.start(SCENE_KEYS.map);
      return;
    }

    this.scene.start(SCENE_KEYS.game);
    this.scene.launch(SCENE_KEYS.hud);
    this.scene.bringToTop(SCENE_KEYS.hud);
  }
}
