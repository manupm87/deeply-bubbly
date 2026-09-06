/**
 * §2.5 (air bags), §6.1 (pearls, shells) and §5 nº 15 (the big bag that reinflates for 12 s).
 * The capacity clamp is `air.ts`'s; what is asserted here is the mapping from pickup type to effect,
 * the "collected exactly once" contract the streamer depends on, and the DEAD exception.
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { createBubble } from '../bubble/bubbleStep';
import { createRunState } from '../run/runState';
import { pickupOverlaps, stepPickups } from './pickups';
import type { Tuning } from '../tuning';
import type { Pickup, PickupType } from '../types';

const T: Tuning = createTuning();

function at(pickupType: PickupType, value = 1, x = 90, y = 100): Pickup {
  return { type: 'pickup', id: `${pickupType}-${x}-${y}`, pos: { x, y }, pickupType, value, radius: 6 };
}

function scene(): { bubble: ReturnType<typeof createBubble>; run: ReturnType<typeof createRunState> } {
  return { bubble: createBubble({ x: 90, y: 100 }, 0, T), run: createRunState(7, 'expedicion') };
}

describe('pickupOverlaps', () => {
  it('is the sum of the two radii, not a box', () => {
    const { bubble } = scene(); // radius 7 in Z1, pickup radius 6 → reach 13
    expect(pickupOverlaps(bubble, at('perla', 1, 90, 112))).toBe(true);
    expect(pickupOverlaps(bubble, at('perla', 1, 90, 114))).toBe(false);
    // A corner at 13 px of distance still counts; the same offsets on both axes would not in a box.
    expect(pickupOverlaps(bubble, at('perla', 1, 99, 109))).toBe(true);
  });
});

describe('stepPickups', () => {
  it('an air bag gives a pip and reports itself consumed exactly once', () => {
    const { bubble, run } = scene();
    bubble.air = 3;
    const out = stepPickups(bubble, run, [at('aire')], 0, T);
    expect(bubble.air).toBe(4);
    expect(out.consumed).toEqual(['aire-90-100']);
    expect(out.events.filter((e) => e.type === 'pickup')).toHaveLength(1);
    expect(out.events.some((e) => e.type === 'airGained' && e.reason === 'pickup')).toBe(true);
  });

  it('the big bag also opens the 12 s reinflate window (§2.6, the Z3 verb)', () => {
    const { bubble, run } = scene();
    bubble.air = 3;
    stepPickups(bubble, run, [at('aireGrande')], 5000, T);
    expect(bubble.flags.reinflateUntil).toBe(5000 + T.REINFLATE_MS);
    expect(bubble.air).toBe(4);
  });

  it('pearls add their value and shells always add one (§6.1)', () => {
    const { bubble, run } = scene();
    stepPickups(bubble, run, [at('perla', 1), at('perlaGrande', 5), at('concha', 99)], 0, T);
    expect(run.pearls).toBe(6);
    expect(run.shells).toBe(1);
  });

  it('a corrupt value from level data never poisons the run', () => {
    const { bubble, run } = scene();
    bubble.air = 2;
    stepPickups(bubble, run, [at('perla', Number.NaN, 90, 100), at('aire', Number.NaN, 92, 100)], 0, T);
    expect(Number.isFinite(run.pearls)).toBe(true);
    expect(run.pearls).toBe(1);
    expect(bubble.air).toBe(3);
  });

  it('a full bar still collects the bag, but claims no pip it did not gain (§11.7.12)', () => {
    const { bubble, run } = scene();
    bubble.air = bubble.airMax;
    const out = stepPickups(bubble, run, [at('aire')], 0, T);
    expect(bubble.air).toBe(bubble.airMax);
    expect(out.consumed).toHaveLength(1);
    expect(out.events.some((e) => e.type === 'airGained')).toBe(false);
  });

  it('collects nothing while deflating (§2.4: DEAD is not a state that breathes in)', () => {
    const { bubble, run } = scene();
    bubble.state = 'DEAD';
    bubble.air = 0;
    const out = stepPickups(bubble, run, [at('aire'), at('perla', 3, 92, 100)], 0, T);
    expect(out.consumed).toHaveLength(0);
    expect(bubble.air).toBe(0);
    expect(run.pearls).toBe(0);
  });

  it('ignores pickups Bur is not touching', () => {
    const { bubble, run } = scene();
    const out = stepPickups(bubble, run, [at('aire', 1, 10, 10)], 0, T);
    expect(out.consumed).toHaveLength(0);
  });
});
