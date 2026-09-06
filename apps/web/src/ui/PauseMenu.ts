/**
 * Pause: a 10 px icon at the top-centre with a 44 pt touch area, an overlay with the four big options
 * of §8 (plus the accessibility strip of `SettingsRow`), and the shared `StartScreen` behind "quit".
 * The menu owns no game rule — it emits 'pause'/'resume' on the bus and asks core for the restart.
 *
 * "Salir" opens the SAME start screen the game boots with (GDD §3.1: the unlocked station is an offer,
 * not a forced start), which is why the title state lives here: this class already owns "an overlay is
 * up, the world is frozen, and closing it is what resumes". `HudScene` opens the boot title through
 * `openTitle()` for exactly that reason.
 *
 * It is also the single place where the shell decides to pause BY ITSELF (SHELL.md, §8: "pausa
 * automática al perder el foco (blur, llamada entrante, cambio de app)"): `visibilitychange`, window
 * `blur`, and the 'autoPause' bus channel the landscape curtain uses. All three open this menu rather
 * than freezing silently, so the way back into the game is always the same visible button.
 */
import type Phaser from 'phaser';
import type { GameContext } from '../context';
import { landscapeCurtainWanted } from '../orientation';
import { UI } from '../palette';
import { Button } from './Button';
import type { HudLayout } from './layout';
import { Overlay } from './Overlay';
import { SettingsRow } from './SettingsRow';
import { StartScreen } from './StartScreen';
import { strings } from './strings';

type MenuState = 'closed' | 'menu' | 'title';

const OPTION_H = 28;
const OPTION_GAP = 8;

function pauseIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(UI.white, 1);
  g.fillRect(-4, -5, 3, 10);
  g.fillRect(1, -5, 3, 10);
}

export class PauseMenu {
  private readonly ctx: GameContext;
  private readonly openButton: Button;
  private readonly menu: Overlay;
  private readonly title: StartScreen;
  private readonly options: Button[] = [];
  private readonly soundButton: Button;
  private readonly settingsRow: SettingsRow;
  private readonly onVisibility = (): void => {
    if (typeof document !== 'undefined' && document.hidden) this.openMenu();
  };
  /** A desktop alt-tab or an incoming call never fires `visibilitychange`, only `blur`. */
  private readonly onBlur = (): void => this.openMenu();
  private readonly onAutoPause = (): void => this.openMenu();
  private state: MenuState = 'closed';
  /** True while a station/fail/campaign screen owns the screen: nothing may open on top of it. */
  private blocked = false;

  constructor(scene: Phaser.Scene, ctx: GameContext, layout: HudLayout) {
    this.ctx = ctx;
    const s = strings();

    this.openButton = new Button(scene, {
      id: 'pause.open',
      x: Math.round(layout.viewW / 2),
      y: layout.top + 6,
      w: 14,
      h: 14,
      zoom: layout.zoom,
        touch: layout.touch,
      tone: 'ghost',
      icon: pauseIcon,
      pointer: ctx.pointer,
      onTap: () => this.openMenu(),
    });

    this.menu = new Overlay(scene, layout, ctx.pointer, 0.78);
    const w = Math.round(layout.viewW * 0.74);
    const make = (id: string, label: string, onTap: () => void): Button =>
      new Button(scene, {
        id,
        x: Math.round(layout.viewW / 2),
        y: 0,
        w,
        h: OPTION_H,
        zoom: layout.zoom,
        touch: layout.touch,
        label,
        size: 10,
        tone: 'ghost',
        pointer: ctx.pointer,
        onTap,
      });

    this.options.push(make('pause.resume', s.resume, () => this.close()));
    this.options.push(
      make('pause.restartImmersion', s.restartImmersion, () => {
        // `restart()` is gated on 'dead'/'gameOver' in core by design; restarting a LIVING immersion
        // is its own rule and its own API (`restartImmersion`), added to core for this button.
        ctx.world.restartImmersion();
        ctx.bus.emit('restart');
        this.close();
      }),
    );
    this.soundButton = make('pause.sound', this.soundLabel(), () => this.toggleSound());
    this.options.push(this.soundButton);
    this.options.push(make('pause.quit', s.quit, () => this.openTitle()));
    for (const option of this.options) this.menu.root.add(option.root);
    this.settingsRow = new SettingsRow(scene, ctx, layout);
    for (const root of this.settingsRow.roots) this.menu.root.add(root);

    // The one start screen of the shell; `HudScene` shows this same instance at boot.
    this.title = new StartScreen(scene, ctx, layout, {
      onContinue: () => this.close(),
      // Progress is permanent: a run from the surface never touches `save.unlockedStation` (§3.1).
      onSurface: () => ctx.bus.emit('newRun', { startStationIndex: -1 }),
    });

    this.layout(layout);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    globalThis.addEventListener?.('blur', this.onBlur);
    ctx.bus.on('autoPause', this.onAutoPause);
    // The curtain may already be up: it is raised in `main.ts`, one frame before this menu exists, so
    // its 'autoPause' would have been emitted into an empty bus.
    if (landscapeCurtainWanted()) this.openMenu();
  }

