/**
 * ADVERSARIAL tests for bubble/air.ts.
 *
 * `air.ts` is the single entry point for every pip Bur gains or loses, so it is also the single place
 * where the §11.7.12 capacity invariant can be broken for the whole game.
 */
import { describe, expect, it } from 'vitest';
import { vec } from '../math/vec';
import { createTuning } from '../tuning';
import { gainAir } from './air';
import { createBubble } from './bubbleStep';

const t = createTuning();
const AT = vec(90, 300);

describe('ADVERSARIAL — gainAir and the capacity invariant (§11.7.12)', () => {
  /**
   * §11.7.12 is an INVARIANT, not a happy path: "el Aire actual nunca supera ZONE_AIR_MAX[zone] +
   * mejoras". `gainAir` clamps with `Math.min(Math.max(0, amount), room)`, and both of those are NaN
   * when `amount` is NaN; the guard that follows is `if (gained <= 0) return []`, which is FALSE for
   * NaN, so the NaN falls through to `bubble.air += gained` and the whole air bar — HUD pips, the
   * `air <= 0` death test in `loseAir`, every later comparison — becomes NaN, permanently and silently.
   * An `airGained` event is emitted for it too.
   *
   * The amount comes from `Pickup.value`, i.e. from level data (§11.2), which is exactly the kind of
   * input the rest of `core` already hardens against: `charge.ts` guards `dragDist` with
   * `Number.isFinite`, `chargePower` with `!(chargeMs > 0)`. A non-finite pickup value must be
   * ignored like a zero one, not multiplied into the invariant.
   */
  it('ignores a non-finite amount instead of poisoning the air bar', () => {
    const bubble = createBubble(vec(90, 300), 0, t);
    bubble.air = 3;

    const events = gainAir(bubble, Number.NaN, 'pickup', AT);

    expect(events).toEqual([]);
    expect(bubble.air).toBe(3);
    expect(bubble.air).toBeLessThanOrEqual(bubble.airMax);
  });
});
