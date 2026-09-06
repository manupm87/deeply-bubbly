/**
 * Touch button for the HUD: pixel plate + optional label or icon, with a hit area of at least
 * 44 css pt. It swallows the pointer so the world never sees a tap meant for the UI (both by
 * stopping Phaser propagation and by clearing the shared PointerInput the world reads this frame).
 */
import type Phaser from 'phaser';
import type { DebugButtonInfo, DebugButtonSource } from '../debug';
import { effectivelyVisible, registerDebugButton, unregisterDebugButton } from '../debug';
import { UI } from '../palette';
import { swallowPointer } from './swallow';
import type { SwallowTarget } from './swallow';
import { pixelText } from './text';
import type { TextSize } from './text';

export type ButtonTone = 'primary' | 'ghost' | 'disabled';

export interface ButtonConfig {
  /**
   * Stable identifier for the e2e suite (`__db.buttons()`), locale-proof where the label is not.
   * Debug-only: nothing in the game reads it, and without `?debug=1` it is never even stored.
   */
  id?: string;
  /** Centre of the button, in design px. */
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
  label?: string;
  size?: TextSize;
  /** Drawn centred inside the plate; receives a Graphics local to the button centre. */
  icon?: (g: Phaser.GameObjects.Graphics) => void;
  tone?: ButtonTone;
  /** Minimum touch target in design px (`HudLayout.touch`, i.e. 44 css pt). Derived when omitted. */
  touch?: number;
  onTap?: () => void;
  /**
   * The shared pointer sample and its owner (`GameContext` satisfies it): the tap is taken away from
   * the world here, but only when it is not the finger some OTHER gesture is being made with — see
   * `ui/swallow.ts`, which is where the whole rule lives.
   */
  input?: SwallowTarget;
}

interface Tone {
  fill: number;
  fillAlpha: number;
  edge: number;
  text: number;
}

const TONES: Readonly<Record<ButtonTone, Tone>> = {
  primary: { fill: UI.cyan, fillAlpha: 0.92, edge: UI.white, text: UI.panel },
  ghost: { fill: UI.panel, fillAlpha: 0.85, edge: UI.cyan, text: UI.white },
  disabled: { fill: UI.panel, fillAlpha: 0.55, edge: UI.dim, text: UI.dim },
};

export class Button implements DebugButtonSource {
  readonly root: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text | null;
  private readonly iconLayer: Phaser.GameObjects.Graphics | null;
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly cfg: ButtonConfig;
  private enabled: boolean;
  private pressed = false;

  constructor(scene: Phaser.Scene, cfg: ButtonConfig) {
    this.cfg = cfg;
    this.enabled = (cfg.tone ?? 'primary') !== 'disabled';
    this.root = scene.add.container(cfg.x, cfg.y);
    this.plate = scene.add.graphics();
    this.root.add(this.plate);

    this.iconLayer = cfg.icon ? scene.add.graphics() : null;
    if (this.iconLayer) {
      cfg.icon?.(this.iconLayer);
      this.root.add(this.iconLayer);
    }

    this.label = cfg.label
      ? pixelText(scene, {
          x: 0,
          y: 0,
          text: cfg.label,
          size: cfg.size ?? 10,
          zoom: cfg.zoom,
          originX: 0.5,
          originY: 0.5,
        })
      : null;
    if (this.label) this.root.add(this.label);

    const touch = this.touchSize();
    this.zone = scene.add.zone(0, 0, Math.max(cfg.w, touch), Math.max(cfg.h, touch));
    this.zone.setInteractive();
    this.root.add(this.zone);
    this.bind();
    this.redraw();
    registerDebugButton(this);
  }

  /** Debug-only rect, in design px: where a synthetic touch has to land to press this button. */
  debugInfo(): DebugButtonInfo {
    const m = this.root.getWorldTransformMatrix();
    return {
      id: this.cfg.id ?? this.cfg.label ?? '',
      label: this.label?.text ?? this.cfg.label ?? '',
      x: m.tx,
      y: m.ty,
      w: this.cfg.w,
      h: this.cfg.h,
      visible: effectivelyVisible(this.root),
    };
  }

  /** 44 css pt in design px — from the HUD layout when the caller has one, derived otherwise. */
  private touchSize(): number {
    return this.cfg.touch ?? 44 / Math.max(1, this.cfg.zoom);
  }

  private bind(): void {
    const swallow = (p: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData): void =>
      swallowPointer(event, this.cfg.input, p.id);
    this.zone.on(
      'pointerdown',
      (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        swallow(p, event);
        if (!this.enabled) return;
        this.pressed = true;
        this.redraw();
      },
    );
    this.zone.on(
      'pointerup',
      (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        swallow(p, event);
        const fire = this.pressed && this.enabled;
        this.pressed = false;
        this.redraw();
        if (fire) this.cfg.onTap?.();
      },
    );
    const cancel = (): void => {
      if (!this.pressed) return;
      this.pressed = false;
      this.redraw();
    };
    this.zone.on('pointerout', cancel);
    this.zone.on('pointerupoutside', cancel);
  }

  private redraw(): void {
    const tone = TONES[this.enabled ? (this.cfg.tone ?? 'primary') : 'disabled'];
    const { w, h } = this.cfg;
    const dy = this.pressed ? 1 : 0;
    const x = -Math.round(w / 2);
    const y = -Math.round(h / 2) + dy;
    this.plate.clear();
    this.plate.fillStyle(tone.fill, this.pressed ? tone.fillAlpha * 0.8 : tone.fillAlpha);
    this.plate.fillRect(x + 1, y, w - 2, h);
    this.plate.fillRect(x, y + 1, w, h - 2);
    this.plate.lineStyle(1, tone.edge, this.enabled ? 1 : 0.6);
    this.plate.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (this.label) {
      this.label.setColor(`#${tone.text.toString(16).padStart(6, '0')}`);
      this.label.setPosition(0, dy);
    }
    if (this.iconLayer) {
      this.iconLayer.setPosition(0, dy);
      this.iconLayer.setAlpha(this.enabled ? 1 : 0.6);
    }
  }

  setEnabled(value: boolean): void {
    if (this.enabled === value) return;
    this.enabled = value && (this.cfg.tone ?? 'primary') !== 'disabled';
    this.pressed = false;
    this.redraw();
  }

  setLabel(text: string): void {
    this.label?.setText(text);
  }

  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y);
  }

  /** Re-sizes the plate and the hit area (still never smaller than the 44 pt touch target). */
  setSize(w: number, h: number): void {
    if (this.cfg.w === w && this.cfg.h === h) return;
    this.cfg.w = w;
    this.cfg.h = h;
    const touch = this.touchSize();
    this.zone.setSize(Math.max(w, touch), Math.max(h, touch));
    this.redraw();
  }

  setVisible(value: boolean): void {
    this.root.setVisible(value);
    if (value) this.zone.setInteractive();
    else this.zone.disableInteractive();
  }

  destroy(): void {
    unregisterDebugButton(this);
    this.root.destroy(true);
  }
}
