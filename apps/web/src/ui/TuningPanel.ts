/**
 * Live tuning panel (SHELL.md §"Panel de tuning", tool nº 1 of the project). Plain DOM overlay, never
 * a Phaser scene: it must stay usable while the game is paused, hitching or mid-restart.
 *
 * Toggled with `?tuning=1` or the `T` key. Every numeric field of DEFAULT_TUNING gets a slider plus a
 * number box (arrays and records get one row per element); changes go straight to
 * `ctx.applyTuning(createTuning(overrides))`. Export writes only the diff against the defaults, which
 * is what you paste back into `tuning.ts`.
 */
import type Phaser from 'phaser';
import { DEFAULT_TUNING, createTuning } from '@deeply-bubbly/core';
import type { GameEvent, Tuning } from '@deeply-bubbly/core';
import type { GameContext } from '../context';

interface Field {
  key: string;
  group: string;
  label: string;
  def: number;
  get(): number;
  set(v: number): void;
}

const READOUT_MS = 150;
const MAX_EVENTS = 8;
/** Touch-first: every control is at least 32 px tall, the panel never eats more than 45 % of the screen. */
const CSS = `
.tp{position:fixed;left:0;right:0;bottom:0;z-index:50;max-height:45vh;display:flex;flex-direction:column;background:rgba(11,31,51,.95);color:#8ecae6;font:12px/1.3 ui-monospace,Menlo,Consolas,monospace;border-top:2px solid #ffb703;box-sizing:border-box}
.tp[hidden]{display:none}
.tp-bar{display:flex;gap:6px;align-items:center;padding:6px;flex:0 0 auto;flex-wrap:wrap}
.tp-bar b{color:#ffb703}
.tp button{min-height:32px;min-width:44px;padding:0 10px;background:#123;color:#8ecae6;border:1px solid #35617f;border-radius:4px;font:inherit}
.tp-read{flex:1 1 100%;color:#cfe8f5;white-space:pre-wrap;word-break:break-word}
.tp-body{overflow:auto;-webkit-overflow-scrolling:touch;padding:0 6px 8px}
.tp details{border-top:1px solid #24455c}
.tp summary{min-height:32px;line-height:32px;color:#ffb703;cursor:pointer}
.tp-row{display:flex;align-items:center;gap:6px;min-height:32px}
.tp-row label{flex:0 0 40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tp-row input[type=range]{flex:1 1 auto;min-width:60px;height:32px}
.tp-row input[type=number]{flex:0 0 76px;height:32px;background:#0b1f33;color:#e8f6f3;border:1px solid #35617f;border-radius:4px;font:inherit;box-sizing:border-box}
.tp textarea{width:100%;height:96px;background:#06131f;color:#e8f6f3;border:1px solid #35617f;font:inherit;box-sizing:border-box}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
};

const round = (v: number): number => Number(v.toFixed(5));

/** Slider bounds and step derived from the default value: no per-field table to maintain. */
function bounds(def: number): { min: number; max: number; step: number } {
  const mag = Math.abs(def);
  const step = mag === 0 ? 0.01 : mag < 2 ? 0.001 : mag < 50 ? 0.1 : 1;
  if (def < 0) return { min: def * 3, max: 0, step };
  return { min: 0, max: mag === 0 ? 1 : mag * 3, step };
}

export class TuningPanel {
  private readonly ctx: GameContext;
  private readonly scene: Phaser.Scene;
  private readonly working: Tuning = createTuning();
  private readonly fields: Field[] = [];
  private readonly inputs = new Map<string, { range: HTMLInputElement; num: HTMLInputElement }>();
  private readonly root = el('div', 'tp');
  /** Kept so `destroy()` can take it back out of <head>: the panel is rebuilt on every scene create. */
  private readonly style = el('style');
  private readonly readout = el('div', 'tp-read');
  private readonly text = el('textarea');
  private readonly body = el('div', 'tp-body');
  private readonly events: string[] = [];
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly onGameEvent: (e: GameEvent) => void;
  private timer = 0;

  constructor(scene: Phaser.Scene, ctx: GameContext) {
    this.scene = scene;
    this.ctx = ctx;
    this.collectFields();
    this.buildDom();
    this.onKey = (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 't' || e.key === 'T') this.toggle();
    };
    document.addEventListener('keydown', this.onKey);
    this.onGameEvent = (e) => {
      this.events.push(e.type);
      if (this.events.length > MAX_EVENTS) this.events.shift();
    };
    ctx.bus.on('gameEvent', this.onGameEvent);
    this.timer = globalThis.setInterval(() => this.refresh(), READOUT_MS);
    this.root.hidden = !new URLSearchParams(globalThis.location.search).has('tuning');
  }

  toggle(force?: boolean): void {
    this.root.hidden = force === undefined ? !this.root.hidden : !force;
  }

  destroy(): void {
    globalThis.clearInterval(this.timer);
    document.removeEventListener('keydown', this.onKey);
    this.ctx.bus.off('gameEvent', this.onGameEvent);
    this.root.remove();
    this.style.remove();
  }

  /** Walks DEFAULT_TUNING once: numbers, number arrays and Record<string, number> become rows. */
  private collectFields(): void {
    const t = this.working as unknown as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_TUNING)) {
      const value = t[key];
      const group = key.split('_')[0] ?? key;
      if (typeof value === 'number') {
        this.fields.push({ key, group, label: key, def: value, get: () => t[key] as number, set: (v) => (t[key] = v) });
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => {
          if (typeof item !== 'number') return;
          const arr = value as number[];
          this.fields.push({ key: `${key}[${i}]`, group, label: `${key}[${i}]`, def: item, get: () => arr[i] ?? item, set: (v) => (arr[i] = v) });
        });
      } else if (value && typeof value === 'object') {
        const rec = value as Record<string, number>;
        for (const k of Object.keys(rec)) {
          const def = rec[k];
          if (typeof def !== 'number') continue;
          this.fields.push({ key: `${key}.${k}`, group, label: `${key}.${k}`, def, get: () => rec[k] ?? def, set: (v) => (rec[k] = v) });
        }
      }
    }
  }

  /** Overrides = every top-level key that differs from the defaults (arrays/records copied whole). */
  private overrides(): Partial<Tuning> {
    const out: Record<string, unknown> = {};
    const cur = this.working as unknown as Record<string, unknown>;
    const def = DEFAULT_TUNING as unknown as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_TUNING)) {
      if (JSON.stringify(cur[key]) !== JSON.stringify(def[key])) out[key] = cur[key];
    }
    return out as Partial<Tuning>;
  }

  /** The BASE tuning: `main.ts` re-applies the accessibility transforms on top, so a slider can no
   * longer cancel "carga lenta" and a settings toggle can no longer discard these overrides. */
  private apply(): void {
    this.ctx.applyTuning(createTuning(this.overrides()));
  }

  /** Pushes the model value back into both inputs of a row (they mirror each other). */
  private sync(f: Field): void {
    const pair = this.inputs.get(f.key);
    if (!pair) return;
    pair.range.value = String(f.get());
    pair.num.value = String(f.get());
  }

  private setField(f: Field, raw: number): void {
    if (!Number.isFinite(raw)) return;
    f.set(round(raw));
    this.sync(f);
    this.apply();
  }

  private buildDom(): void {
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    const bar = el('div', 'tp-bar');
    const title = el('b');
    title.textContent = 'TUNING';
    bar.append(title, this.button('Reset', () => this.reset()), this.button('Export', () => this.exportJson()), this.button('Import', () => this.importJson()), this.button('Hide', () => this.toggle(false)), this.readout);
    this.text.hidden = true;
    this.text.spellcheck = false;

    const groups = new Map<string, HTMLElement>();
    for (const f of this.fields) {
      let box = groups.get(f.group);
      if (!box) {
        const details = el('details');
        const summary = el('summary');
        summary.textContent = f.group;
        details.append(summary);
        this.body.append(details);
        groups.set(f.group, details);
        box = details;
      }
      box.append(this.row(f));
    }
    this.root.append(bar, this.text, this.body);
    document.body.appendChild(this.root);
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  private row(f: Field): HTMLElement {
    const { min, max, step } = bounds(f.def);
    const row = el('div', 'tp-row');
    const label = el('label');
    label.textContent = f.label;
    label.title = f.label;
    const range = el('input');
    range.type = 'range';
    const num = el('input');
    num.type = 'number';
    for (const input of [range, num]) {
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(f.get());
    }
    range.addEventListener('input', () => this.setField(f, Number(range.value)));
    num.addEventListener('change', () => this.setField(f, Number(num.value)));
    this.inputs.set(f.key, { range, num });
    row.append(label, range, num);
    return row;
  }

  private reset(): void {
    for (const f of this.fields) {
      f.set(f.def);
      this.sync(f);
    }
    this.apply();
  }

  private exportJson(): void {
    const json = JSON.stringify(this.overrides(), null, 2);
    this.text.hidden = false;
    this.text.value = json;
    this.text.select();
    void globalThis.navigator?.clipboard?.writeText(json).catch(() => undefined);
  }

  /** Reads the textarea (shown empty on the first press) and merges it over the defaults. */
  private importJson(): void {
    if (this.text.hidden || this.text.value.trim() === '') {
      this.text.hidden = false;
      this.text.value = this.text.value || '{\n}';
      this.text.focus();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.text.value);
    } catch {
      this.readout.textContent = 'Import: JSON inválido';
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    const incoming = parsed as Record<string, unknown>;
    const cur = this.working as unknown as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_TUNING)) {
      if (key in incoming) cur[key] = incoming[key];
    }
    for (const f of this.fields) this.sync(f);
    this.apply();
  }

  /** Nearest streamed entity id is prefixed with its placed chunk index (`"12:ceil-a"`). */
  private chunkId(): string {
    const snap = this.ctx.snapshot;
    if (!snap) return '-';
    let best = '-';
    let bestDist = Infinity;
    for (const e of snap.entities) {
      const prefix = e.id.split(':')[0];
      if (prefix === undefined || !/^\d+$/.test(prefix)) continue;
      const y = 'rect' in e ? e.rect.y : 'shape' in e ? e.shape.y : 'pos' in e ? e.pos.y : e.worldY;
      const dist = Math.abs(y - snap.bubble.pos.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = prefix;
      }
    }
    return best;
  }

  private refresh(): void {
    if (this.root.hidden) return;
    const snap = this.ctx.snapshot;
    const fps = this.scene.game.loop.actualFps.toFixed(0);
    // `x`/`cam` are the D3 axis: read them while tuning CAM_DEADZONE_X or checking a chunk's width.
    const state = snap ? `${snap.bubble.state} x${snap.bubble.pos.x.toFixed(0)} cam${snap.camera.x.toFixed(0)} air ${snap.hud.air}/${snap.hud.airMax} ${snap.hud.depthM.toFixed(1)}m z${snap.zone} chunk ${this.chunkId()}` : 'no snapshot';
    this.readout.textContent = `${fps} fps · ${state}\n${this.events.join(' ')}`;
  }
}

/** Creates the panel; call once from GameScene (or main.ts) after the context exists. */
export function createTuningPanel(scene: Phaser.Scene, ctx: GameContext): TuningPanel {
  return new TuningPanel(scene, ctx);
}
