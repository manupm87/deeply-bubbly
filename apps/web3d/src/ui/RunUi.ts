/**
 * The DOM layer of a live run, the counterpart of `apps/web/src/scenes/HudScene.ts`. It reads the
 * snapshot the shell took this frame and reaches the world only through the screens' verbs. Built when a
 * run starts and thrown away when it ends, like the Phaser scene it replaces.
 */
import type { GameEvent, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { el } from './dom';
import { Hud } from './Hud';
import type { HudLayout } from './layout';
import { computeLayout, setSafeAreaInsetTopCss } from './layout';
import { Minimap } from './Minimap';
import { PauseMenu } from './PauseMenu';
import { ScreensController } from './Screens';
import { Tutorial } from './Tutorial';

export class RunUi {
  private readonly root: HTMLDivElement;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly screens: ScreensController;
  private readonly pauseMenu: PauseMenu;
  private readonly tutorial: Tutorial;
  private layoutRef: HudLayout;
  private readonly ctx: GameContext;

  constructor(parent: HTMLElement, ctx: GameContext) {
    this.ctx = ctx;
    this.root = el('div', 'run-ui', parent);
    this.layoutRef = computeLayout(ctx.scale);
    this.hud = new Hud(this.root, this.layoutRef, () => ctx.tuning);
    this.minimap = new Minimap(this.root, ctx, this.layoutRef);
    this.tutorial = new Tutorial(this.root, ctx, this.layoutRef);
    this.pauseMenu = new PauseMenu(this.root, ctx);
    this.screens = new ScreensController(this.root, ctx);
    this.layoutPauseButton();
  }

  private layoutPauseButton(): void {
    this.root.style.setProperty('--hud-top', `${this.layoutRef.top}px`);
  }

  layout(): void {
    setSafeAreaInsetTopCss(null);
    this.layoutRef = computeLayout(this.ctx.scale);
    this.layoutPauseButton();
    this.hud.layout(this.layoutRef);
    this.minimap.layout(this.layoutRef);
    this.tutorial.layout(this.layoutRef);
  }

  handleEvent(event: GameEvent): void {
    this.hud.handleEvent(event);
    this.screens.handleEvent(event);
    this.tutorial.handleEvent(event);
  }

  update(snapshot: WorldSnapshot, dtMs: number): void {
    this.screens.sync(snapshot, dtMs);
    // One rule for "an overlay owns the screen", the pause menu included.
    this.pauseMenu.setBlocked(this.screens.anyVisible);
    const clear = this.screens.anyVisible || this.pauseMenu.open;
    this.hud.setVisible(!clear);
    this.minimap.setVisible(!clear);
    this.pauseMenu.setButtonVisible(!clear);
    if (!clear) {
      this.hud.sync(snapshot);
      this.minimap.sync(snapshot, dtMs);
    }
    this.tutorial.setHidden(clear);
    this.tutorial.update(dtMs, snapshot);
    this.hud.syncResaca(snapshot, clear);
  }

  destroy(): void {
    this.tutorial.destroy();
    this.pauseMenu.destroy();
    this.screens.destroy();
    this.minimap.destroy();
    this.root.remove();
  }
}
