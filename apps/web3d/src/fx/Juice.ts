/**
 * Time and camera juice (GDD §7), driven by `GameEvent`s:
 *   - hitstop: 40 ms on losing Air, a sliver on a hard bounce. The 90 ms of the pop is NOT here: core
 *     publishes it as its own `hitstop` event and Shell serves that;
 *   - a kick on every launch, bounce and rest, sized by how hard it was;
 *   - shake ONLY on bounces faster than 400 px/s, and a zoom punch instead of any shake on losing Air.
 *
 * Core's own `zoomPunch` (on falling fast) stays unserved: falling is most of this game, and a view that
 * breathes on every shot hides the moments the punch is for.
 */
import type { GameEvent } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import type { CameraJuice } from './CameraJuice';

export const HITSTOP_AIR_LOST_MS = 40;
export const SHAKE_SPEED_THRESHOLD = 400;
const HITSTOP_BOUNCE_MS = 28;
const HITSTOP_BOUNCE_SPEED = 300;
const SHAKE_PX = 2;
const SHAKE_MS = 120;
const AIR_LOST_PUNCH = 0.02;
const AIR_LOST_PUNCH_MS = 100;
/** Below this a bounce is a nudge, and the view does not answer it. */
const KICK_MIN_SPEED = 70;

export class Juice {
  constructor(
    private readonly ctx: GameContext,
    private readonly camera: CameraJuice,
  ) {}

  onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'airLost':
        // Spending a pip on purpose is no blow, so it gets no freeze either (D1).
        if (e.reason === 'airLaunch') break;
        this.ctx.bus.emit('hitstop', HITSTOP_AIR_LOST_MS);
        this.camera.punch(AIR_LOST_PUNCH, AIR_LOST_PUNCH_MS);
        break;
      case 'launch':
        // Recoil: the view leans back against the shot, then follows her.
        this.camera.kick(-e.vel.x, -e.vel.y, 0.8 + 1.5 * e.power);
        break;
      case 'bounce':
        if (e.speed > KICK_MIN_SPEED) this.camera.kick(-e.contact.normal.x, -e.contact.normal.y, Math.min(2.6, 0.5 + e.speed / 200));
        if (e.speed > HITSTOP_BOUNCE_SPEED) this.ctx.bus.emit('hitstop', HITSTOP_BOUNCE_MS);
        if (e.speed > SHAKE_SPEED_THRESHOLD) this.camera.shake(SHAKE_PX, SHAKE_MS);
        break;
      case 'rest':
        // She stuck to the ledge above her: a small push upward, the feel of arriving.
        this.camera.kick(0, -1, 0.7);
        break;
      case 'boya':
        this.camera.punch(0.008, 260);
        break;
      default:
        break;
    }
  }
}
