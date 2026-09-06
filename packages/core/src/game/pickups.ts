/**
 * Collectables (GDD §2.5 air bags, §6.1 pearls and shells, §5 nº 15 the big air bag that reinflates).
 * Sensors, not bodies: a circle-circle overlap collects them and the streamer is told to forget them.
 *
 * Air goes through `gainAir` (`bubble/air.ts`), which owns the capacity clamp of §11.7.12 and the reset
 * of the Z5–Z6 pressure clock; the only thing decided here is which pickup means how much of what.
 */
import { gainAir } from '../bubble/air';
import type { Tuning } from '../tuning';
import type { Bubble, GameEvent, Pickup, RunState } from '../types';

export interface PickupStepResult {
  events: GameEvent[];
  /** Ids to hand to `WorldStreamer.consume` so they never come back (§11.5.10). */
  consumed: string[];
}

/** Sensor test: two circles. `Pickup.radius` is authored per type (§11.2). */
export function pickupOverlaps(bubble: Bubble, pickup: Pickup): boolean {
  const dx = bubble.pos.x - pickup.pos.x;
  const dy = bubble.pos.y - pickup.pos.y;
  const reach = bubble.radius + pickup.radius;
  return dx * dx + dy * dy <= reach * reach;
}

/** Authored `value`s reach us from level data; a NaN in one must not poison pearls or Air. */
function amount(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

/**
 * Collects every pickup Bur overlaps this step. DEAD collects nothing: §2.4's deflate is not a state in
 * which she can breathe in, and it would refill the bar the death flow is about to report as empty.
 */
export function stepPickups(
  bubble: Bubble,
  run: RunState,
  pickups: readonly Pickup[],
  nowMs: number,
  t: Tuning,
): PickupStepResult {
  const events: GameEvent[] = [];
  const consumed: string[] = [];
  if (bubble.state === 'DEAD') return { events, consumed };

  for (const pickup of pickups) {
    if (!pickupOverlaps(bubble, pickup)) continue;
    switch (pickup.pickupType) {
      case 'aireGrande':
        // §2.6, the Z3 verb: one size step for 12 s. It gives back radius, never capacity.
        bubble.flags.reinflateUntil = nowMs + t.REINFLATE_MS;
        events.push(...gainAir(bubble, amount(pickup.value, 1), 'pickup', bubble.pos));
        break;
      case 'aire':
        events.push(...gainAir(bubble, amount(pickup.value, 1), 'pickup', bubble.pos));
        break;
      case 'perla':
      case 'perlaGrande':
        run.pearls += amount(pickup.value, 1);
        break;
      case 'concha':
        // §2.5: three shells per immersion, each worth one. `value` is not a multiplier here.
        run.shells += 1;
        break;
    }
    consumed.push(pickup.id);
    events.push({ type: 'pickup', pickup });
  }
  return { events, consumed };
}
