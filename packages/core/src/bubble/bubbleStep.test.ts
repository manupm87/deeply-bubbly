import { describe, expect, it } from 'vitest';
import { vec } from '../math/vec';
import { SeededRNG } from '../ports';
import { createTuning } from '../tuning';
import { impulseMagnitude, pullPower } from '../control/pull';
import { pullGesture } from '../game/testHarness';
import { createNeutralEnv, NEUTRAL_ENV } from '../physics/forceFields';
import { solidRectAt } from '../physics/collision';
import { applyAirLoss, canAirLaunch, createBubble, radiusForZone, stepBubble } from './bubbleStep';
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

/**
 * The pointer that OPENS a gesture. `aimOrigin` freezes exactly here (D2: the finger, not Bur), so
 * every later sample is written relative to this same point.
 */
function press(at: Vec2): PointerInput {
  return { down: true, x: at.x, y: at.y };
}

/**
 * A still finger holding the sling at `power` for a launch `thetaDeg` off straight down. The pull
 * points the OPPOSITE way to the shot, which is what `pullGesture` encodes: asking for a full-power
 * shot straight down puts the finger PULL_MAX_PX *above* the origin.
 */
function pullTo(origin: Vec2, power = 1, thetaDeg = 0): PointerInput {
  const d = pullGesture(power, thetaDeg, t);
  return { down: true, x: origin.x + d.x, y: origin.y + d.y };
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

/** Impulse of a full pull in zone 0 — the §2.2 table value, IMPULSE_MAX after D4. */
const FULL_IMPULSE = impulseMagnitude({ power: 1, radius: t.RADIUS_BASE, stunned: false, externalMul: 1 }, t);

// ---------------------------------------------------------------------------------------------
// The gesture (§2.1, §11.7.3)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — the slingshot gesture (D2)', () => {
  it('freezes aimOrigin at the FINGER, not at Bur, and emits aimStart', () => {
    const sim = new Sim(vec(90, 200));
    const finger = vec(40, 260);
    sim.step(press(finger));

    expect(sim.bubble.state).toBe('AIMING');
    expect(sim.bubble.aimOrigin).toEqual(finger);
    expect(sim.bubble.aimOrigin).not.toEqual(sim.bubble.pos);
    expect(sim.bubble.aimMs).toBeCloseTo(STEP_MS, 9);
    expect(sim.of('aimStart')).toEqual([{ type: 'aimStart', at: finger, fromRest: false }]);
  });

  it('reports fromRest on an aim opened from a ledge', () => {
    const sim = restingSim();
    sim.step(press(vec(90, 300)));
    expect(sim.of('aimStart')[0]?.fromRest).toBe(true);
  });

  it('power is the pull length over PULL_MAX_PX: p(70) = 1, p(35) = 0.5, p(0) = 0 (§11.7.1 rewritten)', () => {
    expect(pullPower(t.PULL_MAX_PX, t)).toBe(1);
    expect(pullPower(t.PULL_MAX_PX / 2, t)).toBeCloseTo(0.5, 12);
    expect(pullPower(0, t)).toBe(0);

    // And the state machine agrees: a half pull launches at exactly half of the impulse span.
    const sim = restingSim();
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(100, pullTo(origin, 0.5));
    sim.step(POINTER_UP);

    expect(sim.of('launch')[0]?.power).toBeCloseTo(0.5, 9);
    expect(lastLaunchSpeed(sim)).toBeCloseTo(t.IMPULSE_MIN + 0.5 * (t.IMPULSE_MAX - t.IMPULSE_MIN), 6);
  });

  it('cancels inside PULL_CANCEL_PX: no launch, back to RESTING, and aimCancel is the only event', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    const restedOn = sim.bubble.restingOnId;
    const pos = { ...sim.bubble.pos };
    sim.step(press(origin));
    // 11 px of pull: inside the 12 px radius, so the ring is empty and there is no shot to take.
    sim.run_(200, { down: true, x: origin.x, y: origin.y - (t.PULL_CANCEL_PX - 1) });
    expect(sim.bubble.cancelZone).toBe(true);

    sim.step(POINTER_UP);
    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.bubble.restingOnId).toBe(restedOn);
    expect(sim.bubble.pos).toEqual(pos);
    expect(sim.bubble.vel).toEqual({ x: 0, y: 0 });
    expect(sim.events.map((e) => e.type)).toEqual(['aimStart', 'aimCancel']);
    expect(sim.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'zone' }]);
  });

  it('cancels an air aim back to IDLE at no cost', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 5;
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.step({ down: true, x: origin.x + 4, y: origin.y });
    sim.step(POINTER_UP);

    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.bubble.air).toBe(5);
    expect(sim.bubble.airLaunchesUsed).toBe(0);
    expect(sim.of('airLost')).toHaveLength(0);
    expect(sim.of('aimCancel')).toHaveLength(1);
  });

  it('a pull that asks to go UP clamps to the horizontal on that side, and says so', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    sim.step(press(origin));
    // Finger BELOW the origin = pulling down = asking Bur to fly UP, and a touch to the left of
    // centre = asking her to fly up and to the RIGHT. The nearest legal shot is the right horizontal.
    sim.step({ down: true, x: origin.x - 5, y: origin.y + 60 });

    expect(sim.bubble.aimValid).toBe(false);
    expect(sim.bubble.pullTheta).toBeCloseTo(Math.PI / 2, 9);

    sim.step(POINTER_UP);
    const [launch] = sim.of('launch');
    expect(launch).toBeDefined();
    expect(launch?.vel.x).toBeGreaterThan(0);
    expect(Math.abs(launch?.vel.y ?? 1)).toBeLessThan(1e-9); // horizontal, never upward

    // ...and the mirror image goes the other way.
    const other = restingSim();
    other.step(press(origin));
    other.step({ down: true, x: origin.x + 5, y: origin.y + 60 });
    expect(other.bubble.pullTheta).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('a pull inside the cone is valid and points where the finger says', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.step(pullTo(origin, 1, 40));

    expect(sim.bubble.aimValid).toBe(true);
    expect(sim.bubble.pullTheta).toBeCloseTo((40 * Math.PI) / 180, 9);
    expect(sim.bubble.pullDist).toBeCloseTo(t.PULL_MAX_PX, 9);
  });

  it('measures the pull from the FROZEN origin: a still finger is a still shot while Bur drifts', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 5;
    const origin = vec(90, 300);
    sim.step(press(origin));
    const finger = pullTo(origin, 1, 20);

    sim.step(finger);
    const theta = sim.bubble.pullTheta;
    const start = { ...sim.bubble.pos };
    expect(theta).toBeGreaterThan(0);

    for (let i = 0; i < 20; i++) {
      sim.step(finger);
      expect(sim.bubble.pullTheta).toBe(theta);
      expect(sim.bubble.pullDist).toBeCloseTo(t.PULL_MAX_PX, 9);
    }
    // The test is only meaningful because Bur moved: an air aim gets the full buoyancy (D2).
    expect(sim.bubble.pos.y).toBeLessThan(start.y - 0.5);
  });

  it('launches by ASSIGNMENT: two full pulls in a row give one impulse, never their sum (§2.2)', () => {
    const sim = restingSim();
    const first = vec(90, 300);
    sim.step(press(first));
    sim.run_(100, pullTo(first, 1));
    sim.step(POINTER_UP);

    const speed1 = lastLaunchSpeed(sim);
    expect(speed1).toBeCloseTo(FULL_IMPULSE, 9);
    expect(sim.bubble.state).toBe('LAUNCHED');

    // Wait out the launch lock, then spend the double jump on a second full pull in mid-air.
    sim.run_(400);
    const second = vec(90, 400);
    sim.step(press(second));
    sim.run_(100, pullTo(second, 1));
    sim.step(POINTER_UP);

    expect(lastLaunchSpeed(sim)).toBeCloseTo(FULL_IMPULSE, 9);
    expect(lastLaunchSpeed(sim)).toBeLessThan(speed1 * 1.5);
    expect(sim.of('launch')).toHaveLength(2);
  });

  it('reports power, the assigned velocity and airLaunch in the launch event', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(100, pullTo(origin, 1, 20));
    sim.step(POINTER_UP);

    const [launch] = sim.of('launch');
    expect(launch?.power).toBe(1);
    expect(launch?.airLaunch).toBe(false);
    expect(speed(launch?.vel ?? vec())).toBeCloseTo(FULL_IMPULSE, 9);
    expect(sim.bubble.lastLaunchPower).toBe(1);
    // Inside the cone and always DOWNWARD (D2: never launch upward).
    expect(sim.bubble.vel.y).toBeGreaterThan(0);
    expect(sim.bubble.vel.x).toBeGreaterThan(0);
    expect(Math.abs(sim.bubble.pullTheta)).toBeLessThanOrEqual((t.AIM_CONE_DEG * Math.PI) / 180 + 1e-12);
  });

  it('applies stun, force-field and sticky multipliers to the impulse (§11.4)', () => {
    const stunned = restingSim();
    stunned.bubble.flags.stunUntil = 10_000;
    const origin = vec(90, 300);
    stunned.step(press(origin));
    stunned.run_(100, pullTo(origin, 1));
    stunned.step(POINTER_UP);
    expect(lastLaunchSpeed(stunned)).toBeCloseTo(FULL_IMPULSE * t.STUN_IMPULSE_MUL, 9);

    const field = restingSim();
    const env = createNeutralEnv();
    env.impulseMul = 0.4;
    env.chargeMul = 0.75;
    field.env = env;
    field.step(press(origin));
    field.run_(100, pullTo(origin, 1));
    field.step(POINTER_UP);
    expect(lastLaunchSpeed(field)).toBeCloseTo(FULL_IMPULSE * 0.4 * 0.75, 9);
  });

  it('AIM_MAX_MS CANCELS the shot; it never fires it (D2)', () => {
    const sim = restingSim({ maxRestMs: 60_000 });
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(t.AIM_MAX_MS, pullTo(origin, 1));

    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'timeout' }]);
    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.bubble.vel).toEqual({ x: 0, y: 0 });
  });

  it('the finger that timed out cannot open a second aim without lifting', () => {
    const sim = restingSim({ maxRestMs: 60_000 });
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(t.AIM_MAX_MS + 2000, pullTo(origin, 1));

    expect(sim.of('aimStart')).toHaveLength(1);
    expect(sim.of('aimCancel')).toHaveLength(1);
    expect(sim.of('launch')).toHaveLength(0);

    sim.step(POINTER_UP);
    sim.step(press(origin));
    expect(sim.of('aimStart')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
// The mid-air launch ("double jump", D1)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — the mid-air launch (D1)', () => {
  /** Bur adrift in open water with `air` pips and a fresh airborne phase. */
  function airborne(air: number): Sim {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = air;
    return sim;
  }

  it('costs exactly one pip and reports itself as an air launch', () => {
    const sim = airborne(5);
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(100, pullTo(origin, 1));
    sim.step(POINTER_UP);

    expect(sim.bubble.air).toBe(4);
    const [lost] = sim.of('airLost');
    expect(lost?.reason).toBe('airLaunch');
    expect(lost?.air).toBe(4);
    // Charged where the shot left, which is the point the launch event reports too.
    expect(lost?.at).toEqual(sim.of('launch')[0]?.at);
    expect(sim.of('launch')[0]?.airLaunch).toBe(true);
    expect(sim.bubble.airLaunchesUsed).toBe(1);
    expect(sim.bubble.state).toBe('LAUNCHED');
    expect(lastLaunchSpeed(sim)).toBeCloseTo(FULL_IMPULSE, 9);
  });

  it('is a price, not a blow: no invulnerability, no stun, no broken bounce chain', () => {
    const sim = airborne(5);
    sim.bubble.bounceChain = 3;
    sim.bubble.bounceChainBodies.push('a', 'b', 'c');
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(100, pullTo(origin, 1));
    sim.step(POINTER_UP);

    expect(sim.bubble.flags.invulnUntil).toBe(0);
    expect(sim.bubble.flags.stunUntil).toBe(0);
    expect(sim.bubble.bounceChain).toBe(3);
  });

  it('is refused on the last pip: the touch does nothing at all', () => {
    const sim = airborne(t.AIR_LAUNCH_COST);
    const before = sim.bubble.state;
    sim.run_(300, press(vec(90, 300)));

    expect(canAirLaunch(sim.bubble, t)).toBe(false);
    expect(sim.bubble.state).toBe(before);
    expect(sim.bubble.aimOrigin).toBeNull();
    expect(sim.events).toHaveLength(0);
  });

  /**
   * D1 is a rule about the SHOT, not about the pointerdown: a gesture opened with the budget in hand
   * and released after a hazard (or §2.4.4's pressure clock) took the pip it was counting on asks for
   * exactly the launch "nunca está disponible con el último pip" forbids. The release is DECLINED —
   * and it says so, because by then the shell has been drawing a rubber band for six seconds.
   */
  it('declines the release when the pip the aim was counting on is gone by then', () => {
    const sim = airborne(t.AIR_LAUNCH_COST + 1);
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(160, pullTo(origin, 1));
    expect(sim.of('aimStart')).toHaveLength(1);

    sim.bubble.air = t.AIR_LAUNCH_COST; // the hazard connects mid-pull
    sim.step(POINTER_UP);

    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'noAir' }]);
    expect(sim.bubble.airLaunchesUsed).toBe(0);
    expect(sim.bubble.air).toBe(t.AIR_LAUNCH_COST); // and the refusal is not charged for either
    expect(sim.bubble.state).not.toBe('LAUNCHED');
  });

  /**
   * §2.4.5, §5 nº 7: the anemone is "recurso, NO muerte". A pinned Bur is held AGAINST a surface, so
   * her escape is a rest launch and not the mid-air correction D1 took away — which is what keeps a
   * crown met on the last pip survivable. `flags.trapVentAt` is the crown's own stamp (`hazards.ts`).
   */
  it('lets a Bur the anemone holds shoot her way out on her last pip, free', () => {
    const sim = airborne(t.AIR_LAUNCH_COST);
    sim.bubble.flags.trapVentAt = sim.nowMs + t.TRAP_VENT_MS;
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(160, pullTo(origin, 1));
    sim.step(POINTER_UP);

    const launch = sim.of('launch')[0];
    expect(launch?.type === 'launch' && launch.airLaunch).toBe(false);
    expect(launch?.type === 'launch' && launch.power).toBeGreaterThanOrEqual(0.6);
    expect(sim.bubble.air).toBe(t.AIR_LAUNCH_COST);
    expect(sim.bubble.airLaunchesUsed).toBe(0);
    expect(sim.of('restRelease')).toHaveLength(0); // there was no ledge to release
  });

  it('is refused once AIR_LAUNCHES_MAX have been spent in the same airborne phase', () => {
    const sim = airborne(8);
    for (let i = 0; i < t.AIR_LAUNCHES_MAX; i++) {
      const origin = vec(90, 300 + i * 10);
      sim.step(press(origin));
      sim.run_(100, pullTo(origin, 1));
      sim.step(POINTER_UP);
      sim.run_(t.LAUNCH_LOCK_MS + 100);
    }
    expect(sim.bubble.airLaunchesUsed).toBe(t.AIR_LAUNCHES_MAX);
    const launches = sim.of('launch').length;
    const air = sim.bubble.air;

    sim.clearEvents();
    sim.run_(300, press(vec(90, 500)));
    sim.step(POINTER_UP);

    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.of('launch').length + launches).toBe(launches);
    expect(sim.bubble.air).toBe(air);
    expect(sim.events).toHaveLength(0);
  });

  it('refills on a rest capture: the budget is per AIRBORNE PHASE, not per life', () => {
    const sim = approachSim(-200);
    sim.bubble.airLaunchesUsed = t.AIR_LAUNCHES_MAX;
    sim.step();
    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.bubble.airLaunchesUsed).toBe(0);
    expect(canAirLaunch(sim.bubble, t)).toBe(true);
  });

  it('an aim captured by a ledge mid-flight stops being an air launch and stops costing', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(90, 121), [slab]);
    sim.bubble.air = 5;
    const origin = vec(90, 300);
    sim.step(press(origin));
    const finger = pullTo(origin, 1);
    for (let i = 0; i < 200 && sim.bubble.restingOnId === null; i++) sim.step(finger);
    expect(sim.bubble.restingOnId).toBe('ceil');

    sim.step(finger); // the gesture resumes from the ledge, never restarted
    expect(sim.bubble.state).toBe('AIMING');
    expect(sim.of('aimStart')).toHaveLength(1);

    sim.step(POINTER_UP);
    expect(sim.of('launch')[0]?.airLaunch).toBe(false);
    expect(sim.bubble.air).toBe(5);
    expect(sim.bubble.airLaunchesUsed).toBe(0);
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
    sim.bubble.air = 5;
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(100, pullTo(origin, 1));
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
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(100, pullTo(origin, 1));
    sim.step(POINTER_UP);

    expect(lastLaunchSpeed(sim)).toBeCloseTo(FULL_IMPULSE * t.REST_STICKY_IMPULSE_MUL, 9);
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'launch' }]);
    expect(sim.bubble.state).toBe('LAUNCHED');
    expect(sim.bubble.restingOnId).toBeNull();
  });

  it('launches from a firm ceiling at full strength', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(100, pullTo(origin, 1));
    sim.step(POINTER_UP);
    expect(lastLaunchSpeed(sim)).toBeCloseTo(FULL_IMPULSE, 9);
  });

  it('stays pinned while aiming from rest (D2: pos pinned, vel 0)', () => {
    const sim = restingSim();
    const pos = { ...sim.bubble.pos };
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(600, pullTo(origin, 1));

    expect(sim.bubble.state).toBe('AIMING');
    expect(sim.bubble.pos).toEqual(pos);
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
    sim.clearEvents();
    sim.run_(5000, press(vec(90, 300))); // pressing does nothing at all
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
      // A roof above the start: since D1 a Bur adrift in open water has exactly one shot, so a world
      // with nothing to rise into would park her at the top and never exercise RESTING again.
      ceiling('c0', { x: 20, y: 120, w: 140, h: 10 }),
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

    // A press freezes an origin and then HOLDS a pull: a finger that never moved off its own origin
    // is a cancel every time (D2), and would never exercise the launch half of the machine.
    let pointer: PointerInput = POINTER_UP;
    let anchor: Vec2 | null = null;
    let pull = { x: 0, y: 0 };
    for (let i = 0; i < 6000; i++) {
      if (rng.next() < 0.02) {
        if (pointer.down) {
          pointer = POINTER_UP;
          anchor = null;
        } else {
          anchor = { x: sim.bubble.pos.x + (rng.next() - 0.5) * 120, y: sim.bubble.pos.y + (rng.next() - 0.5) * 160 };
          pull = { x: (rng.next() - 0.5) * 160, y: (rng.next() - 0.5) * 160 };
          pointer = { down: true, x: anchor.x, y: anchor.y };
        }
      } else if (anchor !== null) {
        pointer = { down: true, x: anchor.x + pull.x, y: anchor.y + pull.y };
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

    expect(states.has('AIMING')).toBe(true);
    expect(states.has('LAUNCHED')).toBe(true);
    expect(states.has('RESTING')).toBe(true);
    expect([...states].every((s) => ['IDLE', 'AIMING', 'LAUNCHED', 'RESTING', 'DEAD'].includes(s))).toBe(true);
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

describe('pullPower agreement', () => {
  it('the launch power is exactly the D2 ratio of the pull the finger was holding', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(200, pullTo(origin, 0.4));
    const pulled = sim.bubble.pullDist;
    sim.step(POINTER_UP);
    expect(sim.bubble.lastLaunchPower).toBeCloseTo(pullPower(pulled, t), 12);
    expect(sim.bubble.lastLaunchPower).toBeCloseTo(0.4, 9);
  });
});

// ---------------------------------------------------------------------------------------------
// One finger contact = one gesture (D2: the AIM_MAX_MS cancel does not re-arm)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — a gesture ends with the finger, not with the timeout (D2)', () => {
  /**
   * The aim timeout fires with the finger still on the glass. Deriving the press edge from the state
   * would read the very next step as a brand-new pointerdown and open a second aim: a second
   * `aimStart`, and — in the water — a second pip spent on a shot nobody asked for.
   */
  it('does not open a second aim under a finger that never lifted', () => {
    const sim = restingSim({ maxRestMs: 60_000 });
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(t.AIM_MAX_MS + 3000, pullTo(origin, 1));

    expect(sim.of('aimStart')).toHaveLength(1);
    expect(sim.of('aimCancel')).toHaveLength(1);
    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.bubble.state).toBe('RESTING');
  });

  /** D1, taken literally: a refused air touch is not a gesture, so it does not burn the contact. */
  it('a touch refused in the air becomes an aim the moment Bur lands, without lifting', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(90, 121), [slab]);
    sim.bubble.air = t.AIR_LAUNCH_COST; // last pip: no double jump
    const finger = press(vec(90, 300));

    sim.step(finger);
    expect(sim.bubble.state).toBe('IDLE');
    expect(sim.events).toHaveLength(0);

    for (let i = 0; i < 200 && sim.bubble.restingOnId === null; i++) sim.step(finger);
    expect(sim.bubble.restingOnId).toBe('ceil');

    sim.step(finger);
    expect(sim.bubble.state).toBe('AIMING');
    expect(sim.of('aimStart')).toHaveLength(1);
  });

  it('re-arms the gesture only after a real release', () => {
    const sim = restingSim({ maxRestMs: 60_000 });
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(t.AIM_MAX_MS + 200, pullTo(origin, 1));
    expect(sim.of('aimStart')).toHaveLength(1);

    sim.step(POINTER_UP);
    sim.step(press(origin));
    sim.run_(100, pullTo(origin, 1));
    sim.step(POINTER_UP);

    expect(sim.of('aimStart')).toHaveLength(2);
    expect(sim.of('launch')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// The anti-camping clock while aiming (§2.3 as revised by D2)
// ---------------------------------------------------------------------------------------------

describe('stepBubble — the rest clock while Bur aims (D2)', () => {
  /** "El temporizador anti-camping del posadero se congela" — 4 s of aiming on a 3 s ledge. */
  it('FREEZES the posadero clock while Bur aims: four seconds on a three-second ledge', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(4000, pullTo(origin, 1));

    expect(sim.bubble.state).toBe('AIMING');
    expect(sim.bubble.restingOnId).toBe('ceil');
    expect(sim.bubble.restMs).toBeLessThan(t.REST_MAX_MS.posadero);
    expect(sim.of('restRelease')).toHaveLength(0);
  });

  /**
   * ...and the freeze is a LOAN: a gesture that ends without a shot pays its time back to the ledge,
   * so a rest lasts at most REST_MAX_MS + AIM_MAX_MS however the finger drums (see `cancelAim`).
   */
  it('charges a cancelled aim back to the posadero clock, so the ledge expires sooner, not later', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(2000, { down: true, x: origin.x + 3, y: origin.y }); // cancel zone: release takes no shot
    sim.step(POINTER_UP);
    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'zone' }]);
    expect(sim.bubble.restMs).toBeGreaterThanOrEqual(2000);

    // Two of the posadero's three seconds went into the aim, so about one is left — not three.
    sim.run_(t.REST_MAX_MS.posadero - 2000 + 100);
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'timeout' }]);
    expect(sim.bubble.vel.y).toBeGreaterThan(0); // downward, always (§2.3)
  });

  /** "Impaciente y pegajosa mantienen sus temporizadores propios corriendo: es su carácter." */
  it('does NOT freeze an impaciente ledge: it ejects Bur mid-aim and the shot is cancelled', () => {
    const sim = restingSim({ kind: 'impaciente' });
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(t.REST_MAX_MS.impaciente + 100, pullTo(origin, 1));

    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'timeout' }]);
    expect(sim.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'displaced' }]);
    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.bubble.state).not.toBe('AIMING');
    expect(sim.bubble.aimOrigin).toBeNull();
  });

  it('cancels the aim when the ledge stops existing under it', () => {
    const sim = restingSim({ maxRestMs: 60_000 });
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.step(pullTo(origin, 1));
    sim.solids = [];
    sim.step(pullTo(origin, 1));

    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'displaced' }]);
    expect(sim.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'displaced' }]);
    expect(sim.bubble.state).toBe('IDLE');
  });

  /** A pull that overstays a frozen clock still fires; the launch is what ends the attachment. */
  it('lets a long aim launch instead of ejecting it', () => {
    const sim = restingSim();
    sim.run_(t.REST_MAX_MS.posadero - 500);
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(1200, pullTo(origin, 1));
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
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(2000, pullTo(origin, 1));

    expect(sim.bubble.state).toBe('AIMING');
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

describe('stepBubble — capture during an in-air aim (§11.3, D1)', () => {
  /**
   * Aiming in the water is the D1 double jump, and buoyancy still lifts Bur at full strength, so an
   * aim opened under a ledge ends in a slow ascending contact that §2.3 captures. The capture
   * attaches her; it does not end the gesture, so the pull she is holding survives and launches from
   * the ledge with the rules of that ledge (here `pegajosa`: 60 % of impulse) — and for free.
   */
  it('keeps the pull and launches it from the ledge, at the ledge price', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 }, { kind: 'pegajosa' });
    const sim = new Sim(vec(90, 121), [slab]);
    sim.bubble.air = 5;
    const origin = vec(90, 300);
    sim.step(press(origin));
    const finger = pullTo(origin, 1);

    for (let i = 0; i < 200 && sim.bubble.restingOnId === null; i++) sim.step(finger);
    expect(sim.bubble.restingOnId).toBe('ceil');
    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.bubble.pullDist).toBeCloseTo(t.PULL_MAX_PX, 9);

    sim.step(finger); // resumed, never restarted
    expect(sim.bubble.state).toBe('AIMING');
    expect(sim.of('aimStart')).toHaveLength(1);

    sim.step(POINTER_UP);
    expect(sim.bubble.lastLaunchPower).toBe(1);
    expect(lastLaunchSpeed(sim)).toBeCloseTo(FULL_IMPULSE * t.REST_STICKY_IMPULSE_MUL, 9);
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'launch' }]);
    expect(sim.bubble.air).toBe(5);
  });
});
