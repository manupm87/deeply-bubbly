/**
 * HUD overlay scene. It runs above 'Game' with its own camera at the same viewport and zoom, so all
 * layout is in design px (0..viewW × 0..viewH). It reads `ctx.snapshot` — written by GameScene
 * earlier in the same frame — and reaches the world only through restart()/continueDescent() and
 * the shared bus. No game rule lives here.
 */
import Phaser from 'phaser';
import type { GameEvent } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { getContext } from '../context';
import { Hud } from '../ui/Hud';
import { Minimap } from '../ui/Minimap';
import { PauseMenu } from '../ui/PauseMenu';
import { ScreensController } from '../ui/ScreensController';
import { ResacaWarning } from '../ui/ResacaWarning';
import { Tutorial } from '../ui/Tutorial';
import type { HudLayout } from '../ui/layout';
import { computeLayout, setSafeAreaInsetTopCss } from '../ui/layout';

export const HUD_SCENE_KEY = 'Hud';

export class HudScene extends Phaser.Scene {
  private ctx!: GameContext;
  private layoutRef!: HudLayout;
  private hud!: Hud;
  private minimap!: Minimap;
  private screens!: ScreensController;
  private pauseMenu!: PauseMenu;
  private tutorial!: Tutorial;
  private resaca!: ResacaWarning;

  constructor() {
    super({ key: HUD_SCENE_KEY });
  }

  create(): void {
    this.ctx = getContext(this);
    this.layoutRef = computeLayout(this.ctx.scale);
    this.applyCamera();

    this.hud = new Hud(this, this.layoutRef, () => this.ctx.tuning);
    // D5: the minimap is a HUD widget AND the peek control; it talks to the world only through
    // `setPeek`, which is presentation, so no rule crosses this scene.
    this.minimap = new Minimap(this, this.ctx, this.layoutRef);
    this.screens = new ScreensController(this, this.ctx, this.layoutRef);
    this.pauseMenu = new PauseMenu(this, this.ctx, this.layoutRef);
    this.tutorial = new Tutorial(this, this.ctx, this.layoutRef);
    this.resaca = new ResacaWarning(this, this.layoutRef);

    this.scene.bringToTop();
    this.ctx.bus.on('gameEvent', this.onBusEvent, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this);
  }

  /** Same viewport as the game camera, so 1 design px is 1 design px on both layers. */
  private applyCamera(): void {
    const { zoom, viewW, viewH } = this.layoutRef;
    const cam = this.cameras.main;
    cam.setViewport(this.ctx.scale.offsetX, this.ctx.scale.offsetY, viewW * zoom, viewH * zoom);
    cam.setZoom(zoom);
    cam.centerOn(viewW / 2, viewH / 2);
    cam.roundPixels = true;
  }

  private onResize(): void {
    setSafeAreaInsetTopCss(null);
    this.layoutRef = computeLayout(this.ctx.scale);
    this.applyCamera();
    this.hud.layout(this.layoutRef);
    this.minimap.layout(this.layoutRef);
    this.screens.layout(this.layoutRef);
    this.pauseMenu.layout(this.layoutRef);
    this.tutorial.layout(this.layoutRef);
    this.resaca.layout(this.layoutRef);
  }

  /** GameScene drains `snapshot.events` and re-emits every one of them here; this is the only source. */
  private onBusEvent(event: GameEvent): void {
    this.dispatch(event);
  }

  private dispatch(event: GameEvent): void {
    this.hud.handleEvent(event);
    this.screens.handleEvent(event);
    this.tutorial.handleEvent(event);
  }

  override update(_time: number, delta: number): void {
    const snapshot = this.ctx.snapshot;
    if (!snapshot) return;

    this.screens.sync(snapshot, delta);
    // One rule for "an overlay owns the screen", the pause menu included: the HUD, the tutorial and
    // the resaca arrow all step aside for it, instead of the station/fail screens clearing the HUD
    // while the pause dim left the pips and the depth ribbon showing through.
    this.pauseMenu.setBlocked(this.screens.anyVisible);
    const clear = this.screens.anyVisible || this.pauseMenu.open;
    this.hud.setVisible(!clear);
    this.minimap.setVisible(!clear);
    this.pauseMenu.setButtonVisible(!clear);
    if (!clear) {
      this.hud.sync(snapshot);
      this.minimap.sync(snapshot, delta);
    }
    this.tutorial.setHidden(clear);
    this.tutorial.update(delta, snapshot);
    this.resaca.sync(snapshot, clear);
  }

  private teardown(): void {
    this.ctx.bus.off('gameEvent', this.onBusEvent, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.resaca.destroy();
    this.tutorial.destroy();
    this.pauseMenu.destroy();
    this.screens.destroy();
    this.minimap.destroy();
    this.hud.destroy();
  }
}
