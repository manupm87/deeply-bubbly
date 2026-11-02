/**
 * The single subscriber to `ctx.bus 'gameEvent'`: owns Particles, Juice, the camera's juice and Audio and
 * turns every `GameEvent` into the effects of GDD §7. It also runs the two effects that last: the wake
 * behind a flying Bur and the air leaking out of a deflating one.
 */
import type { GameEvent, Vec2, ZoneIndex } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { AudioFx } from './Audio';
import { CameraJuice } from './CameraJuice';
import { Juice } from './Juice';
import { Particles } from './Particles';

/** Squash & stretch hooks implemented by `render/BubbleView`. */
export interface BubbleViewHooks {
  stretch(dir: Vec2, power: number): void;
  impact(normal: Vec2, speed: number): void;
  land(): void;
  hurt(): void;
  deflate(): void;
  reform(): void;
  shieldFlash(): void;
}

const TRAIL_SPEED = 90;
const TRAIL_EVERY_MS = 38;
const LEAK_EVERY_MS = 46;

export class FxDirector {
  private readonly ctx: GameContext;
  private readonly bubble: BubbleViewHooks;
  readonly particles = new Particles();
  readonly camera: CameraJuice;
  readonly juice: Juice;
  readonly audio: AudioFx;
  private zone: ZoneIndex | null = null;
  private trailMs = 0;
  /** Time into a deflate; negative when she is not deflating. */
  private deflateMs = -1;
  private leakMs = 0;

  constructor(ctx: GameContext, bubble: BubbleViewHooks) {
    this.ctx = ctx;
    this.bubble = bubble;
    this.camera = new CameraJuice(ctx.settings);
    this.juice = new Juice(ctx, this.camera);
    this.audio = new AudioFx(ctx);
    this.audio.unlock();
    ctx.bus.on('gameEvent', (e) => this.handle(e));
  }

  /** Runs before the views that need the camera's zoom. */
  update(dtMs: number): void {
    const snap = this.ctx.snapshot;
    this.audio.update();
    this.camera.update(dtMs, snap && snap.bubble.aimOrigin !== null && !snap.hud.cancelZone ? snap.hud.power : 0);
    if (snap) {
      this.syncZone(snap.zone);
      this.runTrail(dtMs);
      this.runDeflate(dtMs);
    }
    this.particles.update(dtMs, snap?.camera.renderX ?? 0, snap?.camera.renderY ?? 0);
  }

  reset(): void {
    this.deflateMs = -1;
    this.camera.reset();
  }

  private runTrail(dtMs: number): void {
    const b = this.ctx.snapshot?.bubble;
    if (!b || (b.state !== 'LAUNCHED' && b.state !== 'IDLE') || Math.hypot(b.vel.x, b.vel.y) < TRAIL_SPEED) return;
    this.trailMs += dtMs;
    if (this.trailMs < TRAIL_EVERY_MS) return;
    this.trailMs = 0;
    this.particles.trail(b.pos, b.vel);
  }

  private runDeflate(dtMs: number): void {
    const b = this.ctx.snapshot?.bubble;
    if (this.deflateMs < 0 || !b) return;
    const total = this.ctx.tuning.DEFLATE_MS;
    this.deflateMs += dtMs;
    this.leakMs += dtMs;
    if (this.deflateMs < total && this.leakMs >= LEAK_EVERY_MS) {
      this.leakMs = 0;
      this.particles.leak(b.pos, b.radius);
    }
    if (this.deflateMs >= total) {
      this.particles.lastPop(b.pos);
      this.deflateMs = -1;
    }
  }

  private ledgeOf(id: string): { x: number; y: number; w: number } | null {
    const entity = this.ctx.snapshot?.entities.find((e) => e.id === id);
    if (entity?.type !== 'ceiling') return null;
    return { x: entity.rect.x, y: entity.rect.y + entity.rect.h, w: entity.rect.w };
  }

  /** Where on the view the next pip sits, from the HUD element itself: nothing here knows its layout. */
  private pipInView(): Vec2 | null {
    const snap = this.ctx.snapshot;
    const row = document.querySelector('.pips');
    if (!snap || !row) return null;
    const r = row.getBoundingClientRect();
    const s = this.ctx.scale;
    return { x: (r.left - s.offsetX) / s.zoom + 3 + Math.max(0, Math.round(snap.hud.air) - 1) * 8, y: (r.top - s.offsetY) / s.zoom + 3 };
  }

  private handle(e: GameEvent): void {
    this.juice.onEvent(e);
    this.audio.onEvent(e);
    const snap = this.ctx.snapshot;
    switch (e.type) {
      case 'launch':
        this.bubble.stretch(e.vel, e.power);
        this.particles.launchTail(e.at, e.vel, e.power);
        if (e.airLaunch) this.particles.airSpent(snap?.bubble.pos ?? e.at);
        break;
      case 'bounce':
        this.bubble.impact(e.contact.normal, e.speed);
        this.particles.impact(e.contact.point, e.contact.normal, e.speed, e.material);
        break;
      case 'rest':
        this.bubble.land();
        if (snap) this.particles.rest({ x: snap.bubble.pos.x, y: snap.bubble.pos.y - snap.bubble.radius }, this.ledgeOf(e.ceilingId));
        break;
      case 'pickup':
        this.particles.pickup(e.pickup.pos, e.pickup.pickupType, this.pipInView());
        break;
      case 'airLost':
        if (e.reason !== 'airLaunch') {
          this.bubble.hurt();
          this.particles.hurt(e.at);
        }
        break;
      case 'boya': {
        const entity = snap?.entities.find((x) => x.id === e.boyaId);
        if (snap && entity?.type === 'boya') this.particles.boya(snap.bubble.pos.x, entity.worldY, snap.camera.viewW);
        break;
      }
      case 'stationEnter':
        if (snap) this.particles.station(snap.camera.renderX + snap.camera.viewW / 2, snap.bubble.pos.y, snap.camera.viewW);
        break;
      case 'deflate':
        this.bubble.deflate();
        this.particles.deflate(e.at);
        this.deflateMs = 0;
        this.leakMs = 0;
        break;
      case 'respawn':
        this.deflateMs = -1;
        this.bubble.reform();
        this.particles.respawn(e.at);
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
