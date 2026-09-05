import { describe, expect, it } from 'vitest';
import { vec } from '../math/vec';
import { SeededRNG } from '../ports';
import { createTuning } from '../tuning';
import { chargePower, impulseMagnitude } from '../control/charge';
import { createNeutralEnv, NEUTRAL_ENV } from '../physics/forceFields';
import { solidRectAt } from '../physics/collision';
import { applyAirLoss, createBubble, radiusForZone, stepBubble } from './bubbleStep';
import type { BubbleStepResult } from './bubbleStep';
import type { Vec2 } from '../math/vec';
import type { ReadonlyPhysicsEnv } from '../physics/forceFields';
import type { Bubble, Ceiling, GameEvent, PointerInput, RunState, SolidEntity, Wall, ZoneIndex } from '../types';

const t = createTuning();
const STEP_MS = t.FIXED_DT * 1000;
const POINTER_UP: PointerInput = { down: false, x: 0, y: 0 };

// ---------------------------------------------------------------------------------------------
// Harness: a tiny world (one ceiling slab and/or walls) stepped at the fixed rate
// ---------------------------------------------------------------------------------------------

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

function ceiling(id: string, rect: { x: number; y: number; w: number; h: number }, overrides: Partial<Ceiling> = {}): Ceiling {
  return {
    type: 'ceiling',
    id,
    rect,
    kind: 'posadero',
    capturable: true,
    restitution: t.RESTITUTION_ROCK,
    material: 'rock',
    ...overrides,
  };
}

function wall(id: string, rect: { x: number; y: number; w: number; h: number }): Wall {
  return { type: 'wall', id, rect, restitution: t.RESTITUTION_ROCK, material: 'rock' };
}

/** Deterministic driver: one fixed step per call, simulation time advanced by the harness only. */
class Sim {
  readonly bubble: Bubble;
  readonly run: RunState;
  solids: SolidEntity[];
  readonly events: GameEvent[] = [];
  nowMs = 0;
  zone: ZoneIndex = 0;
  chunkId = 'chunk-a';
  env: ReadonlyPhysicsEnv = NEUTRAL_ENV;

  constructor(pos: Vec2, solids: SolidEntity[] = [], zone: ZoneIndex = 0) {
    this.bubble = createBubble(pos, zone, t);
    this.run = makeRun();
    this.solids = solids;
    this.zone = zone;
  }

  step(pointer: PointerInput = POINTER_UP): BubbleStepResult {
    const result = stepBubble(
      this.bubble,
      this.run,
      {
        pointer,
        solids: this.solids,
        env: this.env,
        zone: this.zone,
        nowMs: this.nowMs,
        dt: t.FIXED_DT,
        currentChunkId: this.chunkId,
      },
      t,
    );
    this.events.push(...result.events);
    this.nowMs += STEP_MS;
    return result;
  }

  /** Runs `ms` worth of whole fixed steps with a constant pointer sample. */
  run_(ms: number, pointer: PointerInput = POINTER_UP): void {
    const steps = Math.round(ms / STEP_MS);
    for (let i = 0; i < steps; i++) this.step(pointer);
  }

  of<K extends GameEvent['type']>(type: K): Extract<GameEvent, { type: K }>[] {
    return this.events.filter((e): e is Extract<GameEvent, { type: K }> => e.type === type);
  }

  clearEvents(): void {
    this.events.length = 0;
  }
}

/** A still finger `dy` px below (and `dx` px beside) the point where the charge was started. */
function fingerAt(origin: Vec2, dx = 0, dy = t.DRAG_NEUTRAL_PX): PointerInput {
  return { down: true, x: origin.x + dx, y: origin.y + dy };
}

const speed = (v: Vec2): number => Math.hypot(v.x, v.y);

/**
 * Speed of the last `launch` event. The event carries the velocity as ASSIGNED (§2.2); `bubble.vel`
 * read after the same step has already been through one integration (buoyancy + damping), which is
 * about 1.4 % lower and would make every impulse assertion approximate for no reason.
 */
function lastLaunchSpeed(sim: Sim): number {
  const events = sim.of('launch');
  const last = events[events.length - 1];
  if (last === undefined) throw new Error('no launch event');
  return speed(last.vel);
}

/** Impulse of a neutral-drag hold at full power in zone 0 — the §2.2 table value (430 px/s). */
const FULL_IMPULSE = impulseMagnitude(
  { power: 1, dragDist: t.DRAG_NEUTRAL_PX, radius: t.RADIUS_BASE, stunned: false, externalMul: 1 },
  t,
);

