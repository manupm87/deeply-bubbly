/**
 * The single subscriber to `ctx.bus 'gameEvent'`: owns Particles, Juice and Audio and turns every
 * `GameEvent` into the effects of GDD §7, the same mapping as `apps/web/src/fx/FxDirector.ts`.
 */
import type { GameEvent, Vec2, ZoneIndex } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { AudioFx } from './Audio';
import { Juice } from './Juice';
import { Particles } from './Particles';

/** Squash & stretch hooks implemented by `render/BubbleView`. */
export interface BubbleViewHooks {
  stretch(dir: Vec2): void;
  impact(normal: Vec2): void;
  deflate(): void;
  reform(): void;
  shieldFlash(): void;
}

export class FxDirector {
  private readonly ctx: GameContext;
  private readonly bubble: BubbleViewHooks;
  readonly particles = new Particles();
  readonly juice: Juice;
  readonly audio: AudioFx;
  private zone: ZoneIndex | null = null;

  constructor(ctx: GameContext, bubble: BubbleViewHooks) {
    this.ctx = ctx;
    this.bubble = bubble;
    this.juice = new Juice(ctx);
    this.audio = new AudioFx(ctx);
    this.audio.unlock();
    ctx.bus.on('gameEvent', (e) => this.handle(e));
  }

  update(dtMs: number): void {
    this.audio.update();
    this.particles.update(dtMs);
    const snap = this.ctx.snapshot;
    if (snap) this.syncZone(snap.zone);
  }

  private handle(e: GameEvent): void {
    this.juice.onEvent(e);
    this.audio.onEvent(e);
    switch (e.type) {
      case 'launch':
        this.bubble.stretch(e.vel);
        this.particles.launchTail(e.at, e.vel);
        if (e.airLaunch) this.particles.airSpent(this.ctx.snapshot?.bubble.pos ?? e.at);
        break;
      case 'bounce':
        this.bubble.impact(e.contact.normal);
        this.particles.impact(e.contact.point, e.contact.normal);
        break;
      case 'pickup':
        this.particles.pickup(e.pickup.pos);
        break;
      case 'deflate':
        this.bubble.deflate();
        this.particles.deflate(e.at);
        break;
      case 'respawn':
        this.bubble.reform();
        break;
      case 'shieldUsed':
        this.bubble.shieldFlash();
        this.particles.shield(e.at);
        break;
      case 'zoneChange':
        this.syncZone(e.to);
        break;
      default:
        break;
    }
  }

  private syncZone(zone: ZoneIndex): void {
    if (zone === this.zone) return;
    this.zone = zone;
    this.audio.setZone(zone);
  }
}
