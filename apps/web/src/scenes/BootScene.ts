/**
 * Generates every procedural texture for the starting zone and hands over to the world + HUD scenes.
 * There is nothing to preload: the whole game's art is code (SHELL.md "Arte procedural").
 */
import * as Phaser from 'phaser';
import type { ZoneIndex } from '@deeply-bubbly/core';
import { getContext } from '../context';
import { buildCommonTextures, buildZoneTextures } from '../render/textures';

export const SCENE_KEYS = { boot: 'Boot', game: 'Game', hud: 'Hud' } as const;

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

    this.scene.start(SCENE_KEYS.game);
    this.scene.launch(SCENE_KEYS.hud);
    this.scene.bringToTop(SCENE_KEYS.hud);
  }
}
