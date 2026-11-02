/**
 * The DOM layer of a live run, the counterpart of `apps/web/src/scenes/HudScene.ts`. It reads the
 * snapshot the shell took this frame and reaches the world only through the screens' verbs. Built when a
 * run starts and thrown away when it ends, like the Phaser scene it replaces.
 */
import type { GameEvent, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { nextTarget } from '../render/shotForecast';
import { el } from './dom';
import { Hud } from './Hud';
import type { HudLayout } from './layout';
import { computeLayout, setSafeAreaInsetTopCss } from './layout';
import { Minimap } from './Minimap';
import { PauseMenu } from './PauseMenu';
import { ScreensController } from './Screens';
import { TargetHint } from './TargetHint';
import { Tutorial } from './Tutorial';

export class RunUi {
  private readonly root: HTMLDivElement;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly screens: ScreensController;
  private readonly pauseMenu: PauseMenu;
  private readonly tutorial: Tutorial;
  private readonly targetHint: TargetHint;
  private layoutRef: HudLayout;
  private readonly ctx: GameContext;
  private leaning = false;

  constructor(parent: HTMLElement, ctx: GameContext) {
    this.ctx = ctx;
    this.root = el('div', 'run-ui', parent);
    this.layoutRef = computeLayout(ctx.scale);
    this.hud = new Hud(this.root, this.layoutRef, () => ctx.tuning);
    this.minimap = new Minimap(this.root, ctx, this.layoutRef);
    this.targetHint = new TargetHint(this.root, this.layoutRef);
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
    this.targetHint.layout(this.layoutRef);
  }

  handleEvent(event: GameEvent): void {
    this.hud.handleEvent(event);
    this.screens.handleEvent(event);
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
      this.leanTowardsTarget(snapshot);
    }
    this.targetHint.sync(snapshot, clear);
    this.tutorial.setHidden(clear);
    this.tutorial.update(dtMs, snapshot);
    this.hud.syncResaca(snapshot, clear);
  }

  /**
   * D3 puts the next ledge past the edge of the view more often than not, and a shot cannot be judged
   * against something out of sight. While a pull is held with the minimap free, the view leans (D5's own
   * peek, presentation only) to the midpoint of Bur and her target: a hop is at most 120 px in a 180 px view.
   */
  private leanTowardsTarget(snapshot: WorldSnapshot): void {
    if (this.minimap.peeking) {
      this.leaning = false;
      return;
    }
    const b = snapshot.bubble;
    const target = b.aimOrigin === null ? null : nextTarget(snapshot);
    if (target === null) {
      if (this.leaning) this.ctx.world.setPeek(null);
      this.leaning = false;
      return;
    }
    this.leaning = true;
    this.ctx.world.setPeek({ x: (b.pos.x + target.x) / 2, y: (b.pos.y + target.y) / 2 });
  }

  destroy(): void {
    this.tutorial.destroy();
    this.pauseMenu.destroy();
    this.screens.destroy();
    this.minimap.destroy();
    this.root.remove();
  }
}