// ---------------------------------------------------------------------------------------------
// The gesture (§2.1, §11.7.3)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — the gesture (§2.1)', () => {
  it('freezes aimOrigin at the press and emits chargeStart', () => {
    const sim = new Sim(vec(90, 200));
    const origin = { ...sim.bubble.pos };
    sim.step(fingerAt(origin));

    expect(sim.bubble.state).toBe('CHARGING');
    expect(sim.bubble.aimOrigin).toEqual(origin);
    expect(sim.bubble.chargeMs).toBeCloseTo(STEP_MS, 9);
    expect(sim.of('chargeStart')).toHaveLength(1);
  });

  it('§11.7.3: a 60 ms tap produces no impulse and no state change', () => {
    const sim = new Sim(vec(90, 200));
    const origin = { ...sim.bubble.pos };
    sim.run_(60, fingerAt(origin));
    expect(sim.bubble.chargeMs).toBeLessThan(t.MIN_TAP_MS);

    sim.step(POINTER_UP);
    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.bubble.chargeMs).toBe(0);
    // Only buoyancy has acted: nowhere near IMPULSE_MIN.
    expect(speed(sim.bubble.vel)).toBeLessThan(10);
  });

  it('§11.7.3: a tap that short from RESTING leaves Bur resting', () => {
    const sim = restingSim();
    const origin = { ...sim.bubble.pos };
    sim.run_(60, fingerAt(origin));
    sim.step(POINTER_UP);

    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.bubble.restingOnId).toBe('ceil');
    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.of('restRelease')).toHaveLength(0);
  });

  it('measures the aim from the FROZEN origin: a still finger is a still shot while Bur drifts', () => {
    const sim = new Sim(vec(90, 200));
    const origin = { ...sim.bubble.pos };
    const finger = fingerAt(origin, 20);

    sim.step(finger);
    const theta = sim.bubble.aimTheta;
    expect(theta).toBeGreaterThan(0);

    for (let i = 0; i < 20; i++) {
      sim.step(finger);
      expect(sim.bubble.aimTheta).toBe(theta);
      expect(sim.bubble.dragDist).toBeCloseTo(Math.hypot(20, t.DRAG_NEUTRAL_PX), 9);
    }
    // The test is only meaningful because Bur moved: buoyancy lifted her while she charged.
    expect(sim.bubble.pos.y).toBeLessThan(origin.y - 0.5);
  });

  it('launches by ASSIGNMENT: two full charges in a row give one impulse, never their sum (§2.2)', () => {
    const sim = new Sim(vec(90, 200));
    const firstOrigin = { ...sim.bubble.pos };
    sim.run_(t.CHARGE_FULL_MS, fingerAt(firstOrigin));
    sim.step(POINTER_UP);

    const first = lastLaunchSpeed(sim);
    expect(first).toBeCloseTo(FULL_IMPULSE, 9);
    expect(sim.bubble.state).toBe('LAUNCHED');

    // Wait out the launch lock, then charge again in mid-air and release.
    sim.run_(400);
    const secondOrigin = { ...sim.bubble.pos };
    sim.run_(t.CHARGE_FULL_MS, fingerAt(secondOrigin));
    sim.step(POINTER_UP);

    expect(lastLaunchSpeed(sim)).toBeCloseTo(FULL_IMPULSE, 9);
    expect(lastLaunchSpeed(sim)).toBeLessThan(first * 1.5);
    expect(sim.of('launch')).toHaveLength(2);
  });

  it('reports power and the assigned velocity in the launch event', () => {
    const sim = new Sim(vec(90, 200));
    const origin = { ...sim.bubble.pos };
    sim.run_(t.CHARGE_FULL_MS, fingerAt(origin, 20));
    sim.step(POINTER_UP);

    const [launch] = sim.of('launch');
    expect(launch?.power).toBe(1);
    // Dragging 20 px sideways also moves the ±15 % fine tune, so the expected magnitude is the
    // §11.4 formula for THIS drag distance, not the neutral one.
    const expected = impulseMagnitude(
      { power: 1, dragDist: Math.hypot(20, t.DRAG_NEUTRAL_PX), radius: t.RADIUS_BASE, stunned: false, externalMul: 1 },
      t,
    );
    expect(speed(launch?.vel ?? vec())).toBeCloseTo(expected, 9);
    expect(expected).toBeGreaterThan(FULL_IMPULSE);
    expect(sim.bubble.lastChargePower).toBe(1);
    // Inside the ±62° cone and always DOWNWARD (§2.1: never launch upward).
    expect(sim.bubble.vel.y).toBeGreaterThan(0);
    expect(sim.bubble.vel.x).toBeGreaterThan(0);
    expect(Math.abs(sim.bubble.aimTheta)).toBeLessThanOrEqual((t.AIM_CONE_DEG * Math.PI) / 180);
  });

  it('applies stun, force-field and sticky multipliers to the impulse (§11.4)', () => {
    const stunned = new Sim(vec(90, 200));
    stunned.bubble.flags.stunUntil = 10_000;
    const origin = { ...stunned.bubble.pos };
    stunned.run_(t.CHARGE_FULL_MS, fingerAt(origin));
    stunned.step(POINTER_UP);
    expect(lastLaunchSpeed(stunned)).toBeCloseTo(FULL_IMPULSE * t.STUN_IMPULSE_MUL, 9);

    const field = new Sim(vec(90, 200));
    const env = createNeutralEnv();
    env.impulseMul = 0.4;
    env.chargeMul = 0.75;
    field.env = env;
    const fieldOrigin = { ...field.bubble.pos };
    field.run_(t.CHARGE_FULL_MS, fingerAt(fieldOrigin));
    field.step(POINTER_UP);
    expect(lastLaunchSpeed(field)).toBeCloseTo(FULL_IMPULSE * 0.4 * 0.75, 9);
  });

  it('auto-releases at AUTO_RELEASE_MS with the accumulated power (§2.2)', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const origin = { ...sim.bubble.pos };
    sim.run_(t.AUTO_RELEASE_MS, fingerAt(origin));

    expect(sim.of('launch')).toHaveLength(1);
    expect(sim.bubble.state).toBe('LAUNCHED');
    expect(lastLaunchSpeed(sim)).toBeCloseTo(FULL_IMPULSE, 9);
  });
});

