import { describe, expect, it } from 'vitest';
import { vec } from '../math/vec';
import { createTuning } from '../tuning';
import { gainAir, loseAir, resetBounceChain, zoneAirMax } from './air';
import { createBubble } from './bubbleStep';
import type { AirLossReason, Bubble, GameEvent, RunState } from '../types';

const t = createTuning();
const AT = vec(90, 300);

function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    seed: 1,
    mode: 'expedicion',
    immersionIndex: 0,
    lastBoyaId: null,
    lastStationIndex: -1,
    maxProgressY: 0,
    pearls: 0,
    shells: 0,
    failCountThisImmersion: 0,
    mercyLevel: 0,
    shieldAvailable: false,
    elapsedMs: 0,
    ...overrides,
  };
}

function makeBubble(overrides: Partial<Bubble> = {}): Bubble {
  return { ...createBubble(vec(90, 300), 0, t), ...overrides };
}

const typesOf = (events: readonly GameEvent[]): string[] => events.map((e) => e.type);

describe('loseAir — the single entry point (§2.4)', () => {
  it('takes exactly one pip and reports the new value', () => {
    const bubble = makeBubble({ air: 5 });
    const change = loseAir(bubble, makeRun(), 'hit', AT, 1000, t);
    expect(bubble.air).toBe(4);
    expect(change.died).toBe(false);
    expect(change.events).toEqual([{ type: 'airLost', reason: 'hit', air: 4, at: { x: 90, y: 300 } }]);
  });

  it('copies `at` so a later mutation of the caller position cannot rewrite history', () => {
    const bubble = makeBubble({ air: 5 });
    const change = loseAir(bubble, makeRun(), 'pressure', bubble.pos, 0, t);
    bubble.pos.x = -999;
    const [event] = change.events;
    expect(event?.type === 'airLost' ? event.at.x : null).toBe(90);
  });

  it('sets invulnerability and stun for hazard reasons only', () => {
    for (const reason of ['hit', 'trap'] as const) {
      const bubble = makeBubble({ air: 5 });
      loseAir(bubble, makeRun(), reason, AT, 1000, t);
      expect(bubble.flags.invulnUntil).toBe(1000 + t.INVULN_MS);
      expect(bubble.flags.stunUntil).toBe(1000 + t.STUN_MS);
    }
    for (const reason of ['airLaunch', 'pressure', 'resaca'] as AirLossReason[]) {
      const bubble = makeBubble({ air: 5 });
      loseAir(bubble, makeRun(), reason, AT, 1000, t);
      expect(bubble.flags.invulnUntil).toBe(0);
      expect(bubble.flags.stunUntil).toBe(0);
    }
  });

  it('ignores hit/trap while invulnerable but never ignores the other three reasons', () => {
    const bubble = makeBubble({ air: 5 });
    bubble.flags.invulnUntil = 2000;
    expect(loseAir(bubble, makeRun(), 'hit', AT, 1500, t).events).toEqual([]);
    expect(loseAir(bubble, makeRun(), 'trap', AT, 1500, t).events).toEqual([]);
    expect(bubble.air).toBe(5);

    loseAir(bubble, makeRun(), 'pressure', AT, 1500, t);
    loseAir(bubble, makeRun(), 'resaca', AT, 1500, t);
    loseAir(bubble, makeRun(), 'airLaunch', AT, 1500, t);
    expect(bubble.air).toBe(2);
  });

  it('lets the hit through again the instant invulnerability expires', () => {
    const bubble = makeBubble({ air: 5 });
    bubble.flags.invulnUntil = 2000;
    loseAir(bubble, makeRun(), 'hit', AT, 2000, t);
    expect(bubble.air).toBe(4);
  });

  it('reports died and never takes air below zero', () => {
    const bubble = makeBubble({ air: 1 });
    const change = loseAir(bubble, makeRun(), 'hit', AT, 0, t);
    expect(change.died).toBe(true);
    expect(bubble.air).toBe(0);

    // A dead Bur cannot lose air again: §11.7.6 has exactly one route out of DEAD, and it is external.
    const after = loseAir(bubble, makeRun(), 'hit', AT, 5000, t);
    expect(after.events).toEqual([]);
    expect(after.died).toBe(false);
    expect(bubble.air).toBe(0);
  });
});

