/**
 * Time and camera juice (GDD §7). Two effects, no more:
 *   - hitstop 40 ms on airLost (announced on the bus; GameScene owns the clock). The 90 ms of the pop
 *     is NOT emitted here: core already publishes it as a `hitstop` GameEvent (DEATH_HITSTOP_MS), and
 *     GameScene serves that event, so emitting it again would be the same number written twice;
 *   - screen shake ONLY on bounces faster than 400 px/s (2 px, 120 ms), never with "sin temblor".
 *
 * DELIBERATELY NOT IMPLEMENTED: §7's 1,02× zoom punch on Air loss and its 5 % zoom-out at full charge.
 * Both multiply the camera zoom by a fraction, and §8's revised scaling decision — "el zoom es
 * floor(anchoDispositivo / 180), siempre entero", written precisely against "muestreo no entero y
 * parpadeo en un juego cuyo argumento de legibilidad es el vecino más próximo" — outranks them. Air
 * loss keeps its own non-shaking channel (hitstop + the pips' soft red + the airLost blip), and full
 * charge already has three redundant channels (squash, ring, dotted arc); core's own `zoomPunch`
 * GameEvent is dropped for exactly the same reason.
 *
 * It never touches the camera: shake is announced on the bus and GameScene is the single writer of the
 * camera scroll and zoom, so this class cannot fight with the resize layout.
 */
import type { GameEvent } from '@deeply-bubbly/core';
import type { GameContext } from '../context';

export const HITSTOP_AIR_LOST_MS = 40;
export const SHAKE_SPEED_THRESHOLD = 400;
const SHAKE_PX = 2;
const SHAKE_MS = 120;

export class Juice {
  private readonly ctx: GameContext;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'airLost':
        // §7's hitstop is the DAMAGE beat. D1's double jump is a price the player chose to pay, not a
        // blow she took: freezing the frame as she leaves would punish the one shot D1 grants. The
        // spend has its own vocabulary — a cyan rising pip (`AirPips`), `Particles.airSpent`, and a
        // launch pop a fifth higher — and `air.ts` grants it no invulnerability and no stun either.
        if (e.reason !== 'airLaunch') this.ctx.bus.emit('hitstop', HITSTOP_AIR_LOST_MS); // never a shake (GDD §7)
        break;
      case 'bounce':
        if (e.speed > SHAKE_SPEED_THRESHOLD) this.shake();
        break;
      default:
        break;
    }
  }

  /** GameScene owns the shake clock and takes the max with core's own `camera.shakePx`. */
  private shake(): void {
    if (this.ctx.settings.noShake) return;
    this.ctx.bus.emit('shake', SHAKE_PX, SHAKE_MS);
  }
}
