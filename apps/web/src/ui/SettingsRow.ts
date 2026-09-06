/**
 * The four accessibility switches of GDD §8 ("sin temblor", "trayectoria asistida", "carga lenta" and
 * the "Buceo tranquilo" difficulty), as a compact strip of toggles inside the pause overlay.
 *
 * They were persisted and honoured but reachable only by hand-editing localStorage. The strip sits
 * BELOW the four big options so the pause menu still reads as §8 describes it, and every label is one
 * short word plus a tick, to stay inside the "< 40 palabras en pantalla" budget of pillar 5.
 *
 * It owns no rule: it flips a flag in `ctx.settings` and emits 'settingsChanged'; `platform/settings`
 * decides what that means for the tuning and core owns the transforms themselves.
 */
import type Phaser from 'phaser';
import type { GameContext, Settings } from '../context';
import { Button } from './Button';
import type { HudLayout } from './layout';
import { strings } from './strings';

type Flag = 'noShake' | 'assistedTrajectory' | 'slowCharge' | 'calm';

const H = 18;
const GAP = 3;

export class SettingsRow {
  private readonly ctx: GameContext;
  private readonly buttons: Array<{ flag: Flag; label: string; button: Button }> = [];

  constructor(scene: Phaser.Scene, ctx: GameContext, layout: HudLayout) {
    this.ctx = ctx;
    const s = strings();
    const flags: Array<[Flag, string]> = [
      ['noShake', s.noShake],
      ['assistedTrajectory', s.assistedTrajectory],
      ['slowCharge', s.slowCharge],
      ['calm', s.calmDive],
    ];
    for (const [flag, label] of flags) {
      const button = new Button(scene, {
        x: 0,
        y: 0,
        w: 10,
        h: H,
        zoom: layout.zoom,
        touch: layout.touch,
        label: this.labelOf(label, flag),
        size: 8,
        tone: 'ghost',
        input: ctx,
        onTap: () => this.toggle(flag),
      });
      this.buttons.push({ flag, label, button });
    }
    this.layout(layout);
  }

  /** Every toggle is added to the overlay container by the caller. */
  get roots(): Phaser.GameObjects.Container[] {
    return this.buttons.map((b) => b.button.root);
  }

  /** Two columns, wider than the option plates above: the labels are words, not icons. */
  layout(layout: HudLayout, topY = Math.round(layout.viewH * 0.72)): void {
    const w = Math.round((layout.viewW * 0.9 - GAP) / 2);
    for (let i = 0; i < this.buttons.length; i++) {
      const entry = this.buttons[i];
      if (!entry) continue;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = Math.round(layout.viewW / 2 + (col === 0 ? -(w + GAP) / 2 : (w + GAP) / 2));
      entry.button.setSize(w, H);
      entry.button.setPosition(x, topY + row * (H + GAP));
    }
  }

  private labelOf(label: string, flag: Flag): string {
    return `${label} ${this.ctx.settings[flag] ? '✓' : '✕'}`;
  }

  private toggle(flag: Flag): void {
    const settings: Settings = this.ctx.settings;
    settings[flag] = !settings[flag];
    this.ctx.save.settings[flag] = settings[flag];
    this.ctx.bus.emit('settingsChanged');
    for (const entry of this.buttons) {
      if (entry.flag === flag) entry.button.setLabel(this.labelOf(entry.label, flag));
    }
  }

  destroy(): void {
    for (const entry of this.buttons) entry.button.destroy();
    this.buttons.length = 0;
  }
}