describe('loseAir — shell shield (§2.5)', () => {
  it('absorbs the first hit of the zone, spends itself and grants invulnerability', () => {
    const bubble = makeBubble({ air: 4 });
    const run = makeRun({ shieldAvailable: true });
    const change = loseAir(bubble, run, 'hit', AT, 1000, t);

    expect(bubble.air).toBe(4);
    expect(change.died).toBe(false);
    expect(typesOf(change.events)).toEqual(['shieldUsed']);
    expect(run.shieldAvailable).toBe(false);
    expect(bubble.flags.invulnUntil).toBe(1000 + t.INVULN_MS);
    // Absorbed, not suffered: no stun.
    expect(bubble.flags.stunUntil).toBe(0);

    // Second hit, once the window is over, costs a pip.
    const second = loseAir(bubble, run, 'hit', AT, 1000 + t.INVULN_MS, t);
    expect(bubble.air).toBe(3);
    expect(typesOf(second.events)).toEqual(['airLost']);
  });

  it('does not absorb the anemone vent: the shield is for hits (§2.4.5)', () => {
    const bubble = makeBubble({ air: 4 });
    const run = makeRun({ shieldAvailable: true });
    loseAir(bubble, run, 'trap', AT, 0, t);
    expect(bubble.air).toBe(3);
    expect(run.shieldAvailable).toBe(true);
  });
});

describe('loseAir — the air-launch price and its floor (D1)', () => {
  it('costs exactly AIR_LAUNCH_COST pips and says so', () => {
    const bubble = makeBubble({ air: 5 });
    const change = loseAir(bubble, makeRun(), 'airLaunch', AT, 0, t);
    expect(bubble.air).toBe(5 - t.AIR_LAUNCH_COST);
    expect(change.events).toEqual([{ type: 'airLost', reason: 'airLaunch', air: bubble.air, at: AT }]);
    expect(change.died).toBe(false);
  });

  it('never takes the last pip: "nunca está disponible con el último pip"', () => {
    const bubble = makeBubble({ air: t.AIR_LAUNCH_COST });
    const change = loseAir(bubble, makeRun(), 'airLaunch', AT, 0, t);
    expect(bubble.air).toBe(t.AIR_LAUNCH_COST);
    expect(change.events).toEqual([]);
    expect(change.died).toBe(false);
  });

  it('is a price, not a blow: no invulnerability and no stun', () => {
    const bubble = makeBubble({ air: 5 });
    loseAir(bubble, makeRun(), 'airLaunch', AT, 1000, t);
    expect(bubble.flags.invulnUntil).toBe(0);
    expect(bubble.flags.stunUntil).toBe(0);
  });

  it('is never absorbed by the shell shield: the shield is for hits (§2.5)', () => {
    const bubble = makeBubble({ air: 5 });
    const run = makeRun({ shieldAvailable: true });
    loseAir(bubble, run, 'airLaunch', AT, 0, t);
    expect(bubble.air).toBe(5 - t.AIR_LAUNCH_COST);
    expect(run.shieldAvailable).toBe(true);
  });

  it('a free double jump (cost 0) takes nothing and announces nothing', () => {
    const free = createTuning({ AIR_LAUNCH_COST: 0 });
    const bubble = makeBubble({ air: 5 });
    const change = loseAir(bubble, makeRun(), 'airLaunch', AT, 0, free);
    expect(bubble.air).toBe(5);
    expect(change.events).toEqual([]);
  });

  it('breaks the bounce chain only when a hazard connects', () => {
    const bubble = makeBubble({ air: 6, bounceChain: 3, bounceChainBodies: ['a', 'b', 'c'] });
    loseAir(bubble, makeRun(), 'airLaunch', AT, 0, t);
    expect(bubble.bounceChain).toBe(3);

    loseAir(bubble, makeRun(), 'hit', AT, 0, t);
    expect(bubble.bounceChain).toBe(0);
    expect(bubble.bounceChainBodies).toEqual([]);
  });

  it('breaks the bounce chain even when the shield eats the hit', () => {
    const bubble = makeBubble({ air: 6, bounceChain: 4, bounceChainBodies: ['a', 'b', 'c', 'd'] });
    loseAir(bubble, makeRun({ shieldAvailable: true }), 'hit', AT, 0, t);
    expect(bubble.bounceChain).toBe(0);
  });
});

