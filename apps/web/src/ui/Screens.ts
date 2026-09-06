/**
 * End-of-immersion, fail and campaign screens. They fade in over the frozen scene (no scene switch)
 * and talk to the world only through `world.continueDescent()` / `world.restart()`.
 */
import type Phaser from 'phaser';
import type { Tuning, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { UI } from '../palette';
import { Button } from './Button';
import type { HudLayout } from './layout';
import { Overlay, bottomSlots, secondarySlot } from './Overlay';
import { formatMeters, pixelText } from './text';
import { TEX, ensureUiTextures } from './uiTextures';

const MAX_SHELLS = 3;
const SHELL_STEP_MS = 180;

interface ResultConfig {
  giantLabel: string;
  slotLabel: string;
  showShells: boolean;
  onGiant: () => void;
  /**
   * Optional small ghost button above the action row. The station uses it for "Mapa" (WORLD-MAP.md
   * §3): the descent stays continuous — the giant button is still "Seguir bajando" — and closing the
   * session is a second, deliberately smaller choice beside it.
   */
  secondary?: { id: string; label: string; onTap: () => void };
}

/** Shared layout of the station and fail screens (GDD §8: identical framing, different verb). */
class ResultScreen extends Overlay {
  private readonly depthText: Phaser.GameObjects.Text;
  private readonly pearlIcon: Phaser.GameObjects.Image;
  private readonly pearlText: Phaser.GameObjects.Text;
  private readonly shells: Phaser.GameObjects.Image[] = [];
  private readonly giant: Button;
  private readonly slot: Button;
  private readonly secondary: Button | null;
  private readonly cfg: ResultConfig;
  /** Whether the secondary (rewarded) slot is on screen; it decides where the giant button sits. */
  private slotShown = true;

  constructor(scene: Phaser.Scene, ctx: GameContext, layout: HudLayout, cfg: ResultConfig) {
    super(scene, layout, ctx.pointer);
    this.cfg = cfg;
    ensureUiTextures(scene);

    this.depthText = pixelText(scene, {
      x: 0,
      y: 0,
      text: '',
      size: 12,
      zoom: layout.zoom,
      color: UI.white,
      originX: 0.5,
      originY: 0.5,
    });
    this.pearlIcon = scene.add.image(0, 0, TEX.pearl).setTint(UI.white);
    this.pearlText = pixelText(scene, {
      x: 0,
      y: 0,
      text: '0',
      size: 10,
      zoom: layout.zoom,
      color: UI.white,
      originX: 0,
      originY: 0.5,
    });
    for (let i = 0; i < MAX_SHELLS; i++) {
      this.shells.push(scene.add.image(0, 0, TEX.shell).setTint(UI.amber));
    }
    this.add(this.depthText, this.pearlIcon, this.pearlText, ...this.shells);
    if (!cfg.showShells) for (const s of this.shells) s.setVisible(false);

    const slots = bottomSlots(layout, this.slotShown);
    this.giant = new Button(scene, {
      ...slots.giant,
      zoom: layout.zoom,
        touch: layout.touch,
      label: cfg.giantLabel,
      size: 10,
      tone: 'primary',
      onTap: cfg.onGiant,
      input: ctx,
    });
    this.slot = new Button(scene, {
      ...slots.slot,
      zoom: layout.zoom,
        touch: layout.touch,
      label: cfg.slotLabel,
      size: 8,
      tone: 'disabled',
    });
    this.secondary = cfg.secondary
      ? new Button(scene, {
          id: cfg.secondary.id,
          ...secondarySlot(layout),
          zoom: layout.zoom,
          touch: layout.touch,
          label: cfg.secondary.label,
          size: 8,
          tone: 'ghost',
          input: ctx,
          onTap: cfg.secondary.onTap,
        })
      : null;
    this.add(this.giant.root, this.slot.root);
    if (this.secondary) this.add(this.secondary.root);
    this.place(layout);
  }

  override layout(layout: HudLayout): void {
    super.layout(layout);
    this.place(layout);
  }

  private place(layout: HudLayout): void {
    const cx = layout.viewW / 2;
    this.depthText.setPosition(cx, Math.round(layout.viewH * 0.28));
    const shellY = Math.round(layout.viewH * 0.42);
    for (let i = 0; i < this.shells.length; i++) {
      this.shells[i]?.setPosition(cx + (i - 1) * 14, shellY);
    }
    const pearlY = Math.round(layout.viewH * 0.54);
    this.pearlIcon.setPosition(cx - 10, pearlY);
    this.pearlText.setPosition(cx - 2, pearlY);
    const slots = bottomSlots(layout, this.slotShown);
    this.giant.setPosition(slots.giant.x, slots.giant.y);
    this.slot.setPosition(slots.slot.x, slots.slot.y);
    const secondary = secondarySlot(layout);
    this.secondary?.setPosition(secondary.x, secondary.y);
  }

  /** Fills in the numbers and replays the shell animation. */
  present(snapshot: WorldSnapshot, shellsEarned: number): void {
    this.depthText.setText(formatMeters(snapshot.hud.depthM));
    this.pearlText.setText(String(Math.max(0, Math.round(snapshot.hud.pearls))));
    if (this.cfg.showShells) this.animateShells(shellsEarned);
    this.show();
  }

  private animateShells(earned: number): void {
    for (let i = 0; i < this.shells.length; i++) {
      const shell = this.shells[i];
      if (!shell) continue;
      this.scene.tweens.killTweensOf(shell);
      shell.setVisible(true);
      const won = i < earned;
      shell.setTint(won ? UI.amber : UI.dim);
      shell.setAlpha(won ? 0 : 0.35);
      shell.setScale(1);
      if (!won) continue;
      this.scene.tweens.add({
        targets: shell,
        alpha: 1,
        duration: 160,
        delay: i * SHELL_STEP_MS,
        ease: 'Quad.easeOut',
      });
    }
  }

  protected setSlotVisible(value: boolean): void {
    if (this.slotShown === value) return;
    this.slotShown = value;
    this.slot.setVisible(value);
    this.place(this.layoutRef);
  }

  override destroy(): void {
    this.giant.destroy();
    this.slot.destroy();
    this.secondary?.destroy();
    super.destroy();
  }
}

/**
 * Phase 'station': depth, three shells, pearls, the giant "keep diving" button — and, since v1.3, the
 * small "Mapa" beside it. §3.1's single continuous plunge is what makes the giant one giant; the map
 * is where a session ends, so it is the one other way out of this screen.
 */
export class StationScreen extends ResultScreen {
  constructor(
    scene: Phaser.Scene,
    ctx: GameContext,
    layout: HudLayout,
    labels: { giant: string; slot: string; map: string },
  ) {
    super(scene, ctx, layout, {
      giantLabel: labels.giant,
      slotLabel: labels.slot,
      showShells: true,
      onGiant: () => {
        ctx.world.continueDescent();
        ctx.bus.emit('continue');
      },
      secondary: { id: 'station.map', label: labels.map, onTap: () => ctx.bus.emit('toMap') },
    });
  }
}

/** Phase 'dead' / 'gameOver': same framing, restart verb, and a rewarded slot gated by §6.5. */
export class DeadScreen extends ResultScreen {
  private idleMs = 0;
  private readonly tuningOf: () => Tuning;
  private readonly restart: () => void;
  private readonly onActivity = (): void => {
    this.idleMs = 0;
  };

  constructor(scene: Phaser.Scene, ctx: GameContext, layout: HudLayout, labels: { giant: string; slot: string }) {
    const restart = (): void => {
      ctx.world.restart();
      ctx.bus.emit('restart');
    };
    super(scene, ctx, layout, {
      giantLabel: labels.giant,
      slotLabel: labels.slot,
      showShells: false,
      onGiant: restart,
    });
    this.restart = restart;
    this.tuningOf = (): Tuning => ctx.tuning;
    scene.input.on('pointerdown', this.onActivity);
  }

  override present(snapshot: WorldSnapshot, shellsEarned: number): void {
    this.idleMs = 0;
    this.setSlotVisible(snapshot.run.failCountThisImmersion >= this.tuningOf().AD_OFFER_MIN_FAILS);
    super.present(snapshot, shellsEarned);
  }

  /** Auto-restart after a while: a child who walks away comes back to a playable screen. */
  tick(dtMs: number): void {
    if (!this.visible) return;
    this.idleMs += dtMs;
    if (this.idleMs >= this.tuningOf().DEAD_IDLE_AUTO_MS) {
      this.idleMs = 0;
      this.restart();
    }
  }

  override destroy(): void {
    this.scene.input.off('pointerdown', this.onActivity);
    super.destroy();
  }
}

/** Shells earned in the immersion just finished, from the event payload or the run delta. */
function clampShells(value: number): number {
  return Math.max(0, Math.min(MAX_SHELLS, Math.round(value)));
}

export { clampShells, MAX_SHELLS };
