/**
 * Minimap of the HUD (D5 "ojeo"): BOTH the map and the camera control, like `apps/web/src/ui/Minimap.ts`.
 * While a finger holds it the shell asks `GameWorld.setPeek(worldPoint)`; everything drawn comes from
 * `snapshot.minimap`. It is a DOM element above the canvas, so holding it can never start a slingshot,
 * and the pointer is followed by id on `window`, so a drag off the map keeps steering while another
 * finger pulls the sling. Lifting it never touches the other finger's pull.
 */
import { minimapToWorld } from '@deeply-bubbly/core';
import type { MinimapMarkKind, MinimapModel, Vec2, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { UI, css } from '../palette';
import { el } from './dom';
import type { HudLayout } from './layout';

const ALPHA_ACTIVE = 1;
const ALPHA_IDLE = 0.45;
const FADE_MS = 200;
const KEY_STEP_PX = 12;

interface MarkStyle {
  colour: number;
  alpha: number;
}

const MARK_STYLES: Readonly<Record<MinimapMarkKind, MarkStyle>> = {
  ledge: { colour: UI.cyan, alpha: 0.95 },
  ledgeNoRest: { colour: UI.cyan, alpha: 0.45 },
  hazard: { colour: UI.amber, alpha: 0.9 },
  pickup: { colour: UI.white, alpha: 0.9 },
  field: { colour: UI.cyan, alpha: 0.18 },
  boya: { colour: UI.amber, alpha: 0.5 },
  station: { colour: UI.amber, alpha: 0.3 },
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const PEEK_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  i: [0, -KEY_STEP_PX],
  k: [0, KEY_STEP_PX],
  j: [-KEY_STEP_PX, 0],
  l: [KEY_STEP_PX, 0],
};

export class Minimap {
  private readonly ctx: GameContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private model: MinimapModel | null = null;
  private peekPointer: number | null = null;
  private readonly heldKeys = new Set<string>();
  private keyTarget: Vec2 | null = null;
  private alpha = ALPHA_IDLE;
  private hidden = false;
  private backingScale = 0;

  constructor(parent: HTMLElement, ctx: GameContext, layout: HudLayout) {
    this.ctx = ctx;
    this.canvas = el('canvas', 'minimap', parent);
    this.canvas.dataset['dbId'] = 'minimap';
    this.canvas.dataset['dbLabel'] = 'minimap';
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2d canvas unavailable');
    this.g = g;
    this.canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('blur', this.release);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.layout(layout);
  }

  layout(l: HudLayout): void {
    const t = this.ctx.tuning;
    const w = t.WORLD_W * t.MINIMAP_SCALE;
    const h = t.MINIMAP_WORLD_H * t.MINIMAP_SCALE;
    this.canvas.style.left = `${Math.round((l.viewW - w) / 2)}px`;
    this.canvas.style.top = `${Math.round(l.top + l.bandH + 2)}px`;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.backingScale = l.zoom * Math.min(globalThis.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.backingScale);
    this.canvas.height = Math.round(h * this.backingScale);
  }

  sync(snapshot: WorldSnapshot, dtMs: number): void {
    this.model = snapshot.minimap;
    this.draw(snapshot.minimap);
    const state = snapshot.bubble.state;
    const deciding = state === 'RESTING' || state === 'AIMING' || this.peeking;
    const target = deciding ? ALPHA_ACTIVE : ALPHA_IDLE;
    this.alpha += (target - this.alpha) * clamp(dtMs / FADE_MS, 0, 1);
    this.canvas.style.opacity = this.alpha.toFixed(3);
  }

  private fill(colour: number, alpha: number, x: number, y: number, w: number, h: number): void {
    this.g.globalAlpha = alpha;
    this.g.fillStyle = css(colour);
    this.g.fillRect(x, y, w, h);
  }

  private draw(m: MinimapModel): void {
    const g = this.g;
    g.setTransform(this.backingScale, 0, 0, this.backingScale, 0, 0);
    g.clearRect(0, 0, m.w, m.h);
    this.fill(UI.panel, 0.55, 0, 0, m.w, m.h);
    for (const mark of m.marks) {
      const s = MARK_STYLES[mark.kind];
      this.fill(s.colour, s.alpha, mark.rect.x, mark.rect.y, Math.max(1, mark.rect.w), Math.max(1, mark.rect.h));
    }
    // Bur: a white core in a dark keyline, a shape no mark has, clamped into the panel.
    const bx = clamp(Math.round(m.bur.x) - 2, 0, Math.max(0, m.w - 4));
    const by = clamp(Math.round(m.bur.y) - 2, 0, Math.max(0, m.h - 4));
    this.fill(UI.panel, 0.95, bx, by, 4, 4);
    this.fill(UI.white, 1, bx + 1, by + 1, 2, 2);
    // The frame of the DRAWN view; core lets it stick out, so it is clipped here.
    const x0 = Math.max(0, m.view.x);
    const y0 = Math.max(0, m.view.y);
    const x1 = Math.min(m.w, m.view.x + m.view.w);
    const y1 = Math.min(m.h, m.view.y + m.view.h);
    g.lineWidth = 0.75;
    if (x1 - x0 >= 1 && y1 - y0 >= 1) {
      g.globalAlpha = 0.9;
      g.strokeStyle = css(UI.white);
      g.strokeRect(x0 + 0.4, y0 + 0.4, x1 - x0 - 0.8, y1 - y0 - 0.8);
    }
    g.globalAlpha = 0.6;
    g.strokeStyle = css(UI.cyan);
    g.strokeRect(0.4, 0.4, m.w - 0.8, m.h - 0.8);
    g.globalAlpha = 1;
  }

  private get peeking(): boolean {
    return this.peekPointer !== null || this.heldKeys.size > 0;
  }

  /** css px → minimap px (clamped to the map) → world, then `setPeek`. */
  private peekAt(clientX: number, clientY: number): void {
    const model = this.model;
    if (!model) return;
    const r = this.canvas.getBoundingClientRect();
    const mx = clamp(((clientX - r.left) / r.width) * model.w, 0, model.w);
    const my = clamp(((clientY - r.top) / r.height) * model.h, 0, model.h);
    this.ctx.world.setPeek(minimapToWorld({ x: mx, y: my }, model));
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (this.hidden) return;
    e.preventDefault();
    this.peekPointer = e.pointerId;
    this.peekAt(e.clientX, e.clientY);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (this.peekPointer !== e.pointerId) return;
    this.peekAt(e.clientX, e.clientY);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (this.peekPointer !== e.pointerId) return;
    this.peekPointer = null;
    this.applyPeek();
  };

  private readonly onCancel = (e: PointerEvent): void => {
    if (this.peekPointer === e.pointerId) this.release();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible') this.release();
  };

  /** Desktop test aid (`apps/web/src/ui/peekKeys.ts`): I/J/K/L nudge a target that starts at Bur. */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const step = PEEK_KEYS[e.key.toLowerCase()];
    if (!step || this.hidden) return;
    if (this.keyTarget === null) {
      const origin = this.ctx.snapshot?.bubble.pos;
      if (!origin) return;
      this.keyTarget = { x: origin.x, y: origin.y };
    }
    this.heldKeys.add(e.key.toLowerCase());
    this.keyTarget = { x: this.keyTarget.x + step[0], y: this.keyTarget.y + step[1] };
    this.ctx.world.setPeek(this.keyTarget);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (!this.heldKeys.delete(e.key.toLowerCase()) || this.heldKeys.size > 0) return;
    this.keyTarget = null;
    this.applyPeek();
  };

  /** Whatever is holding the peek right now wins; nothing holding it means the view glides back. */
  private applyPeek(): void {
    if (this.keyTarget) {
      this.ctx.world.setPeek(this.keyTarget);
      return;
    }
    if (this.peekPointer === null) this.ctx.world.setPeek(null);
  }

  private readonly release = (): void => {
    if (!this.peeking) return;
    this.peekPointer = null;
    this.heldKeys.clear();
    this.keyTarget = null;
    this.ctx.world.setPeek(null);
  };

  /**
   * Called every frame; only the transitions do anything. A screen taking the glass also stops the
   * world's step, so the peek is dropped outright instead of gliding home after the player resumes.
   */
  setVisible(value: boolean): void {
    if (this.hidden === !value) return;
    this.hidden = !value;
    this.canvas.hidden = !value;
    if (value) return;
    this.release();
    this.ctx.world.clearPeek();
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('blur', this.release);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.remove();
  }
}
