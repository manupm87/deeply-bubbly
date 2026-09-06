/**
 * §2.4.1 (hit → −1 Air + pushback), §2.4.5 (the anemone trap) and the periodic duty cycle of §11.2.
 * The Air rules themselves belong to `bubble/air.ts` and are tested there; what is asserted here is
 * what GameWorld adds on top: geometry, direction and the trap clock.
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { createBubble } from '../bubble/bubbleStep';
import { createRunState } from '../run/runState';
import { solidRectAt } from '../physics/collision';
import {
  TRAP_ESCAPE_POWER,
  applyPushback,
  createTrapState,
  escapeTrap,
  hazardActiveAt,
  hazardOverlaps,
  hazardRectAt,
  stepHazards,
} from './hazards';
import type { Tuning } from '../tuning';
import type { Bubble, Ceiling, Hazard, RunState } from '../types';

const T: Tuning = createTuning();

function world(): { bubble: Bubble; run: RunState } {
  const bubble = createBubble({ x: 90, y: 100 }, 0, T);
  const run = createRunState(1, 'expedicion');
  run.shieldAvailable = false; // the shield has its own test; it must not absorb every other one
  return { bubble, run };
}

function hazard(over: Partial<Hazard> = {}): Hazard {
  return {
    type: 'hazard',
    id: 'hz-1',
    catalogId: 6,
    shape: { x: 80, y: 90, w: 20, h: 20 },
    airCost: 1,
    pushDir: 'lateral',
    ...over,
  };
}

describe('hazardActiveAt (§11.2 duty cycle)', () => {
  it('is always dangerous without a period', () => {
    expect(hazardActiveAt(hazard(), 0)).toBe(true);
    expect(hazardActiveAt(hazard(), 123_456)).toBe(true);
  });

  it('is dangerous only inside activeFraction of the cycle', () => {
    const h = hazard({ periodMs: 2000, activeFraction: 0.25, phaseMs: 0 });
    expect(hazardActiveAt(h, 0)).toBe(true);
    expect(hazardActiveAt(h, 499)).toBe(true);
    expect(hazardActiveAt(h, 500)).toBe(false);
    expect(hazardActiveAt(h, 1999)).toBe(false);
    expect(hazardActiveAt(h, 2000)).toBe(true); // next cycle
  });

  it('shifts the window by phaseMs, negative phases included', () => {
    const h = hazard({ periodMs: 1000, activeFraction: 0.5, phaseMs: 500 });
    expect(hazardActiveAt(h, 0)).toBe(false);
    expect(hazardActiveAt(h, 500)).toBe(true);
    const back = hazard({ periodMs: 1000, activeFraction: 0.5, phaseMs: -250 });
    expect(hazardActiveAt(back, 0)).toBe(false);
    expect(hazardActiveAt(back, 300)).toBe(true);
  });

  it('an activeFraction of 0 is never dangerous', () => {
    expect(hazardActiveAt(hazard({ periodMs: 1000, activeFraction: 0 }), 0)).toBe(false);
  });
});

describe('hazardRectAt', () => {
  it('oscillates exactly like a moving solid (§11.2: one triangle wave, not two)', () => {
    const moving = { axis: 'x', speed: 25, range: 60, phase: 0.2 } as const;
    const h = hazard({ moving });
    const ceiling: Ceiling = {
      type: 'ceiling',
      id: 'c',
      rect: { ...h.shape },
      kind: 'posadero',
      capturable: true,
      restitution: 0.5,
      material: 'rock',
      moving,
    };
    for (const timeMs of [0, 137, 1000, 4321, 9999]) {
      expect(hazardRectAt(h, timeMs)).toEqual(solidRectAt(ceiling, timeMs));
    }
  });
});

describe('contact (§2.4.1)', () => {
  it('costs one pip, opens the invulnerability window and pushes Bur away', () => {
    const { bubble, run } = world();
    const out = stepHazards(bubble, run, createTrapState(), { hazards: [hazard()], nowMs: 0 }, T);
    expect(out.hitId).toBe('hz-1');
    expect(bubble.air).toBe(T.AIR_START - 1);
    expect(bubble.flags.invulnUntil).toBe(T.INVULN_MS);
    expect(bubble.flags.stunUntil).toBe(T.STUN_MS);
    expect(out.events.some((e) => e.type === 'airLost')).toBe(true);
  });

  it('charges at most one pip per step even with three hazards on top of Bur', () => {
    const { bubble, run } = world();
    const three = [hazard({ id: 'a' }), hazard({ id: 'b' }), hazard({ id: 'c' })];
    const out = stepHazards(bubble, run, createTrapState(), { hazards: three, nowMs: 0 }, T);
    expect(bubble.air).toBe(T.AIR_START - 1);
    expect(out.events.filter((e) => e.type === 'airLost')).toHaveLength(1);
  });

  it('does nothing while invulnerable', () => {
    const { bubble, run } = world();
    bubble.flags.invulnUntil = 1000;
    bubble.vel = { x: 5, y: 5 };
    const out = stepHazards(bubble, run, createTrapState(), { hazards: [hazard()], nowMs: 0 }, T);
    expect(out.hitId).toBeNull();
    expect(bubble.air).toBe(T.AIR_START);
    expect(bubble.vel).toEqual({ x: 5, y: 5 });
  });

  it('the shell shield absorbs the first hit of the zone but the push still lands (§2.5)', () => {
    const { bubble, run } = world();
    run.shieldAvailable = true;
    const out = stepHazards(bubble, run, createTrapState(), { hazards: [hazard()], nowMs: 0 }, T);
    expect(bubble.air).toBe(T.AIR_START);
    expect(run.shieldAvailable).toBe(false);
    expect(out.events.some((e) => e.type === 'shieldUsed')).toBe(true);
    expect(bubble.vel.x).not.toBe(0);
  });

  it('displaces a resting Bur, or the ledge would eat the pushback (§2.4.1)', () => {
    const { bubble, run } = world();
    bubble.state = 'RESTING';
    bubble.restingOnId = 'ledge';
    const out = stepHazards(bubble, run, createTrapState(), { hazards: [hazard()], nowMs: 0 }, T);
    expect(bubble.restingOnId).toBeNull();
    expect(bubble.state).toBe('IDLE');
    expect(out.events.some((e) => e.type === 'restRelease' && e.reason === 'displaced')).toBe(true);
  });

  it('empties the bar into the death flow when it was the last pip', () => {
    const { bubble, run } = world();
    bubble.air = 1;
    const out = stepHazards(bubble, run, createTrapState(), { hazards: [hazard()], nowMs: 0 }, T);
    expect(out.died).toBe(true);
    expect(bubble.state).toBe('DEAD');
    expect(out.events.some((e) => e.type === 'deflate')).toBe(true);
  });
});

describe('pushback direction (§2.4.1, §5 direction rule)', () => {
  it('lateral pushes away from the hazard centre, on the horizontal only', () => {
    const { bubble } = world();
    bubble.vel = { x: 0, y: 33 };
    applyPushback(bubble, { x: 80, y: 90, w: 20, h: 20 }, hazard(), T); // centre x = 90, Bur at 90
    expect(bubble.vel).toEqual({ x: T.HIT_PUSHBACK, y: 33 });

    bubble.pos.x = 70;
    applyPushback(bubble, { x: 80, y: 90, w: 20, h: 20 }, hazard(), T);
    expect(bubble.vel.x).toBe(-T.HIT_PUSHBACK);
  });

  it('down and up assign the vertical component, and pushImpulse overrides the default', () => {
    const { bubble } = world();
    bubble.vel = { x: 7, y: 0 };
    applyPushback(bubble, { x: 80, y: 90, w: 20, h: 20 }, hazard({ pushDir: 'down' }), T);
    expect(bubble.vel).toEqual({ x: 7, y: T.HIT_PUSHBACK });

    applyPushback(bubble, { x: 80, y: 90, w: 20, h: 20 }, hazard({ pushDir: 'up', pushImpulse: 500 }), T);
    expect(bubble.vel).toEqual({ x: 7, y: -500 });
  });
});

describe('the anemone (§2.4.5, §5 nº 7)', () => {
  const anemone = hazard({ id: 'anemone', catalogId: 7, trap: true, pushDir: 'down' });

  it('pins Bur for TRAP_HOLD_MS and vents one pip at TRAP_VENT_MS', () => {
    const { bubble, run } = world();
    const trap = createTrapState();
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 0 }, T);
    expect(trap.hazardId).toBe('anemone');
    expect(bubble.flags.trapVentAt).toBe(T.TRAP_VENT_MS);

    // Pinned: buoyancy displaced her between steps and the trap puts her back.
    bubble.pos = { x: 95, y: 95 };
    bubble.vel = { x: 10, y: -20 };
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 100 }, T);
    expect(bubble.pos).toEqual({ x: 90, y: 100 });
    expect(bubble.vel).toEqual({ x: 0, y: 0 });

    // Past the hold she may ACT again (GameWorld stops suppressing the pointer), but the anemone is
    // still holding her and the vent clock is still running: §2.4.5's only exit is the 60 % charge.
    const free = stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: T.TRAP_HOLD_MS }, T);
    expect(free.events).toHaveLength(0);
    expect(bubble.air).toBe(T.AIR_START);
    expect(trap.hazardId).toBe('anemone');

    const vent = stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: T.TRAP_VENT_MS }, T);
    expect(vent.events.some((e) => e.type === 'airLost' && e.reason === 'trap')).toBe(true);
    expect(bubble.air).toBe(T.AIR_START - 1);
    expect(trap.hazardId).toBeNull();
  });

  it('does not re-arm on the pip it just took, however long Bur stays inside it', () => {
    const { bubble, run } = world();
    const trap = createTrapState();
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 0 }, T);
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: T.TRAP_VENT_MS }, T);
    for (let ms = T.TRAP_VENT_MS; ms < T.TRAP_VENT_MS * 4; ms += 100) {
      stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: ms }, T);
    }
    expect(bubble.air).toBe(T.AIR_START - 1);
    expect(trap.hazardId).toBeNull();

    // Out of the anemone and back in: it is a new capture.
    bubble.pos = { x: 10, y: 10 };
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 9000 }, T);
    expect(trap.escapedFrom).toBeNull();
    bubble.pos = { x: 90, y: 100 };
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 9100 }, T);
    expect(trap.hazardId).toBe('anemone');
  });

  it('a launch of 60 % or more is the escape, and it holds while she is still inside', () => {
    const { bubble, run } = world();
    const trap = createTrapState();
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 0 }, T);
    expect(TRAP_ESCAPE_POWER).toBe(0.6);

    escapeTrap(bubble, trap);
    expect(trap.hazardId).toBeNull();
    expect(bubble.flags.trapVentAt).toBe(0);

    bubble.vel = { x: 0, y: 300 };
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 100 }, T);
    expect(trap.hazardId).toBeNull();
    expect(bubble.vel).toEqual({ x: 0, y: 300 }); // never re-pinned on the way out
    expect(bubble.air).toBe(T.AIR_START); // and never vented
  });

  it('costs no contact pip: the vent IS the anemone (§2.4.5)', () => {
    const { bubble, run } = world();
    stepHazards(bubble, run, createTrapState(), { hazards: [anemone], nowMs: 0 }, T);
    expect(bubble.air).toBe(T.AIR_START);
  });

  it('lets go by itself the moment Bur is out of it', () => {
    const { bubble, run } = world();
    const trap = createTrapState();
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 0 }, T);
    bubble.pos = { x: 10, y: 10 };
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 200 }, T);
    expect(trap.hazardId).toBeNull();
    expect(bubble.flags.trapVentAt).toBe(0);
  });

  it('an inactive hazard is not a hazard (duty cycle + geometry agree)', () => {
    const { bubble, run } = world();
    const blinking = hazard({ periodMs: 1000, activeFraction: 0.5 });
    expect(hazardOverlaps(bubble, blinking, 600)).toBe(false);
    const out = stepHazards(bubble, run, createTrapState(), { hazards: [blinking], nowMs: 600 }, T);
    expect(out.hitId).toBeNull();
    expect(bubble.air).toBe(T.AIR_START);
  });
});

describe('the anemone holds until she pays (§2.4.5, §5 nº 7)', () => {
  const anemone = hazard({ id: 'anemone', catalogId: 7, trap: true, pushDir: 'down' });

  it('keeps pinning her between TRAP_HOLD_MS and TRAP_VENT_MS, so she cannot float out for free', () => {
    const { bubble, run } = world();
    const trap = createTrapState();
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 0 }, T);

    // Buoyancy lifts her ~21 px in the 700 ms between the two stamps: more than the hazard is tall.
    for (let ms = T.TRAP_HOLD_MS; ms < T.TRAP_VENT_MS; ms += 100) {
      bubble.pos = { x: bubble.pos.x, y: bubble.pos.y - 3 };
      bubble.vel = { x: 0, y: -60 };
      stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: ms }, T);
      expect(bubble.pos).toEqual({ x: 90, y: 100 });
      expect(bubble.vel).toEqual({ x: 0, y: 0 });
      expect(trap.hazardId).toBe('anemone');
    }
    expect(bubble.air).toBe(T.AIR_START);

    // ...and the pip lands, because she never paid the charge.
    const vent = stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: T.TRAP_VENT_MS }, T);
    expect(vent.events.some((e) => e.type === 'airLost' && e.reason === 'trap')).toBe(true);
    expect(trap.hazardId).toBeNull();
  });

  it('lets the 60 % launch out even after the hold window (the escape is the charge, not the clock)', () => {
    const { bubble, run } = world();
    const trap = createTrapState();
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: 0 }, T);

    escapeTrap(bubble, trap); // what GameWorld does on a `launch` event of power >= 0.6
    bubble.vel = { x: 0, y: 420 };
    stepHazards(bubble, run, trap, { hazards: [anemone], nowMs: T.TRAP_HOLD_MS + 200 }, T);
    expect(bubble.vel).toEqual({ x: 0, y: 420 });
    expect(bubble.air).toBe(T.AIR_START);
  });
});
