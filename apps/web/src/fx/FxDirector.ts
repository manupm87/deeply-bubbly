/**
 * The single subscriber to `ctx.bus 'gameEvent'`. It owns Particles, Juice and Audio and translates
 * every `GameEvent` into the effects of GDD §7 — nothing else in the shell listens to game events for
 * FX purposes, so the mapping "event → juice" lives in exactly one place.
 *
 * It receives the bubble view through a narrow interface instead of importing `render/BubbleView`:
 * FX must not depend on the renderer's internals.
 */
import type Phaser from 'phaser';
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

export interface FxTargets {
  bubbleView: BubbleViewHooks;
  /** The world camera. Kept for particle/emitter placement; the FX layer never writes to it. */
  camera: Phaser.Cameras.Scene2D.Camera;
  scene: Phaser.Scene;
}

export const GAME_EVENT = 'gameEvent';

export class FxDirector {
  private readonly ctx: GameContext;
  private readonly targets: FxTargets;
  readonly particles: Particles;
  readonly juice: Juice;
  readonly audio: AudioFx;
  private readonly listener: (e: GameEvent) => void;
  private zone: ZoneIndex | null = null;

  constructor(ctx: GameContext, targets: FxTargets) {
    this.ctx = ctx;
    this.targets = targets;
    this.particles = new Particles(targets.scene);
    this.juice = new Juice(ctx);
    this.audio = new AudioFx(ctx);
    this.audio.unlock();
    this.listener = (e: GameEvent) => this.handle(e);
    ctx.bus.on(GAME_EVENT, this.listener);
    this.syncZone(ctx.snapshot?.zone ?? 0);
  }

  /** Called once per rendered frame from GameScene. */
  update(): void {
    this.audio.update();
    const snap = this.ctx.snapshot;
    if (!snap) return;
    this.syncZone(snap.zone);
    this.particles.update(snap.camera.x, snap.camera.renderY, snap.camera.viewW, snap.camera.viewH);
  }

  destroy(): void {
    this.ctx.bus.off(GAME_EVENT, this.listener);
    this.particles.destroy();
    this.audio.destroy();
  }

  private handle(e: GameEvent): void {
    this.juice.onEvent(e);
    this.audio.onEvent(e);
    switch (e.type) {
      case 'launch':
        this.targets.bubbleView.stretch(e.vel);
        this.particles.launchTail(e.at, e.vel);
        // D1: the "double jump" is the only launch that spends a pip, so it gets a second, distinct
        // burst, at Bur — which is where `e.at` already is (core fills it with `bubble.pos`), so the
        // snapshot read is belt and braces for a frame in which no snapshot has been taken yet.
        if (e.airLaunch) this.particles.airSpent(this.ctx.snapshot?.bubble.pos ?? e.at);
        break;
      case 'bounce':
        this.targets.bubbleView.impact(e.contact.normal);
        this.particles.impact(e.contact.point, e.contact.normal);
        break;
      case 'pickup':
        this.particles.pickup(e.pickup.pos);
        break;
      case 'deflate':
        this.targets.bubbleView.deflate();
        this.particles.deflate(e.at);
        break;
      case 'respawn':
        this.targets.bubbleView.reform();
        break;
      case 'shieldUsed':
        // §2.5: the shield ate a hit. It must be visible, or the pip that did NOT go looks like a bug.
        this.targets.bubbleView.shieldFlash();
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
    this.particles.setZone(zone);
    this.audio.setZone(zone);
  }
}