// ---------------------------------------------------------------------------------------------
// Overcharge (§2.2, §11.7.4)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — overcharge (§11.7.4)', () => {
  it('holding 1.400 ms drains exactly one pip', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 5;
    const origin = { ...sim.bubble.pos };
    sim.run_(1400, fingerAt(origin));

    expect(sim.of('airLost')).toHaveLength(1);
    expect(sim.of('airLost')[0]?.reason).toBe('overcharge');
    expect(sim.bubble.air).toBe(4);
    expect(sim.of('overchargeStart')).toHaveLength(1);
  });

  it('holding 1.399 ms drains nothing: the first tick lands OVERCHARGE_DRAIN_MS after the threshold', () => {
    const sim = new Sim(vec(90, 200));
    const origin = { ...sim.bubble.pos };
    sim.run_(1380, fingerAt(origin));
    expect(sim.of('airLost')).toHaveLength(0);
    expect(sim.of('overchargeStart')).toHaveLength(1);
  });

  it('holding 5 s with a single pip drains nothing (hard floor)', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = t.OVERCHARGE_MIN_AIR;
    const origin = { ...sim.bubble.pos };
    sim.run_(5000, fingerAt(origin));

    expect(sim.of('airLost')).toHaveLength(0);
    expect(sim.bubble.air).toBe(t.OVERCHARGE_MIN_AIR);
    expect(sim.bubble.state).not.toBe('DEAD');
  });

  it('never drains more than OVERCHARGE_MAX_DRAIN in one hold', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const origin = { ...sim.bubble.pos };
    // A hold cannot last longer than the auto-release, and that window fits three drain ticks.
    sim.run_(t.AUTO_RELEASE_MS, fingerAt(origin));

    expect(sim.of('airLost')).toHaveLength(t.OVERCHARGE_MAX_DRAIN);
    expect(sim.bubble.air).toBe(8 - t.OVERCHARGE_MAX_DRAIN);
  });

  it('resets the per-hold budget on the next press', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const first = { ...sim.bubble.pos };
    sim.run_(1400, fingerAt(first));
    sim.step(POINTER_UP);
    expect(sim.bubble.overchargeDrained).toBe(1);

    sim.run_(400);
    const second = { ...sim.bubble.pos };
    sim.step(fingerAt(second));
    expect(sim.bubble.overchargeDrained).toBe(0);
  });

  it('uses the 1.800 ms threshold while charging from rest (§11.3)', () => {
    const patient = restingSim();
    const origin = { ...patient.bubble.pos };
    patient.run_(1400, fingerAt(origin));
    expect(patient.of('airLost')).toHaveLength(0);
    expect(patient.of('overchargeStart')).toHaveLength(0);

    const overcharged = restingSim();
    const restOrigin = { ...overcharged.bubble.pos };
    overcharged.run_(t.OVERCHARGE_MS_RESTING + t.OVERCHARGE_DRAIN_MS, fingerAt(restOrigin));
    expect(overcharged.of('airLost')).toHaveLength(1);
    expect(overcharged.of('overchargeStart')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Rest capture (§2.3)
// ---------------------------------------------------------------------------------------------

/** Bur one px under the bottom face of a capturable slab, given an upward velocity. */
function approachSim(velY: number, overrides: Partial<Ceiling> = {}): Sim {
  const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 }, overrides);
  const sim = new Sim(vec(90, 118), [slab]);
  sim.bubble.vel = { x: 0, y: velY };
  return sim;
}

/** A sim that already captured rest under 'ceil' (one step of RESTING accounted for). */
function restingSim(overrides: Partial<Ceiling> = {}): Sim {
  const sim = approachSim(-200, overrides);
  sim.step();
  if (sim.bubble.state !== 'RESTING') throw new Error('harness: capture failed');
  sim.clearEvents();
  return sim;
}

describe('stepBubble — rest capture (§2.3)', () => {
  it('captures an upward contact at 200 px/s and pins Bur under the ceiling', () => {
    const sim = approachSim(-200);
    sim.step();

    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.bubble.vel).toEqual({ x: 0, y: 0 });
    expect(sim.bubble.pos.y).toBeCloseTo(110 + sim.bubble.radius, 2);
    expect(sim.bubble.restingOnId).toBe('ceil');
    expect(sim.bubble.lastRestingCeilingId).toBe('ceil');
    expect(sim.bubble.restMs).toBe(0);
    expect(sim.of('rest')).toEqual([{ type: 'rest', ceilingId: 'ceil', kind: 'posadero' }]);
    expect(sim.of('bounce')).toHaveLength(0);
  });

  it('bounces instead at 300 px/s: the capture threshold has teeth', () => {
    const sim = approachSim(-300);
    sim.step();

    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.bubble.vel.y).toBeGreaterThan(0); // reflected downward
    expect(sim.of('rest')).toHaveLength(0);
    expect(sim.of('bounce')).toHaveLength(1);
    expect(sim.of('bounce')[0]?.material).toBe('rock');
  });

  it('brackets REST_CAPTURE_SPEED exactly (260 px/s of approach)', () => {
    const captured = approachSim(-260);
    captured.step();
    expect(captured.bubble.state).toBe('RESTING');

    const bounced = approachSim(-262);
    bounced.step();
    expect(bounced.bubble.state).toBe('IDLE');
  });

  it('never captures on the top face — falling onto a slab is a bounce (§2.3)', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(90, 92), [slab]);
    sim.bubble.vel = { x: 0, y: 200 };
    sim.step();

    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.of('bounce')[0]?.contact.face).toBe('top');
    expect(sim.of('rest')).toHaveLength(0);
  });

  it('never captures on a side face', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(52, 105), [slab]);
    sim.bubble.vel = { x: 200, y: 0 };
    sim.step();

    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.of('bounce')[0]?.contact.face).toBe('left');
    expect(sim.of('rest')).toHaveLength(0);
  });

  it('never captures on a non-capturable ceiling, however slow the arrival (§2.3)', () => {
    const sim = approachSim(-40, { capturable: false, restitution: t.RESTITUTION_JELLY, material: 'jelly' });
    for (let i = 0; i < 30 && sim.of('bounce').length === 0; i++) sim.step();

    expect(sim.of('bounce').length).toBeGreaterThan(0);
    expect(sim.of('rest')).toHaveLength(0);
    expect(sim.bubble.state).toBe('IDLE');
  });

  it('never captures during the LAUNCHED lock (§11.3)', () => {
    const sim = approachSim(-200);
    sim.bubble.state = 'LAUNCHED';
    sim.bubble.launchedMs = 0;
    sim.step();

    expect(sim.bubble.state).toBe('LAUNCHED');
    expect(sim.of('rest')).toHaveLength(0);
    expect(sim.of('bounce')).toHaveLength(1);
  });

  it('leaves LAUNCHED for IDLE after exactly LAUNCH_LOCK_MS of stepping', () => {
    const sim = new Sim(vec(90, 200));
    const origin = { ...sim.bubble.pos };
    sim.run_(t.CHARGE_FULL_MS, fingerAt(origin));
    sim.step(POINTER_UP); // launch step: the first LAUNCHED step
    expect(sim.bubble.state).toBe('LAUNCHED');

    for (let i = 1; i < Math.round(t.LAUNCH_LOCK_MS / STEP_MS); i++) {
      sim.step();
      expect(sim.bubble.state).toBe('LAUNCHED');
    }
    sim.step();
    expect(sim.bubble.state).toBe('IDLE');
  });
});