describe('gainAir (§2.5, §11.7.12)', () => {
  it('adds air and reports the new total', () => {
    const bubble = makeBubble({ air: 3, airMax: 8 });
    const events = gainAir(bubble, 1, 'pickup', AT);
    expect(bubble.air).toBe(4);
    expect(events).toEqual([{ type: 'airGained', reason: 'pickup', air: 4, at: { x: 90, y: 300 } }]);
  });

  it('clamps to airMax and never invents a pip', () => {
    const bubble = makeBubble({ air: 7, airMax: 8 });
    gainAir(bubble, 5, 'station', AT);
    expect(bubble.air).toBe(8);

    const events = gainAir(bubble, 3, 'pickup', AT);
    expect(bubble.air).toBe(8);
    expect(events).toEqual([]);
  });

  it('ignores zero and negative amounts', () => {
    const bubble = makeBubble({ air: 3 });
    expect(gainAir(bubble, 0, 'pickup', AT)).toEqual([]);
    expect(gainAir(bubble, -4, 'pickup', AT)).toEqual([]);
    expect(bubble.air).toBe(3);
  });

  it('restarts the pressure clock for air bags and stations only (§2.4.4)', () => {
    const bubble = makeBubble({ air: 2, pressureDrainMs: 20_000 });
    gainAir(bubble, 1, 'bounceChain', AT);
    expect(bubble.pressureDrainMs).toBe(20_000);

    gainAir(bubble, 1, 'pickup', AT);
    expect(bubble.pressureDrainMs).toBe(0);
  });
});

describe('zoneAirMax (§2.6, §11.7.12)', () => {
  it('follows the zone table', () => {
    for (let zone = 0; zone < t.ZONE_AIR_MAX.length; zone++) {
      expect(zoneAirMax(zone, 0, t)).toBe(t.ZONE_AIR_MAX[zone]);
    }
  });

  it('adds upgrades on top of the ZONE maximum, not on top of the base one (§2.6)', () => {
    expect(zoneAirMax(5, 3, t)).toBe((t.ZONE_AIR_MAX[5] ?? 0) + 3);
    expect(zoneAirMax(5, 3, t)).toBeLessThan(t.AIR_MAX_BASE + 3);
  });

  it('clamps out-of-range zones and negative upgrades instead of returning NaN', () => {
    expect(zoneAirMax(-2, 0, t)).toBe(t.ZONE_AIR_MAX[0]);
    expect(zoneAirMax(99, 0, t)).toBe(t.ZONE_AIR_MAX[t.ZONE_AIR_MAX.length - 1]);
    expect(zoneAirMax(0, -5, t)).toBe(t.ZONE_AIR_MAX[0]);
  });
});

describe('resetBounceChain', () => {
  it('clears both halves of the chain state', () => {
    const bubble = makeBubble({ bounceChain: 4, bounceChainBodies: ['a', 'b', 'c', 'd'] });
    resetBounceChain(bubble);
    expect(bubble.bounceChain).toBe(0);
    expect(bubble.bounceChainBodies).toEqual([]);
  });
});

describe('gainAir — hardening the capacity invariant (§11.7.12)', () => {
  /**
   * The amount comes from `Pickup.value`, i.e. from level data (§11.2). A NaN survives every `<=`
   * comparison, so without a positive test it would land in `bubble.air` and make §11.7.12 (`air <=
   * airMax`), the HUD pip count and `loseAir`'s `air <= 0` death test meaningless for the whole run.
   */
  it('ignores a non-finite amount instead of poisoning the bar', () => {
    const bubble = makeBubble({ air: 3, airMax: 8 });
    expect(gainAir(bubble, Number.NaN, 'pickup', AT)).toEqual([]);
    expect(bubble.air).toBe(3);

    expect(gainAir(bubble, Number.NEGATIVE_INFINITY, 'pickup', AT)).toEqual([]);
    expect(bubble.air).toBe(3);
    expect(bubble.air).toBeLessThanOrEqual(bubble.airMax);
  });

  /** +Infinity is not a bug, it is "fill her up": the room left is the clamp (§2.5, stations). */
  it('still recharges to capacity for +Infinity', () => {
    const bubble = makeBubble({ air: 3, airMax: 8 });
    expect(gainAir(bubble, Number.POSITIVE_INFINITY, 'station', AT)).toHaveLength(1);
    expect(bubble.air).toBe(8);
  });
});
