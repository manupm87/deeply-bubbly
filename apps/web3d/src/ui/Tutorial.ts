/**
 * Wordless first-run tutorial (GDD §8, D2), same beats as `apps/web/src/ui/Tutorial.ts`: a ghost hand
 * presses, draws the sling back up the screen and releases, while a dotted arc leaves Bur straight down.
 * It blocks nothing (pointer-events are off), and the first real launch ends it.
 */
import type { GameEvent, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { el } from './dom';
import type { HudLayout } from './layout';

const PRESS_MS = 260;
const PULL_MS = 500;
const RELEASE_MS = 340;
const REST_MS = 520;
const CYCLE_MS = PRESS_MS + PULL_MS + RELEASE_MS + REST_MS;
const MAX_MS = 20_000;
/** A tap before this cannot skip: it is almost always the tap that started the game. */
const SKIP_AFTER_MS = 1000;
const ARC_DOTS = 7;

export class Tutorial {
  private readonly ctx: GameContext;
  private readonly root: HTMLDivElement;
  private readonly hand: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private readonly dots: HTMLDivElement[] = [];
  private layoutRef: HudLayout;
  private elapsed = 0;
  private hidden = false;
  private done: boolean;
  private readonly onTap = (): void => {
    if (this.elapsed >= SKIP_AFTER_MS) this.finish();
  };

  constructor(parent: HTMLElement, ctx: GameContext, layout: HudLayout) {
    this.ctx = ctx;
    this.layoutRef = layout;
    this.done = ctx.save.tutorialDone;
    this.root = el('div', 'tutorial', parent);
    this.root.dataset['testid'] = 'tutorial';
    this.ring = el('div', 'tutorial-ring', this.root);
    this.hand = el('div', 'tutorial-hand', this.root);
    for (let i = 0; i < ARC_DOTS; i++) this.dots.push(el('div', 'tutorial-dot', this.root));
    this.root.hidden = this.done;
    if (!this.done) window.addEventListener('pointerdown', this.onTap);
  }

  layout(layout: HudLayout): void {
    this.layoutRef = layout;
  }

  setHidden(value: boolean): void {
    this.hidden = value;
    this.root.hidden = this.done || value;
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
    const x = Math.round(this.layoutRef.viewW * 0.5);
    const y = Math.round(this.layoutRef.viewH * 0.78);
    const reach = this.ctx.tuning.PULL_MAX_PX;
    if (t < PRESS_MS) {
      this.drawPress(x, y, t / PRESS_MS);
      this.drawArc(snapshot, 0);
    } else if (t < PRESS_MS + PULL_MS) {
      const k = (t - PRESS_MS) / PULL_MS;
      this.drawPress(x, y - k * reach, 1);
      this.drawArc(snapshot, k);
    } else if (t < PRESS_MS + PULL_MS + RELEASE_MS) {
      const k = (t - PRESS_MS - PULL_MS) / RELEASE_MS;
      this.drawPress(x, y - reach, 1 - k);
      this.drawArc(snapshot, 1 - k);
    } else {
      this.drawPress(x, y, 0);
      this.drawArc(snapshot, 0);
    }
  }

  private drawPress(x: number, y: number, presence: number): void {
    this.hand.style.transform = `translate(${x + 4}px, ${y + 2}px)`;
    this.hand.style.opacity = String(presence <= 0 ? 0 : 0.2 + 0.65 * presence);
    this.ring.style.transform = `translate(${x - 6}px, ${y - 6}px)`;
    this.ring.style.opacity = String(0.6 * presence);
  }

  private drawArc(snapshot: WorldSnapshot | null, reveal: number): void {
    const originX = snapshot ? snapshot.bubble.pos.x - snapshot.camera.renderX : this.layoutRef.viewW * 0.5;
    const originY = snapshot ? snapshot.bubble.pos.y - snapshot.camera.renderY : this.layoutRef.viewH * 0.4;
    const shown = reveal <= 0 ? 0 : Math.max(1, Math.round(reveal * ARC_DOTS));
    this.dots.forEach((dot, i) => {
      const k = (i + 1) / ARC_DOTS;
      const y = originY + k * 26 + k * k * 42;
      dot.hidden = i >= shown || y > this.layoutRef.viewH;
      dot.style.transform = `translate(${originX - 1}px, ${y}px)`;
    });
  }

  /** Ends the tutorial for good and persists it. */
  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.ctx.save.tutorialDone = true;
    this.ctx.persistSettings();
    window.removeEventListener('pointerdown', this.onTap);
    this.root.hidden = true;
  }

  destroy(): void {
    window.removeEventListener('pointerdown', this.onTap);
  }
}
