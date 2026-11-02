/**
 * Pause: the icon at the top-centre and the overlay with the four big options of §8 plus the
 * accessibility strip. It owns no rule: it emits 'pause'/'resume' and asks core for the restart.
 *
 * It is also the single place where the shell pauses BY ITSELF (§8: blur, hidden tab, and the
 * 'autoPause' channel of the landscape curtain), always through this menu, so the way back into the
 * game is the same visible button.
 */
import type { GameContext, Settings } from '../context';
import { landscapeCurtainWanted } from '../orientation';
import { Button, Overlay, el } from './dom';
import { S } from './strings';

type Flag = 'noShake' | 'assistedTrajectory' | 'slowCharge' | 'calm';

export function soundLabel(ctx: GameContext): string {
  return `${S.sound} ${ctx.settings.sound ? '✓' : '✕'}`;
}

export function toggleSound(ctx: GameContext): string {
  ctx.settings.sound = !ctx.settings.sound;
  ctx.save.settings.sound = ctx.settings.sound;
  ctx.persistSettings();
  ctx.bus.emit('settingsChanged');
  return soundLabel(ctx);
}

export class PauseMenu {
  private readonly ctx: GameContext;
  private readonly openButton: Button;
  private readonly menu: Overlay;
  private blocked = false;
  private isOpen = false;
  private readonly unsubscribe: () => void;
  private readonly onVisibility = (): void => {
    if (document.hidden) this.openMenu();
  };
  private readonly onBlur = (): void => this.openMenu();

  constructor(parent: HTMLElement, ctx: GameContext) {
    this.ctx = ctx;
    this.openButton = new Button({
      id: 'pause.open',
      label: '',
      tone: 'ghost',
      className: 'pause-open',
      parent,
      onTap: () => this.openMenu(),
    });
    this.openButton.root.dataset['dbLabel'] = 'pause';
    this.openButton.root.setAttribute('aria-label', 'Pausa');

    this.menu = new Overlay(parent, 'pause-menu');
    const options = el('div', 'pause-options', this.menu.root);
    const option = (id: string, label: string, onTap: () => void): Button =>
      new Button({ id, label, tone: 'ghost', parent: options, onTap });
    option('pause.resume', S.resume, () => this.close());
    option('pause.restartImmersion', S.restartImmersion, () => {
      ctx.world.restartImmersion();
      ctx.bus.emit('restart');
      this.close();
    });
    const sound: Button = option('pause.sound', soundLabel(ctx), () => sound.setLabel(toggleSound(ctx)));
    option('pause.quit', S.quit, () => ctx.bus.emit('toMap'));

    const strip = el('div', 'pause-settings', this.menu.root);
    const flags: Array<[Flag, string]> = [
      ['noShake', S.noShake],
      ['assistedTrajectory', S.assistedTrajectory],
      ['slowCharge', S.slowCharge],
      ['calm', S.calmDive],
    ];
    const labelOf = (label: string, flag: Flag): string => `${label} ${ctx.settings[flag] ? '✓' : '✕'}`;
    for (const [flag, label] of flags) {
      const toggle: Button = new Button({
        id: `pause.${flag}`,
        label: labelOf(label, flag),
        tone: 'ghost',
        className: 'btn-small',
        parent: strip,
        onTap: () => {
          const settings: Settings = ctx.settings;
          settings[flag] = !settings[flag];
          ctx.save.settings[flag] = settings[flag];
          ctx.bus.emit('settingsChanged');
          toggle.setLabel(labelOf(label, flag));
        },
      });
    }

    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    this.unsubscribe = ctx.bus.on('autoPause', () => this.openMenu());
    // The curtain may already be up: it is raised before this menu exists.
    if (landscapeCurtainWanted()) this.openMenu();
  }

  get open(): boolean {
    return this.isOpen;
  }

  setButtonVisible(value: boolean): void {
    this.openButton.setVisible(value && !this.isOpen && !this.blocked);
  }

  /** An end-of-run screen owns the screen: this menu must not open by hand or by an automatic pause. */
  setBlocked(value: boolean): void {
    this.blocked = value;
    if (value && this.isOpen) this.close();
  }

  openMenu(): void {
    if (this.isOpen || this.blocked) return;
    this.isOpen = true;
    this.menu.show();
    this.openButton.setVisible(false);
    this.ctx.bus.emit('pause');
  }

  private close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.menu.hide();
    this.openButton.setVisible(true);
    this.ctx.bus.emit('resume');
  }

  destroy(): void {
    this.unsubscribe();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
  }
}