// ---------------------------------------------------------------------------------------------
// Resting (§2.3, §11.3)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — resting (§2.3)', () => {
  it('holds Bur still and accumulates restMs', () => {
    const sim = restingSim();
    const pos = { ...sim.bubble.pos };
    expect(pos.y).toBeCloseTo(110 + sim.bubble.radius, 12);
    sim.run_(500);

    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.bubble.pos).toEqual(pos);
    expect(sim.bubble.vel).toEqual({ x: 0, y: 0 });
    expect(sim.bubble.restMs).toBeCloseTo(500, 6);
  });

  it('ejects DOWNWARD when the timer runs out, never upward (§2.3)', () => {
    const sim = restingSim();
    sim.run_(t.REST_MAX_MS.posadero);

    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'timeout' }]);
    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.bubble.restingOnId).toBeNull();
    expect(sim.bubble.vel.y).toBeGreaterThan(0);
    expect(sim.bubble.vel.y).toBeLessThanOrEqual(t.REST_RELEASE_PUSH);
    // lastRestingCeilingId survives for the resaca respawn chain (§2.4.2).
    expect(sim.bubble.lastRestingCeilingId).toBe('ceil');
  });

  it('honours each ceiling kind and the per-entity maxRestMs override', () => {
    for (const kind of ['posadero', 'impaciente', 'pegajosa'] as const) {
      const sim = restingSim({ kind });
      sim.run_(t.REST_MAX_MS[kind] - STEP_MS);
      expect(sim.bubble.state).toBe('RESTING');
      sim.step();
      expect(sim.bubble.state).toBe('IDLE');
    }

    const override = restingSim({ kind: 'posadero', maxRestMs: 400 });
    override.run_(400);
    expect(override.bubble.state).toBe('IDLE');
  });

  it('is not re-captured by the ceiling it just left (LAUNCH_LOCK_MS pass-through)', () => {
    const sim = restingSim();
    sim.run_(t.REST_MAX_MS.posadero);
    sim.clearEvents();
    sim.run_(t.LAUNCH_LOCK_MS - STEP_MS);

    expect(sim.of('rest')).toHaveLength(0);
    expect(sim.of('bounce')).toHaveLength(0);
    expect(sim.bubble.state).toBe('IDLE');
  });

  it('releases as "displaced" when the ceiling stops existing (dissolved, streamed out)', () => {
    const sim = restingSim();
    sim.solids = [];
    sim.step();

    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'displaced' }]);
    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.bubble.restingOnId).toBeNull();
  });

  it('rides a kinematic ceiling instead of hanging in open water', () => {
    const sim = restingSim({ moving: { axis: 'x', speed: 20, range: 40 } });
    const slab = sim.solids[0];
    if (slab === undefined) throw new Error('harness: no slab');

    for (let i = 0; i < 10; i++) {
      sim.step();
      const rect = solidRectAt(slab, sim.nowMs);
      expect(sim.bubble.pos.y).toBeCloseTo(rect.y + rect.h + sim.bubble.radius, 9);
      expect(sim.bubble.pos.x).toBeGreaterThanOrEqual(rect.x);
      expect(sim.bubble.pos.x).toBeLessThanOrEqual(rect.x + rect.w);
    }
    expect(sim.bubble.pos.x).toBeGreaterThan(90.5); // it really did travel
  });

  it('launches from rest with the sticky penalty and reports restRelease("launch")', () => {
    const sim = restingSim({ kind: 'pegajosa', restitution: t.RESTITUTION_SOFT, material: 'kelp' });
    const origin = { ...sim.bubble.pos };
    sim.run_(t.CHARGE_FULL_MS, fingerAt(origin));
    sim.step(POINTER_UP);

    expect(lastLaunchSpeed(sim)).toBeCloseTo(FULL_IMPULSE * t.REST_STICKY_IMPULSE_MUL, 9);
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'launch' }]);
    expect(sim.bubble.state).toBe('LAUNCHED');
    expect(sim.bubble.restingOnId).toBeNull();
  });

  it('launches from a firm ceiling at full strength', () => {
    const sim = restingSim();
    const origin = { ...sim.bubble.pos };
    sim.run_(t.CHARGE_FULL_MS, fingerAt(origin));
    sim.step(POINTER_UP);
    expect(lastLaunchSpeed(sim)).toBeCloseTo(FULL_IMPULSE, 9);
  });

  it('stays pinned while charging from rest (§2.1 "cargar ancla")', () => {
    const sim = restingSim();
    const origin = { ...sim.bubble.pos };
    sim.run_(600, fingerAt(origin));

    expect(sim.bubble.state).toBe('CHARGING');
    expect(sim.bubble.pos).toEqual(origin);
    expect(sim.bubble.vel).toEqual({ x: 0, y: 0 });
  });
});

// ---------------------------------------------------------------------------------------------
// Bounces, chains and trampolines (§2.2, §2.5)
// ---------------------------------------------------------------------------------------------

/** Five separate walls, one per 50 px band, all reachable by teleporting Bur next to them. */
function bounceWorld(count: number): Wall[] {
  return Array.from({ length: count }, (_, i) => wall(`w${i}`, { x: 100, y: 200 + i * 50, w: 20, h: 40 }));
}

