/**
 * Wordless first-run tutorial (GDD §8): a ghost hand presses, holds for at most 700 ms — never long
 * enough to teach the overcharge gesture — and releases, while an exaggerated dotted arc leaves Bur.
 * It blocks nothing: the player can take over at any moment, and the first real launch ends it.
 */
import type Phaser from 'phaser';
import type { GameEvent, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { UI } from '../palette';
import type { HudLayout } from './layout';
import { TEX, ensureUiTextures } from './uiTextures';

const PRESS_MS = 260;
/**
 * §8: the beat being taught is "mantiene medio segundo"; 700 ms is the ceiling the hand must NEVER
 * reach ("nunca mantiene más de 700 ms"), because that is the hold that teaches overcharge.
 */
const HOLD_MS = 500;
const RELEASE_MS = 340;
const REST_MS = 520;
const CYCLE_MS = PRESS_MS + HOLD_MS + RELEASE_MS + REST_MS;
/** Hard stop well under the 25 s budget of the GDD. */
const MAX_MS = 20_000;
/** A tap before this cannot skip: it is almost always the tap that started the game. */
const SKIP_AFTER_MS = 1000;
const ARC_DOTS = 7;

export class Tutorial {
  private readonly ctx: GameContext;
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly hand: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly arc: Phaser.GameObjects.Graphics;
  private readonly onTap = (): void => {
    if (this.elapsed >= SKIP_AFTER_MS) this.finish();
  };
  private layoutRef: HudLayout;
  private elapsed = 0;
  private hidden = false;
  private done: boolean;

  constructor(scene: Phaser.Scene, ctx: GameContext, layout: HudLayout) {
    this.scene = scene;
    this.ctx = ctx;
    this.layoutRef = layout;
    this.done = ctx.save.tutorialDone;
    ensureUiTextures(scene);

    this.arc = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.hand = scene.add.image(0, 0, TEX.hand);
    this.hand.setOrigin(0.5, 0);
    this.hand.setTint(UI.white);
    this.hand.setAlpha(0.85);
    this.root = scene.add.container(0, 0, [this.arc, this.ring, this.hand]);
    this.root.setVisible(!this.done);
    if (!this.done) scene.input.on('pointerdown', this.onTap);
  }

  layout(layout: HudLayout): void {
    this.layoutRef = layout;
  }

  /** An overlay (fail, station, pause) owns the screen: the demonstration must not draw over it. */
  setHidden(value: boolean): void {
    this.hidden = value;
    this.root.setVisible(!this.done && !value);
  }

  get active(): boolean {
    return !this.done;
  }

  handleEvent(event: GameEvent): void {
    if (event.type === 'launch') this.finish();
  }

  update(dtMs: number, snapshot: WorldSnapshot | null): void {
    if (this.done || this.hidden) return;
    this.elapsed += dtMs;
    if (this.elapsed >= MAX_MS) {
      this.finish();
      return;
    }
    const t = this.elapsed % CYCLE_MS;
    const anchorX = Math.round(this.layoutRef.viewW * 0.5);
    const anchorY = Math.round(this.layoutRef.viewH * 0.78);

    if (t < PRESS_MS) {
      this.drawPress(anchorX, anchorY, t / PRESS_MS, 0);
    } else if (t < PRESS_MS + HOLD_MS) {
      const k = (t - PRESS_MS) / HOLD_MS;
      this.drawPress(anchorX, anchorY, 1, k);
      this.drawArc(snapshot, k);
    } else if (t < PRESS_MS + HOLD_MS + RELEASE_MS) {
      const k = (t - PRESS_MS - HOLD_MS) / RELEASE_MS;
      this.drawPress(anchorX, anchorY - Math.round(k * 6), 1 - k, 0);
      this.drawArc(snapshot, 1 - k);
    } else {
      this.hand.setAlpha(0);
      this.ring.clear();
      this.arc.clear();
    }
  }

  /** Hand plus the charge ring under it; `charge` grows only while the hand holds. */
  private drawPress(x: number, y: number, presence: number, charge: number): void {
    this.hand.setPosition(x + 6, y + 2);
    this.hand.setAlpha(0.2 + 0.65 * presence);
    this.ring.clear();
    if (presence <= 0) return;
    this.ring.lineStyle(1, UI.cyan, 0.5 * presence);
    this.ring.strokeCircle(x, y, 5);
    if (charge <= 0) return;
    // The ring shows the charge the demonstrated hold would REALLY buy (HOLD_MS of CHARGE_FULL_MS), in
    // the ordinary white of the gauge — a full amber circle would be teaching the overcharge gesture.
    const full = Math.max(1, this.ctx.tuning.CHARGE_FULL_MS);
    const power = Math.min(1, (charge * HOLD_MS) / full);
    this.ring.lineStyle(1, UI.white, 0.9);
    this.ring.beginPath();
    this.ring.arc(x, y, 8, -Math.PI / 2, -Math.PI / 2 + power * Math.PI * 2, false);
    this.ring.strokePath();
  }

  /** Exaggerated dotted arc leaving Bur (or the screen centre when there is no snapshot yet). */
  private drawArc(snapshot: WorldSnapshot | null, reveal: number): void {
    const originX = snapshot ? snapshot.bubble.pos.x : this.layoutRef.viewW * 0.5;
    // `renderY`, not `y`: it is the top of the view as actually DRAWN (core's ratchet plus the §7
    // lookahead), so the arc cannot slide away from Bur during a fast descent.
    const originY = snapshot
      ? snapshot.bubble.pos.y - snapshot.camera.renderY
      : this.layoutRef.viewH * 0.4;
    this.arc.clear();
    this.arc.fillStyle(UI.white, 0.75);
    const shown = Math.max(1, Math.round(reveal * ARC_DOTS));
    for (let i = 0; i < shown; i++) {
      const k = (i + 1) / ARC_DOTS;
      const x = originX + k * 46;
      const y = originY + k * 22 + k * k * 46;
      if (y > this.layoutRef.viewH) break;
      this.arc.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  }

  /** Ends the tutorial for good and persists it. */
  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.ctx.save.tutorialDone = true;
    this.ctx.persistSettings();
    this.scene.input.off('pointerdown', this.onTap);
    this.root.setVisible(false);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onTap);
    this.root.destroy(true);
  }
}
