/**
 * Top band of the HUD (GDD §8): air pips, depth counter and ribbon with zone marks, fish and record
 * tick, plus the resaca arrow of §2.4.2. Everything comes from the snapshot; no rule lives here.
 */
import { DEFAULT_TUNING, WORLD_BOTTOM_PX, ZONES, metersToPx } from '@deeply-bubbly/core';
import type { GameEvent, HudData, Tuning, WorldSnapshot } from '@deeply-bubbly/core';
import { reducedMotion } from '../fx/motion';
import { el } from './dom';
import type { HudLayout } from './layout';
import { formatMeters } from './strings';

const PIP = 6;
const GAP = 2;
const MAX_PIPS = 12;
const BLINK_MS = 900;
const RESACA_BLINK_MS = 220;

class AirPips {
  private readonly row: HTMLDivElement;
  private readonly pips: HTMLSpanElement[] = [];
  private key = '';

  constructor(parent: HTMLElement) {
    this.row = el('div', 'pips', parent);
    for (let i = 0; i < MAX_PIPS; i++) {
      const pip = el('span', 'pip', this.row);
      pip.dataset['pip'] = String(i);
      pip.hidden = true;
      this.pips.push(pip);
    }
  }

  layout(l: HudLayout): void {
    this.row.style.left = `${l.margin}px`;
    this.row.style.top = `${l.top}px`;
  }

  sync(hud: HudData, timeMs: number): void {
    const base = Math.max(0, Math.min(MAX_PIPS, Math.round(hud.airMaxBase)));
    const max = Math.max(0, Math.min(base, Math.round(hud.airMax)));
    const air = Math.max(0, Math.min(base, Math.round(hud.air)));
    const key = `${base}/${max}/${air}/${hud.lastPip}`;
    if (key !== this.key) {
      this.key = key;
      this.pips.forEach((pip, i) => {
        pip.hidden = i >= base;
        const kind = i < air ? (hud.lastPip ? 'last' : 'full') : i < max ? 'empty' : 'capped';
        pip.className = `pip pip-${kind}`;
        pip.style.opacity = '';
      });
    }
    if (hud.lastPip) {
      const phase = (timeMs % BLINK_MS) / BLINK_MS;
      const first = this.pips[0];
      if (first) first.style.opacity = String(0.5 + 0.5 * Math.abs(Math.sin(phase * Math.PI)));
    }
  }