/** Throws Bur at the left face of `body` and steps once; returns the bounce events of that step. */
function bounceOnce(sim: Sim, body: Wall): void {
  sim.bubble.pos = { x: body.rect.x - sim.bubble.radius - 2, y: body.rect.y + 20 };
  sim.bubble.vel = { x: 300, y: 0 };
  sim.step();
}

describe('stepBubble — bounce chain (§2.5)', () => {
  it('counts DISTINCT bodies only: rattling on one wall never pays', () => {
    const walls = bounceWorld(1);
    const sim = new Sim(vec(90, 200), walls);
    sim.bubble.air = 3;
    const only = walls[0];
    if (only === undefined) throw new Error('harness');

    for (let i = 0; i < t.BOUNCE_CHAIN_REWARD + 2; i++) bounceOnce(sim, only);

    expect(sim.of('bounce').length).toBeGreaterThanOrEqual(t.BOUNCE_CHAIN_REWARD);
    expect(sim.bubble.bounceChain).toBe(1);
    expect(sim.of('airGained')).toHaveLength(0);
    expect(sim.bubble.air).toBe(3);
  });

  it('pays +1 air at BOUNCE_CHAIN_REWARD distinct bodies, once per chunk', () => {
    const walls = bounceWorld(t.BOUNCE_CHAIN_REWARD * 2);
    const sim = new Sim(vec(90, 200), walls);
    sim.bubble.air = 3;

    for (let i = 0; i < t.BOUNCE_CHAIN_REWARD; i++) bounceOnce(sim, walls[i] as Wall);
    expect(sim.of('airGained')).toEqual([
      { type: 'airGained', reason: 'bounceChain', air: 4, at: sim.of('airGained')[0]?.at ?? vec() },
    ]);
    expect(sim.bubble.air).toBe(4);
    // The chain restarts, so the next five bounces cannot pay twice in the same chunk.
    expect(sim.bubble.bounceChain).toBe(0);

    for (let i = t.BOUNCE_CHAIN_REWARD; i < walls.length; i++) bounceOnce(sim, walls[i] as Wall);
    expect(sim.of('airGained')).toHaveLength(1);
    expect(sim.bubble.air).toBe(4);

    // A new chunk re-arms the reward.
    sim.chunkId = 'chunk-b';
    bounceOnce(sim, walls[0] as Wall);
    expect(sim.of('airGained')).toHaveLength(2);
    expect(sim.bubble.air).toBe(5);
  });

  it('deflates a trampoline for its cooldown so Bur passes through it (§2.2)', () => {
    const jelly = ceiling('jelly', { x: 60, y: 100, w: 60, h: 10 }, {
      capturable: false,
      restitution: t.RESTITUTION_JELLY,
      material: 'jelly',
      bounceCooldownMs: t.BOUNCE_COOLDOWN_MS,
    });
    const sim = new Sim(vec(90, 118), [jelly]);
    sim.bubble.vel = { x: 0, y: -200 };
    sim.step();

    expect(sim.of('bounce')).toHaveLength(1);
    expect(sim.bubble.passThrough).toEqual([{ id: 'jelly', until: t.BOUNCE_COOLDOWN_MS }]);

    // Thrown at it again during the cooldown: straight through, no contact at all.
    sim.clearEvents();
    sim.bubble.pos = { x: 90, y: 118 };
    sim.bubble.vel = { x: 0, y: -200 };
    for (let i = 0; i < 8; i++) sim.step();
    expect(sim.of('bounce')).toHaveLength(0);
    expect(sim.bubble.pos.y).toBeLessThan(100); // straight through the 100–110 slab

    // Once it has re-inflated it is solid again.
    sim.bubble.pos = { x: 90, y: 118 };
    sim.bubble.vel = { x: 0, y: -200 };
    sim.nowMs = t.BOUNCE_COOLDOWN_MS + STEP_MS;
    sim.step();
    expect(sim.of('bounce')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Pressure, death and invariants
// ---------------------------------------------------------------------------------------------

describe('stepBubble — passive pressure drain (§2.4.4)', () => {
  it('drains one pip every PRESSURE_DRAIN_S from PRESSURE_DRAIN_FROM_ZONE on', () => {
    const sim = new Sim(vec(90, 200), [], 4);
    sim.bubble.air = 6;
    sim.run_(t.PRESSURE_DRAIN_S * 1000);
    expect(sim.of('airLost')).toHaveLength(1);
    expect(sim.of('airLost')[0]?.reason).toBe('pressure');

    sim.run_(t.PRESSURE_DRAIN_S * 1000);
    expect(sim.of('airLost')).toHaveLength(2);
    expect(sim.bubble.air).toBe(4);
  });

  it('does not drain in the shallow zones', () => {
    const sim = new Sim(vec(90, 200), [], 3);
    sim.bubble.air = 6;
    sim.run_(t.PRESSURE_DRAIN_S * 1000 * 2);
    expect(sim.of('airLost')).toHaveLength(0);
  });

  it('freezes while Bur is resting (§2.3)', () => {
    const sim = restingSim({ maxRestMs: 60_000 });
    sim.zone = 5;
    sim.bubble.air = 6;
    sim.run_(t.PRESSURE_DRAIN_S * 1000 + 2000);

    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.of('airLost')).toHaveLength(0);
    expect(sim.bubble.pressureDrainMs).toBe(0);
  });
});

describe('stepBubble — DEAD (§2.4, §11.7.6)', () => {
  it('enters DEAD with a deflate and a hitstop when the last pip goes', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 1;
    const change = applyAirLoss(sim.bubble, sim.run, 'hit', sim.bubble.pos, sim.nowMs, t);

    expect(change.died).toBe(true);
    expect(sim.bubble.state).toBe('DEAD');
    expect(sim.bubble.deadMs).toBe(0);
    expect(sim.bubble.vel).toEqual({ x: 0, y: 0 });
    expect(change.events.map((e) => e.type)).toEqual(['airLost', 'deflate', 'hitstop']);
  });

  it('dies from the pressure clock too, and never leaves DEAD on its own', () => {
    const sim = new Sim(vec(90, 200), [], 5);
    sim.bubble.air = 1;
    sim.run_(t.PRESSURE_DRAIN_S * 1000);
    expect(sim.bubble.state).toBe('DEAD');

    const dead = { ...sim.bubble.pos };
    const origin = { ...sim.bubble.pos };
    sim.clearEvents();
    sim.run_(5000, fingerAt(origin)); // pressing does nothing at all
    expect(sim.bubble.state).toBe('DEAD');
    expect(sim.bubble.pos).toEqual(dead);
    expect(sim.bubble.deadMs).toBeCloseTo(5000, 6);
    expect(sim.events).toHaveLength(0);
  });
});

describe('stepBubble — resaca timeout (§2.4.2)', () => {
  it('spends a pip and asks for a respawn when the grace period expires', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 4;
    sim.bubble.flags.resacaUntil = sim.nowMs + t.RESACA_GRACE_MS;

    let firedAt = -1;
    for (let i = 0; i < 200 && firedAt < 0; i++) {
      const at = sim.nowMs;
      if (sim.step().requestRespawn) firedAt = at;
    }
    // Fires on the first step that starts at or after the deadline, and not one step early.
    expect(firedAt).toBeGreaterThanOrEqual(t.RESACA_GRACE_MS - 1e-6);
    expect(firedAt).toBeLessThan(t.RESACA_GRACE_MS + STEP_MS);
    expect(sim.of('airLost')[0]?.reason).toBe('resaca');
    expect(sim.bubble.air).toBe(3);
    expect(sim.bubble.flags.resacaUntil).toBe(0);

    sim.run_(2000);
    expect(sim.of('airLost')).toHaveLength(1); // fires once, not once per step
  });
});

describe('stepBubble — pressure radius and flags (§2.6, §11.3)', () => {
  it('radiusForZone follows the zone table and reinflate gives back one step', () => {
    for (let zone = 0; zone < t.ZONE_RADIUS_PCT.length; zone++) {
      const z = zone as ZoneIndex;
      expect(radiusForZone(z, false, t)).toBeCloseTo(t.RADIUS_BASE * (t.ZONE_RADIUS_PCT[zone] ?? 1), 9);
    }
    expect(radiusForZone(5, true, t)).toBeCloseTo(radiusForZone(4, false, t), 9);
    expect(radiusForZone(0, true, t)).toBeCloseTo(radiusForZone(0, false, t), 9);
  });

  it('applies the zone radius every step and drops the reinflate when it expires', () => {
    const sim = new Sim(vec(90, 200), [], 5);
    sim.bubble.flags.reinflateUntil = 100;
    sim.step();
    expect(sim.bubble.radius).toBeCloseTo(radiusForZone(4, false, t), 9);

    sim.run_(200);
    expect(sim.bubble.radius).toBeCloseTo(radiusForZone(5, false, t), 9);
    expect(sim.bubble.flags.reinflateUntil).toBe(0);
  });

  it('clears spent flags', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.flags.invulnUntil = 50;
    sim.bubble.flags.stunUntil = 50;
    sim.bubble.flags.ascensoUntil = 50;
    sim.run_(100);
    expect(sim.bubble.flags).toMatchObject({ invulnUntil: 0, stunUntil: 0, ascensoUntil: 0 });
  });
});

describe('createBubble', () => {
  it('starts IDLE at AIR_START with the zone radius and capacity', () => {
    const bubble = createBubble(vec(90, 40), 3, t);
    expect(bubble.state).toBe('IDLE');
    expect(bubble.air).toBe(t.AIR_START);
    expect(bubble.airMax).toBe(t.ZONE_AIR_MAX[3]);
    expect(bubble.radius).toBeCloseTo(radiusForZone(3, false, t), 9);
    expect(bubble.vel).toEqual({ x: 0, y: 0 });
    expect(bubble.aimOrigin).toBeNull();
    expect(bubble.pos).toEqual({ x: 90, y: 40 });
  });

  it('copies the spawn position instead of aliasing it', () => {
    const pos = vec(90, 40);
    const bubble = createBubble(pos, 0, t);
    pos.x = 0;
    expect(bubble.pos.x).toBe(90);
  });
});

describe('stepBubble — invariants over a long random session (§11.7.12)', () => {
  it('keeps air inside [0, airMax] and the state machine inside its five states', () => {
    const solids: SolidEntity[] = [
      wall('left', { x: -20, y: 0, w: 20, h: 4000 }),
      wall('right', { x: 180, y: 0, w: 20, h: 4000 }),
      wall('floor', { x: -20, y: 900, w: 220, h: 40 }),
      ceiling('c1', { x: 40, y: 300, w: 80, h: 10 }),
      ceiling('c2', { x: 20, y: 520, w: 60, h: 10 }, { kind: 'impaciente' }),
      ceiling('c3', { x: 100, y: 700, w: 60, h: 10 }, {
        capturable: false,
        restitution: t.RESTITUTION_JELLY,
        material: 'jelly',
        bounceCooldownMs: t.BOUNCE_COOLDOWN_MS,
      }),
    ];
    const sim = new Sim(vec(90, 200), solids, 5);
    sim.bubble.air = 6;
    sim.bubble.airMax = 6;
    const rng = new SeededRNG(20260906);
    const states = new Set<string>();

    let pointer: PointerInput = POINTER_UP;
    for (let i = 0; i < 6000; i++) {
      if (rng.next() < 0.02) {
        pointer = pointer.down
          ? POINTER_UP
          : { down: true, x: sim.bubble.pos.x + (rng.next() - 0.5) * 120, y: sim.bubble.pos.y + 30 + rng.next() * 60 };
      }
      if (sim.bubble.state === 'DEAD') {
        // The only way out of DEAD is external (§11.7.6): the harness plays the part of GameWorld.
        sim.bubble.state = 'IDLE';
        sim.bubble.air = 4;
        sim.bubble.deadMs = 0;
      }
      sim.step(pointer);
      states.add(sim.bubble.state);
      expect(sim.bubble.air).toBeGreaterThanOrEqual(0);
      expect(sim.bubble.air).toBeLessThanOrEqual(sim.bubble.airMax);
      expect(Number.isFinite(sim.bubble.pos.x)).toBe(true);
      expect(Number.isFinite(sim.bubble.pos.y)).toBe(true);
      expect(sim.bubble.radius).toBeGreaterThan(0);
    }

    expect(states.has('CHARGING')).toBe(true);
    expect(states.has('LAUNCHED')).toBe(true);
    expect(states.has('RESTING')).toBe(true);
    expect([...states].every((s) => ['IDLE', 'CHARGING', 'LAUNCHED', 'RESTING', 'DEAD'].includes(s))).toBe(true);
  });

  it('is reproducible: two runs of the same script agree step for step', () => {
    const script = (): Sim => {
      const sim = new Sim(vec(90, 100), [ceiling('c1', { x: 40, y: 300, w: 100, h: 10 })]);
      for (let i = 0; i < 400; i++) {
        const down = i % 97 < 40;
        sim.step(down ? { down: true, x: 120, y: sim.bubble.pos.y + 60 } : POINTER_UP);
      }
      return sim;
    };
    const a = script();
    const b = script();
    expect(a.bubble.pos).toEqual(b.bubble.pos);
    expect(a.bubble.vel).toEqual(b.bubble.vel);
    expect(a.bubble.air).toBe(b.bubble.air);
    expect(a.events.length).toBe(b.events.length);
  });
});

describe('chargePower agreement', () => {
  it('the launch power is exactly the §11.4 curve of the accumulated hold', () => {
    const sim = new Sim(vec(90, 200));
    const origin = { ...sim.bubble.pos };
    sim.run_(300, fingerAt(origin));
    const held = sim.bubble.chargeMs;
    sim.step(POINTER_UP);
    expect(sim.bubble.lastChargePower).toBeCloseTo(chargePower(held, t), 12);
  });
});

// ---------------------------------------------------------------------------------------------
// One finger contact = one hold (§2.2 auto-release, §11.7.4 cap)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — a hold ends with the finger, not with the auto-release (§2.2)', () => {
  /**
   * The auto-release fires with the finger still on the glass, and 250 ms later the LAUNCHED lock
   * expires. Deriving the press edge from the state would read that as a brand-new pointerdown and
   * start a second hold: a second `chargeStart`, a shot nobody asked for and a re-armed overcharge
   * budget. §2.2 gives a `mantenido` one auto-release, not a metronome.
   */
  it('does not start a second hold under a finger that never lifted', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const origin = { ...sim.bubble.pos };
    sim.run_(t.AUTO_RELEASE_MS + t.LAUNCH_LOCK_MS + 500, fingerAt(origin));

    expect(sim.of('chargeStart')).toHaveLength(1);
    expect(sim.of('launch')).toHaveLength(1);
    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.bubble.chargeMs).toBe(0);
  });

  /** §11.7.4, taken literally: "nunca drena más de 2 en un mismo mantenido", of any length. */
  it('caps one uninterrupted press at OVERCHARGE_MAX_DRAIN however long it lasts', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const origin = { ...sim.bubble.pos };
    sim.run_(10_000, fingerAt(origin));

    expect(sim.of('airLost').map((e) => e.reason)).toEqual(['overcharge', 'overcharge']);
    expect(sim.bubble.air).toBe(8 - t.OVERCHARGE_MAX_DRAIN);
  });

  it('re-arms the gesture only after a real release', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const first = { ...sim.bubble.pos };
    sim.run_(t.AUTO_RELEASE_MS + t.LAUNCH_LOCK_MS + 200, fingerAt(first));
    expect(sim.bubble.air).toBe(8 - t.OVERCHARGE_MAX_DRAIN);

    sim.step(POINTER_UP);
    const second = { ...sim.bubble.pos };
    sim.run_(t.OVERCHARGE_MS + t.OVERCHARGE_DRAIN_MS, fingerAt(second));

    expect(sim.of('chargeStart')).toHaveLength(2);
    expect(sim.bubble.air).toBe(8 - t.OVERCHARGE_MAX_DRAIN - 1);
  });
});