  layout(layout: HudLayout): void {
    this.openButton.setPosition(Math.round(layout.viewW / 2), layout.top + 6);
    this.menu.layout(layout);
    this.title.layout(layout);
    const total = this.options.length * OPTION_H + (this.options.length - 1) * OPTION_GAP;
    const firstY = Math.round(layout.viewH * 0.42 - total / 2 + OPTION_H / 2);
    for (let i = 0; i < this.options.length; i++) {
      this.options[i]?.setPosition(Math.round(layout.viewW / 2), firstY + i * (OPTION_H + OPTION_GAP));
    }
    this.settingsRow.layout(layout, firstY + this.options.length * (OPTION_H + OPTION_GAP) + 4);
  }

  private soundLabel(): string {
    return `${strings().sound} ${this.ctx.settings.sound ? '✓' : '✕'}`;
  }

  private toggleSound(): void {
    this.ctx.settings.sound = !this.ctx.settings.sound;
    this.ctx.save.settings.sound = this.ctx.settings.sound;
    this.ctx.persistSettings();
    this.ctx.bus.emit('settingsChanged');
    this.soundButton.setLabel(this.soundLabel());
  }

  get open(): boolean {
    return this.state !== 'closed';
  }

  /** Hidden while an end-of-run screen owns the screen, or while this menu is the screen. */
  setButtonVisible(value: boolean): void {
    this.openButton.setVisible(value && this.state === 'closed' && !this.blocked);
  }

  /**
   * An end-of-run screen owns the screen: the pause menu must neither be opened by hand nor by an
   * automatic pause (a blur while the fail screen is up), or two overlays would stack. Only the MENU
   * is closed by this — closing the title state would resume the world behind the choice the player
   * has not made yet.
   */
  setBlocked(value: boolean): void {
    this.blocked = value;
    if (value && this.state === 'menu') this.close();
  }

  /**
   * Never opens ON TOP of the start screen: that choice is already a frozen world with an overlay on
   * it, so an automatic pause (a blur, or the landscape curtain) has nothing left to do — and swapping
   * the title for this menu would answer the question for the player, since "Seguir" here dives at the
   * checkpoint and the surface would need a second trip through "Salir".
   */
  openMenu(): void {
    if (this.state !== 'closed' || this.blocked) return;
    this.state = 'menu';
    this.menu.show();
    this.openButton.setVisible(false);
    this.ctx.bus.emit('pause');
  }

  /**
   * The start screen (§3.1). Reached from "Salir" and, at boot, from `HudScene` for a returning player:
   * the world is frozen while the choice is on screen, and `close()` is what starts it again.
   */
  openTitle(): void {
    if (this.state === 'title' || this.blocked) return;
    const wasOpen = this.open;
    this.state = 'title';
    this.menu.hide();
    this.openButton.setVisible(false);
    this.title.show();
    if (!wasOpen) this.ctx.bus.emit('pause');
  }

  private close(): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.menu.hide();
    this.title.hide();
    this.openButton.setVisible(true);
    this.ctx.bus.emit('resume');
  }

  destroy(): void {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    globalThis.removeEventListener?.('blur', this.onBlur);
    this.ctx.bus.off('autoPause', this.onAutoPause);
    this.settingsRow.destroy();
    for (const option of this.options) option.destroy();
    this.menu.destroy();
    this.title.destroy();
    this.openButton.destroy();
  }
}
