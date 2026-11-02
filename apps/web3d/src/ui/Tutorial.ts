/**
 * Wordless first-run tutorial (GDD §8, D2). A ghost hand plays the REAL shot that reaches the next ledge
 * (`pickShot`): it presses, draws the sling back and lets go, the arc grows from Bur, and then a ghost of
 * her flies that arc and floats up under the ledge, which is the rule nobody guesses.
 *
 * It blocks nothing (pointer-events are off), and stands aside whenever the player has the sling or Bur
 * is in the water. It ends when she has actually come to rest lower down: a tap, or a first shot that
 * floats straight back, has taught nothing yet.
 */
import { launchImpulse, launchVelocity, pickShot } from '@deeply-bubbly/core';
import type { Vec2, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { forecastFlight } from '../render/shotForecast';
import { el } from './dom';
import type { HudLayout } from './layout';

const PRESS_MS = 320;
const PULL_MS = 700;
const HOLD_MS = 260;
const RELEASE_MS = 120;
const FLY_MS = 1250;
const REST_MS = 420;
const CYCLE_MS = PRESS_MS + PULL_MS + HOLD_MS + RELEASE_MS + FLY_MS + REST_MS;
const ARC_DOTS = 14;
const FALLBACK = { power: 0.7, thetaDeg: -20 };
const PROGRESS_PX = 20;
/** An index finger, pointing up, with its tip at the top centre of a 24 x 30 box. */
const HAND_SVG =
  '<svg viewBox="0 0 24 30" width="24" height="30"><path fill="#fff" stroke="#0b1f33" stroke-width="1.2" stroke-linejoin="round" d="M9 2.5a2.5 2.5 0 0 1 5 0V13l5.2 1.2c1.6.4 2.6 1.9 2.3 3.5l-1.3 7.2c-.3 1.4-1.5 2.6-3 2.6h-7c-1 0-2-.5-2.6-1.3L2.3 19.6c-.8-1 .4-3 2.3-2.6L9 18.4z"/></svg>';

interface Demo {
  ledgeY: number;
  dx: number;
  dy: number;
  arc: Vec2[];
}

export class Tutorial {
  private readonly ctx: GameContext;
  private readonly root: HTMLDivElement;
  private readonly hand: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private readonly ghost: HTMLDivElement;
  private readonly dots: HTMLDivElement[] = [];
  private layoutRef: HudLayout;
  private elapsed = 0;
  private hidden = false;
  private done: boolean;
  private demo: Demo | null = null;
  private startY: number | null = null;

  constructor(parent: HTMLElement, ctx: GameContext, layout: HudLayout) {
    this.ctx = ctx;
    this.layoutRef = layout;
    this.done = ctx.save.tutorialDone;
    this.root = el('div', 'tutorial', parent);
    this.root.dataset['testid'] = 'tutorial';
    this.ring = el('div', 'tutorial-ring', this.root);
    for (let i = 0; i < ARC_DOTS; i++) this.dots.push(el('div', 'tutorial-dot', this.root));
    this.ghost = el('div', 'tutorial-ghost', this.root);
    this.hand = el('div', 'tutorial-hand', this.root);
    this.hand.innerHTML = HAND_SVG;
    this.root.hidden = this.done;
    this.clearParts();
  }

  layout(layout: HudLayout): void {
    this.layoutRef = layout;
  }

  setHidden(value: boolean): void {
    this.hidden = value;
    this.root.hidden = this.done || value;
  }

  update(dtMs: number, snapshot: WorldSnapshot | null): void {
    if (this.done || this.hidden || snapshot === null) return;
    const b = snapshot.bubble;
    const resting = b.state === 'RESTING';
    if (resting && this.startY === null) this.startY = b.pos.y;
    if (resting && this.startY !== null && b.pos.y > this.startY + PROGRESS_PX) {
      this.finish();
      return;
    }
    if (!resting || b.aimOrigin !== null) {
      // Her turn: the lesson starts over from the top when she is back under a ledge.
      this.elapsed = 0;
      this.demo = null;
      this.clearParts();
      return;
    }
    if (this.demo === null || this.demo.ledgeY !== b.pos.y) this.demo = this.buildDemo(snapshot);
    this.elapsed += dtMs;
    this.draw(snapshot, this.demo, this.elapsed % CYCLE_MS);
  }

  private buildDemo(snapshot: WorldSnapshot): Demo {
    const t = this.ctx.tuning;
    const shot = pickShot(snapshot, t) ?? FALLBACK;
    const theta = (shot.thetaDeg * Math.PI) / 180;
    const reach = t.PULL_MAX_PX * shot.power;
    const b = snapshot.bubble;
    const speed = launchImpulse({ power: shot.power, radius: b.radius, stunned: false, sticky: false, chargeMul: 1, impulseMul: 1 }, t);
    const flight = forecastFlight(snapshot, b.pos, launchVelocity(theta, speed), t);
    const arc: Vec2[] = [];
    for (let i = 1; i <= ARC_DOTS; i++) {
      const point = flight.path[Math.round((i / ARC_DOTS) * (flight.path.length - 1))];
      if (point) arc.push(point);
    }
    return { ledgeY: b.pos.y, dx: -Math.sin(theta) * reach, dy: -Math.cos(theta) * reach, arc };
  }

  private draw(snapshot: WorldSnapshot, demo: Demo, t: number): void {
    const x0 = this.layoutRef.viewW * 0.5;
    const y0 = this.layoutRef.viewH * 0.82;
    const pullEnds = PRESS_MS + PULL_MS;
    const holdEnds = pullEnds + HOLD_MS;
    const releaseEnds = holdEnds + RELEASE_MS;
    let pull = 0;
    let presence = 0;
    let fly = -1;
    if (t < PRESS_MS) {
      presence = t / PRESS_MS;
    } else if (t < pullEnds) {
      presence = 1;
      pull = (t - PRESS_MS) / PULL_MS;
    } else if (t < holdEnds) {
      presence = 1;
      pull = 1;
    } else if (t < releaseEnds) {
      presence = 1 - (t - holdEnds) / RELEASE_MS;
      pull = 1;
    } else {
      fly = Math.min(1, (t - releaseEnds) / FLY_MS);
    }
    const hx = x0 + demo.dx * pull;
    const hy = y0 + demo.dy * pull;
    this.hand.style.transform = `translate(${hx - 12}px, ${hy}px)`;
    this.hand.style.opacity = String(presence * 0.95);
    this.ring.style.transform = `translate(${x0 - 8}px, ${y0 - 8}px)`;
    this.ring.style.opacity = String(presence > 0 ? 0.8 : 0);

    const cam = snapshot.camera;
    const reveal = fly >= 0 ? 1 : pull;
    const shown = Math.round(reveal * demo.arc.length);
    this.dots.forEach((dot, i) => {
      const p = demo.arc[i];
      dot.hidden = !p || i >= shown;
      if (p) dot.style.transform = `translate(${p.x - cam.renderX - 1.5}px, ${p.y - cam.renderY - 1.5}px)`;
    });
    this.ghost.hidden = fly < 0;
    if (fly >= 0) {
      const p = demo.arc[Math.min(demo.arc.length - 1, Math.floor(fly * demo.arc.length))];
      if (p) this.ghost.style.transform = `translate(${p.x - cam.renderX - 7}px, ${p.y - cam.renderY - 7}px)`;
    }
  }

  private clearParts(): void {
    this.hand.style.opacity = '0';
    this.ring.style.opacity = '0';
    this.ghost.hidden = true;
    for (const dot of this.dots) dot.hidden = true;
  }

  /** Ends the tutorial for good and persists it; the first ledge's patience ends with it. */
  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.ctx.save.tutorialDone = true;
    this.ctx.bus.emit('settingsChanged');
    this.root.hidden = true;
  }

  destroy(): void {
    this.root.remove();
  }
}