// ---------------------------------------------------------------------------------------------
// The anti-camping clock while aiming (§2.3)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — anti-camping while Bur aims (§2.3)', () => {
  /**
   * §2.3 argues the 1.800 ms rest threshold against the 3,0 s rest timer ("eso deja presupuesto de
   * puntería de sobra sin necesidad de quitar el anti-camping"). The argument is only true if the
   * timer keeps running while she aims — otherwise a drummed finger parks Bur under a ledge forever.
   */
  it('keeps counting rest time while Bur charges from the ledge', () => {
    const sim = restingSim();
    const origin = { ...sim.bubble.pos };
    sim.run_(1000, fingerAt(origin));

    expect(sim.bubble.state).toBe('CHARGING');
    expect(sim.bubble.restingOnId).toBe('ceil');
    expect(sim.bubble.restMs).toBeCloseTo(1000, 6);
  });

  /** The eject waits for the gesture to end: a charged shot is never yanked out of a player's hands. */
  it('ejects on the step the drumming finger comes up, not mid-charge', () => {
    const sim = restingSim();
    sim.run_(t.REST_MAX_MS.posadero - 3 * STEP_MS);
    const origin = { ...sim.bubble.pos };
    sim.run_(4 * STEP_MS, fingerAt(origin)); // 66,7 ms: under MIN_TAP_MS, so nothing can launch

    expect(sim.bubble.state).toBe('CHARGING');
    expect(sim.bubble.restMs).toBeGreaterThan(t.REST_MAX_MS.posadero);
    expect(sim.of('restRelease')).toHaveLength(0);

    sim.step(POINTER_UP);
    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'timeout' }]);
    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.bubble.vel.y).toBeGreaterThan(0); // downward, always (§2.3)
  });

  /** A hold that overstays the timer still fires; the launch is what ends the attachment. */
  it('lets an overdue hold launch instead of ejecting it', () => {
    const sim = restingSim();
    sim.run_(t.REST_MAX_MS.posadero - 500);
    const origin = { ...sim.bubble.pos };
    sim.run_(600, fingerAt(origin));
    expect(sim.of('restRelease')).toHaveLength(0);

    sim.step(POINTER_UP);
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'launch' }]);
    expect(sim.bubble.state).toBe('LAUNCHED');
  });

  /** The Z5–Z6 pressure clock belongs to the pose, not to the state name (§2.3, §2.4.4). */
  it('freezes the pressure clock while Bur aims from the ledge', () => {
    const sim = restingSim({ maxRestMs: 60_000 });
    sim.zone = 5;
    sim.bubble.air = 6;
    const origin = { ...sim.bubble.pos };
    sim.run_(2000, fingerAt(origin));

    expect(sim.bubble.state).toBe('CHARGING');
    expect(sim.bubble.pressureDrainMs).toBe(0);
    expect(sim.of('airLost')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// The rest pose (§2.3, §11.4)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — the rest pose hangs under the face, never beside it (§2.3)', () => {
  /**
   * `collision.ts` maps a corner graze to the face its normal is closest to, so an arrival at the
   * bottom-left lip is a `face: 'bottom'` contact whose POINT is the corner. Snapping only the
   * vertical axis to it would leave Bur resting a full radius away from the slab, and `pinToCeiling`
   * would then re-assert that pose every step: permanent, not transient.
   */
  it('snaps a corner capture under the ledge instead of hanging Bur beside it', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(58, 125), [slab]);
    sim.bubble.vel = { x: 0, y: -200 };
    for (let i = 0; i < 20 && sim.bubble.state !== 'RESTING'; i++) sim.step();

    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.bubble.pos.x).toBe(slab.rect.x);
    expect(sim.bubble.pos.y).toBeCloseTo(slab.rect.y + slab.rect.h + sim.bubble.radius, 9);

    sim.run_(300); // and the pinning keeps her there instead of drifting off the lip
    expect(sim.bubble.pos.x).toBe(slab.rect.x);
    expect(sim.bubble.state).toBe('RESTING');
  });
});

