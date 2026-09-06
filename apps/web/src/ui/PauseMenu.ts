/**
 * Pause: a 10 px icon at the top-centre with a 44 pt touch area, an overlay with the four big options
 * of §8 (plus the accessibility strip of `SettingsRow`), and a minimal title overlay behind "quit".
 * The menu owns no game rule — it emits 'pause'/'resume' on the bus and asks core for the restart.
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
  private readonly title: Overlay;
  private readonly options: Button[] = [];
  private readonly soundButton: Button;
  private readonly diveButton: Button;
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
    const make = (label: string, onTap: () => void): Button =>
      new Button(scene, {
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

    this.options.push(make(s.resume, () => this.close()));
    this.options.push(
      make(s.restartImmersion, () => {
        // `restart()` is gated on 'dead'/'gameOver' in core by design; restarting a LIVING immersion
        // is its own rule and its own API (`restartImmersion`), added to core for this button.
        ctx.world.restartImmersion();
        ctx.bus.emit('restart');
        this.close();
      }),
    );
    this.soundButton = make(this.soundLabel(), () => this.toggleSound());
    this.options.push(this.soundButton);
    this.options.push(make(s.quit, () => this.openTitle()));
    for (const option of this.options) this.menu.root.add(option.root);
    this.settingsRow = new SettingsRow(scene, ctx, layout);
    for (const root of this.settingsRow.roots) this.menu.root.add(root);

    this.title = new Overlay(scene, layout, ctx.pointer, 0.92);
    this.diveButton = new Button(scene, {
      x: Math.round(layout.viewW / 2),
      y: Math.round(layout.viewH * 0.72),
      w: Math.round(layout.viewW * 0.5),
      h: 36,
      zoom: layout.zoom,
        touch: layout.touch,
      label: s.dive,
      size: 12,
      tone: 'primary',
      pointer: ctx.pointer,
      onTap: () => this.close(),
    });
    this.title.root.add(this.diveButton.root);

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
    this.diveButton.setPosition(Math.round(layout.viewW / 2), Math.round(layout.viewH * 0.72));
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
   * automatic pause (a blur while the fail screen is up), or two overlays would stack.
   */
  setBlocked(value: boolean): void {
    this.blocked = value;
    if (value && this.state !== 'closed') this.close();
  }

  openMenu(): void {
    if (this.state === 'menu' || this.blocked) return;
    const wasOpen = this.open;
    this.state = 'menu';
    this.title.hide();
    this.menu.show();
    this.openButton.setVisible(false);
    if (!wasOpen) this.ctx.bus.emit('pause');
  }

  private openTitle(): void {
    this.state = 'title';
    this.menu.hide();
    this.title.show();
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
    this.diveButton.destroy();
    this.menu.destroy();
    this.title.destroy();
    this.openButton.destroy();
  }
}