  /** A short ghost pip: red when it hurt, cyan when D1's double jump spent it, white when gained. */
  handleEvent(event: GameEvent): void {
    if (event.type === 'airLost') {
      const spent = event.reason === 'airLaunch';
      this.pop(Math.max(0, Math.round(event.air)), spent ? 'ghost-spent' : 'ghost-lost', spent ? -3 : 3);
    } else if (event.type === 'airGained') {
      const index = Math.max(0, Math.round(event.air) - 1);
      this.pop(index, 'ghost-gained', -3);
      // The pip that filled swells as the air flying up from the pickup reaches it.
      if (!reducedMotion()) {
        this.pips[index]?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }, { transform: 'scale(1)' }], {
          duration: 300,
          delay: 240,
          easing: 'ease-out',
        });
      }
    }
  }

  private pop(index: number, className: string, dy: number): void {
    if (index < 0 || index >= MAX_PIPS) return;
    const ghost = el('span', `pip pip-ghost ${className}`, this.row);
    ghost.style.left = `${index * (PIP + GAP)}px`;
    ghost
      .animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${dy}px)`, opacity: 0 }], {
        duration: 260,
        easing: 'ease-out',
      })
      .finished.finally(() => ghost.remove())
      .catch(() => undefined);
  }
}

class DepthMeter {
  private readonly text: HTMLDivElement;
  private readonly ribbon: HTMLDivElement;
  private readonly fish: HTMLDivElement;
  private readonly record: HTMLDivElement;
  private top = 0;
  private height = 100;
  private shownM = 0;
  private lastRounded = -1;
  private lastRecord = -1;

  constructor(parent: HTMLElement, private readonly tuningOf: () => Tuning) {
    this.text = el('div', 'depth-text', parent);
    this.text.dataset['testid'] = 'depth';
    this.ribbon = el('div', 'ribbon', parent);
    for (const zone of ZONES) {
      if (zone.startPx <= 0) continue;
      const mark = el('div', 'ribbon-mark', this.ribbon);
      mark.style.top = `${(zone.startPx / WORLD_BOTTOM_PX) * 100}%`;
    }
    this.record = el('div', 'ribbon-record', this.ribbon);
    this.record.hidden = true;
    this.fish = el('div', 'ribbon-fish', this.ribbon);
  }

  layout(l: HudLayout): void {
    this.top = l.top + l.bandH;
    this.height = Math.max(24, l.thumbY - 6 - this.top);
    this.ribbon.style.top = `${this.top}px`;
    this.ribbon.style.height = `${this.height}px`;
    this.text.style.top = `${l.top}px`;
    this.text.style.right = `${l.margin}px`;
    this.lastRecord = -1;
  }

  private yFor(meters: number): number {
    const f = metersToPx(Math.max(0, meters)) / WORLD_BOTTOM_PX;
    return Math.round(Math.min(1, Math.max(0, f)) * this.height);
  }

  sync(hud: HudData): void {
    // Smoothed: metres per pixel change 11× between zones, and an unsmoothed reading is illegible in Z6.
    const step = this.tuningOf().DEPTH_COUNTER_MAX_STEP_M ?? DEFAULT_TUNING.DEPTH_COUNTER_MAX_STEP_M;
    const target = Number.isFinite(hud.depthM) ? Math.max(0, hud.depthM) : 0;
    this.shownM += Math.max(-step, Math.min(step, target - this.shownM));
    const rounded = Math.round(this.shownM);
    if (rounded !== this.lastRounded) {
      this.lastRounded = rounded;
      this.text.textContent = formatMeters(rounded);
    }
    this.fish.style.transform = `translateY(${this.yFor(this.shownM)}px)`;
    if (hud.bestDepthM !== this.lastRecord) {
      this.lastRecord = hud.bestDepthM;
      this.record.hidden = hud.bestDepthM <= 0;
      this.record.style.top = `${this.yFor(hud.bestDepthM)}px`;
    }
  }
}

/** Amber arrow pointing at Bur while she is off the top of the view and the grace window runs. */
class ResacaWarning {
  private readonly arrow: HTMLDivElement;
  private layoutRef: HudLayout | null = null;

  constructor(parent: HTMLElement) {
    this.arrow = el('div', 'resaca', parent);
    this.arrow.hidden = true;
  }

  layout(l: HudLayout): void {
    this.layoutRef = l;
  }

  sync(snapshot: WorldSnapshot, hidden: boolean): void {
    const l = this.layoutRef;
    const until = snapshot.bubble.flags.resacaUntil;
    const on = !hidden && until > 0 && snapshot.timeMs < until && l !== null;
    this.arrow.hidden = !on;
    if (!on || l === null) return;
    const above = snapshot.bubble.pos.y < snapshot.camera.renderY;
    const burX = snapshot.bubble.pos.x - snapshot.camera.renderX;
    const x = Math.round(Math.min(l.viewW - 8, Math.max(8, burX)));
    const y = above ? l.top + l.bandH + 6 : Math.round(l.viewH * 0.62);
    this.arrow.style.transform = `translate(${x - 5}px, ${y}px) rotate(${above ? 0 : 180}deg)`;
    this.arrow.style.opacity = String(0.45 + 0.55 * Math.abs(Math.sin(snapshot.timeMs / RESACA_BLINK_MS)));
  }
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly band: HTMLDivElement;
  private readonly pips: AirPips;
  private readonly depth: DepthMeter;
  private readonly resaca: ResacaWarning;

  constructor(parent: HTMLElement, layout: HudLayout, tuningOf: () => Tuning) {
    this.root = el('div', 'hud', parent);
    this.band = el('div', 'hud-band', this.root);
    this.pips = new AirPips(this.root);
    this.depth = new DepthMeter(this.root, tuningOf);
    this.resaca = new ResacaWarning(parent);
    this.layout(layout);
  }

  layout(l: HudLayout): void {
    this.band.style.height = `${l.top + 22}px`;
    this.pips.layout(l);
    this.depth.layout(l);
    this.resaca.layout(l);
  }

  sync(snapshot: WorldSnapshot): void {
    this.pips.sync(snapshot.hud, snapshot.timeMs);
    this.depth.sync(snapshot.hud);
  }

  syncResaca(snapshot: WorldSnapshot, hidden: boolean): void {
    this.resaca.sync(snapshot, hidden);
  }

  handleEvent(event: GameEvent): void {
    this.pips.handleEvent(event);
  }

  setVisible(value: boolean): void {
    this.root.hidden = !value;
  }
}