// ---------------------------------------------------------------------------------------------
// A capture that lands in the middle of a hold (§2.1, §2.3, §11.3)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — capture during an in-air charge (§11.3)', () => {
  /**
   * Charging in the water is legal (§2.1) and buoyancy still lifts Bur at 35 %, so a hold started
   * under a ledge ends in a slow ascending contact that §2.3 captures. The capture attaches her; it
   * does not end the gesture, so the charge she is holding survives and launches from the ledge with
   * the rules of that ledge (here `pegajosa`: 60 % of impulse).
   */
  it('keeps the accumulated hold and launches it from the ledge', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 }, { kind: 'pegajosa' });
    const sim = new Sim(vec(90, 121), [slab]);
    const origin = { ...sim.bubble.pos };
    const finger = fingerAt(origin);

    for (let i = 0; i < 200 && sim.bubble.restingOnId === null; i++) sim.step(finger);
    const heldAtCapture = sim.bubble.chargeMs;
    expect(sim.bubble.restingOnId).toBe('ceil');
    expect(sim.bubble.state).toBe('RESTING');
    expect(heldAtCapture).toBeGreaterThan(t.MIN_TAP_MS);

    sim.step(finger); // resumed, never restarted
    expect(sim.bubble.state).toBe('CHARGING');
    expect(sim.bubble.chargeMs).toBeGreaterThan(heldAtCapture);
    expect(sim.of('chargeStart')).toHaveLength(1);

    const held = sim.bubble.chargeMs;
    sim.step(POINTER_UP);
    expect(sim.bubble.lastChargePower).toBeCloseTo(chargePower(held, t), 12);
    expect(lastLaunchSpeed(sim)).toBeCloseTo(
      impulseMagnitude(
        {
          power: chargePower(held, t),
          dragDist: t.DRAG_NEUTRAL_PX,
          radius: t.RADIUS_BASE,
          stunned: false,
          externalMul: t.REST_STICKY_IMPULSE_MUL,
        },
        t,
      ),
      9,
    );
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'launch' }]);
  });
});

