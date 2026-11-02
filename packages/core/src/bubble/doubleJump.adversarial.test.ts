/**
 * ADVERSARIAL review of the free double jump (DECISIONS-v1.2 D6, superseding the price in D1).
 *
 * Making it free removes a cost, and with it the only thing that stopped a stack of mid-air shots: these
 * tests hold the rule that has to survive, one launch per air phase, against the shipped tuning, and they
 * check that the price has really gone everywhere, including the last pip and the HUD's flag.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { NEUTRAL_ENV } from '../physics/forceFields';
import { createBubble, canAirLaunch, stepBubble } from './bubbleStep';
import { createMvpWorld } from '../game/testHarness';
import type { Bubble, Ceiling, GameEvent, PointerInput, RunState } from '../types';
import type { Vec2 } from '../math/vec';

const t = DEFAULT_TUNING;
const STEP_MS = t.FIXED_DT * 1000;
const UP: PointerInput = { down: false, x: 0, y: 0 };

function makeRun(): RunState {
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
  };
}

class Sim {
  readonly bubble: Bubble;
  readonly run = makeRun();
  readonly events: GameEvent[] = [];
  nowMs = 0;

  constructor(
    pos: Vec2,
    readonly solids: Ceiling[] = [],
  ) {
    this.bubble = createBubble(pos, 0, t);
  }

  step(pointer: PointerInput = UP): void {
    const result = stepBubble(
      this.bubble,
      this.run,
      { pointer, solids: this.solids, env: NEUTRAL_ENV, zone: 0, nowMs: this.nowMs, dt: t.FIXED_DT, currentChunkId: 'c' },
      t,
    );
    this.events.push(...result.events);
    this.nowMs += STEP_MS;
  }

  /** Press, hold a full pull for `ms` and let go. */
  shoot(ms = 160): void {
    const origin = { x: 90, y: 400 };
    this.step({ down: true, ...origin });
    for (let i = 0; i < Math.round(ms / STEP_MS); i++) this.step({ down: true, x: origin.x, y: origin.y - t.PULL_MAX_PX });
    this.step(UP);
    for (let i = 0; i < Math.round((t.LAUNCH_LOCK_MS + 100) / STEP_MS); i++) this.step(UP);
  }

  launches(): Extract<GameEvent, { type: 'launch' }>[] {
    return this.events.filter((e): e is Extract<GameEvent, { type: 'launch' }> => e.type === 'launch');
  }
}

describe('ADVERSARIAL — the double jump is free, and still only one (D6)', () => {
  it('ships at no cost', () => {
    expect(t.AIR_LAUNCH_COST).toBe(0);
    expect(t.AIR_LAUNCHES_MAX).toBe(1);
  });

  it('takes no Air and announces no loss', () => {
    const sim = new Sim({ x: 90, y: 200 });
    sim.bubble.air = 5;
    sim.shoot();
    expect(sim.launches()).toHaveLength(1);
    expect(sim.launches()[0]?.airLaunch).toBe(true);
    expect(sim.bubble.air).toBe(5);
    expect(sim.events.some((e) => e.type === 'airLost')).toBe(false);
  });

  it('is available on the last pip, because it can no longer cost it', () => {
    const sim = new Sim({ x: 90, y: 200 });
    sim.bubble.air = 1;
    expect(canAirLaunch(sim.bubble, t)).toBe(true);
    sim.shoot();
    expect(sim.launches()).toHaveLength(1);
    expect(sim.bubble.air).toBe(1);
    expect(sim.bubble.state).not.toBe('DEAD');
  });

  it('never fires for a Bur with no Air at all', () => {
    const sim = new Sim({ x: 90, y: 200 });
    sim.bubble.air = 0;
    expect(canAirLaunch(sim.bubble, t)).toBe(false);
  });

  it('keeps the one-per-air-phase rule: free must not mean flappy', () => {
    const sim = new Sim({ x: 90, y: 200 });
    sim.bubble.air = 8;
    for (let i = 0; i < 6; i++) sim.shoot();
    expect(sim.launches()).toHaveLength(t.AIR_LAUNCHES_MAX);
    expect(sim.bubble.airLaunchesUsed).toBe(t.AIR_LAUNCHES_MAX);
    expect(canAirLaunch(sim.bubble, t)).toBe(false);
    expect(sim.bubble.air).toBe(8);
  });

  it('only a rest gives it back', () => {
    const slab: Ceiling = {
      type: 'ceiling',
      id: 'slab',
      rect: { x: 40, y: 100, w: 100, h: 10 },
      kind: 'posadero',
      capturable: true,
      restitution: t.RESTITUTION_ROCK,
      material: 'rock',
    };
    const sim = new Sim({ x: 90, y: 180 }, [slab]);
    sim.shoot();
    expect(sim.bubble.airLaunchesUsed).toBe(1);
    for (let i = 0; i < 60 * 8 && sim.bubble.restingOnId === null; i++) sim.step();
    expect(sim.bubble.restingOnId).toBe('slab');
    expect(sim.bubble.airLaunchesUsed).toBe(0);
    expect(canAirLaunch(sim.bubble, t)).toBe(true);
  });

  it('reaches the HUD through the real world on the last pip', () => {
    const world = createMvpWorld();
    // Born under the raft and rising: airborne, so the flag is about the double jump and not the ledge.
    world.update(STEP_MS, UP);
    const snap = world.snapshot();
    expect(snap.bubble.state).not.toBe('RESTING');
    expect(snap.hud.airLaunchAvailable).toBe(true);
  });
});