// ---------------------------------------------------------------------------------------------
// The overcharge tell (§2.2)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — overchargeStart is the tell for every drain (§2.2)', () => {
  /**
   * The threshold moves mid-hold: 1.800 ms while Bur hangs from a ceiling, 900 ms once it stops
   * holding her (marine snow dissolving, a slab carried away, the streamer dropping the chunk). A
   * hold already past 900 ms then enters overcharge without ever "crossing" a threshold, and §2.2
   * has no silent cost — the tell is latched per hold, not derived from the crossing.
   */
  it('announces once per hold, including when the threshold drops under a running hold', () => {
    const sim = restingSim();
    sim.bubble.air = 5;
    const origin = { ...sim.bubble.pos };
    const finger = fingerAt(origin);
    sim.run_(t.OVERCHARGE_MS + 300, finger); // past the water threshold, inside the rest budget
    expect(sim.of('overchargeStart')).toHaveLength(0);
    expect(sim.of('airLost')).toHaveLength(0);

    sim.solids = []; // the ledge is gone: 1.800 ms → 900 ms
    sim.step(finger);
    expect(sim.of('overchargeStart')).toHaveLength(1);

    sim.run_(t.OVERCHARGE_DRAIN_MS, finger);
    expect(sim.of('airLost').map((e) => e.reason)).toEqual(['overcharge']);
    expect(sim.of('overchargeStart')).toHaveLength(1); // one hold, one tell
  });
});
