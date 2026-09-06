/**
 * ADVERSARIAL tests for bubble/bubbleStep.ts.
 *
 * Every test in this file FAILS against the current implementation and documents a deviation from the
 * GDD. None of them is a style opinion: each one is a rule §2 or §11 states in a sentence, exercised
 * with an input a seven-year-old produces on purpose (keeping the finger down, drumming it, floating
 * up into the corner of a ledge).
 */
import { describe, expect, it } from 'vitest';
import { vec } from '../math/vec';
import { createTuning } from '../tuning';
import { NEUTRAL_ENV } from '../physics/forceFields';
import { createBubble, stepBubble } from './bubbleStep';
import type { BubbleStepResult } from './bubbleStep';
import type { Vec2 } from '../math/vec';
import type { ReadonlyPhysicsEnv } from '../physics/forceFields';
import type { Bubble, Ceiling, GameEvent, PointerInput, RunState, SolidEntity, ZoneIndex } from '../types';

const t = createTuning();
const STEP_MS = t.FIXED_DT * 1000;
const POINTER_UP: PointerInput = { down: false, x: 0, y: 0 };

// ---------------------------------------------------------------------------------------------
// Harness (same shape as bubbleStep.test.ts: one slab, fixed steps, simulation time owned here)
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

function ceiling(
  id: string,
  rect: { x: number; y: number; w: number; h: number },
  overrides: Partial<Ceiling> = {},
): Ceiling {
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

class Sim {
  readonly bubble: Bubble;
  readonly run: RunState;
  solids: SolidEntity[];
  readonly events: GameEvent[] = [];
  nowMs = 0;
  zone: ZoneIndex = 0;
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
        currentChunkId: 'chunk-a',
      },
      t,
    );
    this.events.push(...result.events);
    this.nowMs += STEP_MS;
    return result;
  }

  run_(ms: number, pointer: PointerInput = POINTER_UP): void {
    const steps = Math.round(ms / STEP_MS);
    for (let i = 0; i < steps; i++) this.step(pointer);
  }

  of<K extends GameEvent['type']>(type: K): Extract<GameEvent, { type: K }>[] {
    return this.events.filter((e): e is Extract<GameEvent, { type: K }> => e.type === type);
  }
}

/** The pointer that opens a gesture: `aimOrigin` freezes exactly here (D2). */
function press(at: Vec2): PointerInput {
  return { down: true, x: at.x, y: at.y };
}

/** A still finger holding the sling at full stretch for a straight-down shot (D2: the pull is UP). */
function pullTo(origin: Vec2): PointerInput {
  return { down: true, x: origin.x, y: origin.y - t.PULL_MAX_PX };
}

/** Bur captured under a 60x10 slab at (60,100), one RESTING step already served. */
function restingSim(overrides: Partial<Ceiling> = {}): Sim {
  const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 }, overrides);
  const sim = new Sim(vec(90, 118), [slab]);
  sim.bubble.vel = { x: 0, y: -200 };
  sim.step();
  if (sim.bubble.state !== 'RESTING') throw new Error('harness: capture failed');
  return sim;
}

/** Distance from Bur's centre to the nearest point of a rect (0 = centre inside it). */
function gapTo(p: Vec2, rect: { x: number; y: number; w: number; h: number }): number {
  const nx = Math.min(Math.max(p.x, rect.x), rect.x + rect.w);
  const ny = Math.min(Math.max(p.y, rect.y), rect.y + rect.h);
  return Math.hypot(p.x - nx, p.y - ny);
}

// ---------------------------------------------------------------------------------------------
// 1. D1 / D2 — one gesture per finger contact, and the double-jump budget
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — one contact never buys two shots (D1, D2)', () => {
  /**
   * D2's aim timeout fires with the finger still on the glass. If the press EDGE were derived from
   * the state instead of from `holdLatched`, the very next step would look like a fresh pointerdown:
   * a second `aimStart`, a second shot and — in open water — a second pip off the bar, from a finger
   * the player never lifted. The cap of "un doble salto por fase aérea" would be a suggestion.
   */
  it('a single uninterrupted 20 s press in the water spends at most one air launch', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const origin = vec(90, 400);

    sim.step(press(origin));
    sim.run_(20_000, pullTo(origin)); // the finger is down on every single step

    expect(sim.of('aimStart')).toHaveLength(1);
    expect(sim.of('launch')).toHaveLength(0); // the timeout CANCELS; it never fires (D2)
    expect(sim.of('airLost')).toHaveLength(0);
    expect(sim.bubble.air).toBe(8);
    expect(sim.bubble.airLaunchesUsed).toBe(0);
  });

  /**
   * The same defect on the event stream the shell draws from: one press must produce one `aimStart`,
   * or the HUD ring and the dotted guide restart mid-gesture under a motionless thumb.
   */
  it('one press produces one aimStart, however long it lasts (D2)', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const origin = vec(90, 400);

    sim.step(press(origin));
    sim.run_(20_000, pullTo(origin));

    expect(sim.of('aimStart')).toHaveLength(1);
  });

  /**
   * D1 prices the double jump at a pip and forbids the last one. A player who presses, releases and
   * presses again in the SAME airborne phase must be refused by the budget, not by the bar: without
   * `airLaunchesUsed` a five-pip Bur could stack four mid-air shots and cross the whole immersion.
   */
  it('refuses the second mid-air launch of one airborne phase, whatever the bar says', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;

    for (let i = 0; i < 5; i++) {
      const origin = vec(90, 400 + i * 20);
      sim.step(press(origin));
      sim.run_(120, pullTo(origin));
      sim.step(POINTER_UP);
      sim.run_(t.LAUNCH_LOCK_MS + 100);
    }

    expect(sim.of('launch')).toHaveLength(t.AIR_LAUNCHES_MAX);
    expect(sim.bubble.air).toBe(8 - t.AIR_LAUNCHES_MAX * t.AIR_LAUNCH_COST);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. §2.3 / D2 — the frozen posadero clock must not become a camping spot
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — camping under a ledge with a drumming finger (§2.3, D2)', () => {
  /**
   * D2 freezes the posadero anti-camping clock while Bur aims, and that is exactly the shape of rule
   * that can be farmed: press, cancel, press, cancel — which is precisely what a child does while
   * deciding where to shoot. Two guards make it finite and both must hold. AIM_MAX_MS bounds a single
   * aim at 6 s, and the clock RESUMES the moment the finger is up, so every cancel pays back some of
   * the ledge. What must never happen is Bur hanging there indefinitely.
   */
  it('still ejects Bur in bounded time under a drumming finger', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    // Press for 3 steps inside the cancel radius, lift for 1, forever: nothing ever launches.
    const nudge: PointerInput = { down: true, x: origin.x, y: origin.y - 4 };

    for (let cycle = 0; cycle < 4000 && sim.of('restRelease').length === 0; cycle++) {
      sim.step(press(origin));
      for (let i = 0; i < 2; i++) sim.step(nudge);
      sim.step(POINTER_UP);
    }

    expect(sim.of('launch')).toHaveLength(0); // pure camping: every release was a cancel
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'timeout' }]);
    // Four steps of wall clock buy one step of rest clock, so the eject is late but BOUNDED.
    expect(sim.nowMs).toBeLessThanOrEqual(t.REST_MAX_MS.posadero * 4 + 8 * STEP_MS);
  });

  /**
   * The other half: an aim that is never released must not hold the ledge for ever either. The aim
   * timeout is what bounds it, and after it the rest clock runs again on its own.
   */
  it('a single never-released aim is bounded by AIM_MAX_MS and then the ledge expires', () => {
    const sim = restingSim();
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(t.AIM_MAX_MS + t.REST_MAX_MS.posadero + 200, pullTo(origin));

    expect(sim.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'timeout' }]);
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'timeout' }]);
    expect(sim.of('launch')).toHaveLength(0);
  });

  /** An impaciente ledge keeps its own clock through the aim: that is its whole character (D2). */
  it('never freezes an impaciente ledge, aim or no aim', () => {
    const sim = restingSim({ kind: 'impaciente' });
    const origin = vec(90, 300);
    sim.step(press(origin));
    sim.run_(t.REST_MAX_MS.impaciente + 4 * STEP_MS, pullTo(origin));

    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'timeout' }]);
    expect(sim.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'displaced' }]);
    expect(sim.nowMs).toBeLessThan(t.REST_MAX_MS.impaciente + 7 * STEP_MS);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. §2.3 — capture on a corner leaves Bur resting on nothing
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — corner capture (§2.3, §11.4)', () => {
  /**
   * §2.3 captures "toda llegada a LA CARA INFERIOR de un techo capturable". `collision.ts` maps a
   * corner hit to the face its normal is closest to, so a circle that grazes the bottom-left corner of
   * a ledge from below and to the side reports `face: 'bottom'` with a tilted normal — and
   * `capturingCeiling` accepts it.
   *
   * `enterRest` then snaps ONLY the vertical axis: `pos.y = contact.point.y + radius`, where
   * `contact.point` is the CORNER, not a point on the face. Bur ends up beside the slab (x = 58,
   * slab starts at x = 60), 7,28 px from its nearest point with a radius of 7: she is resting on open
   * water. `pinToCeiling` then re-asserts that pose every step, so it is a permanent state, not a
   * transient — the exact failure mode the module's own comment says pinning exists to prevent
   * ("neither (…) can leave her hanging in open water").
   */
  it('never enters RESTING without actually touching the ceiling', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(58, 125), [slab]);
    sim.bubble.vel = { x: 0, y: -200 };

    for (let i = 0; i < 20 && sim.bubble.state !== 'RESTING'; i++) sim.step();
    expect(sim.bubble.state).toBe('RESTING'); // it does capture — on the corner

    sim.run_(200);
    expect(sim.bubble.state).toBe('RESTING');
    // Touching means the centre is at most one radius away from the body (plus collision slack).
    expect(gapTo(sim.bubble.pos, slab.rect)).toBeLessThanOrEqual(sim.bubble.radius + 1e-2);
  });

  /** And the horizontal half of the same snap: a rest pose is under the face, not off its edge. */
  it('pins Bur inside the horizontal extent of the ceiling she rests on', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(58, 125), [slab]);
    sim.bubble.vel = { x: 0, y: -200 };
    for (let i = 0; i < 20 && sim.bubble.state !== 'RESTING'; i++) sim.step();

    expect(sim.bubble.pos.x).toBeGreaterThanOrEqual(slab.rect.x);
    expect(sim.bubble.pos.x).toBeLessThanOrEqual(slab.rect.x + slab.rect.w);
  });
});

// ---------------------------------------------------------------------------------------------
// 4. §11.3 — capturing mid-aim must not throw the player's pull away
// ---------------------------------------------------------------------------------------------

describe("ADVERSARIAL — capture while AIMING in mid-water (§11.3, D1)", () => {
  /**
   * §11.3 says the state machine is "la especificación completa del control; no existe ninguna otra
   * ruta", and it has no AIMING → RESTING arrow that eats the gesture. Whichever way it is resolved
   * (keep the pull across the capture, or refuse to capture while aiming), silently discarding the
   * pull is not it — and under D1 it would be worse than in v1.1: the player would ALSO have been
   * charged nothing while losing the shot they were lining up.
   */
  it('does not discard the pull when Bur is captured mid-aim, and stops charging her for it', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(90, 121), [slab]);
    sim.bubble.air = 5;
    const origin = vec(90, 300);
    sim.step(press(origin));
    const finger = pullTo(origin);

    for (let i = 0; i < 200 && sim.bubble.state !== 'RESTING'; i++) sim.step(finger);
    expect(sim.bubble.state).toBe('RESTING');
    expect(sim.bubble.pullDist).toBeCloseTo(t.PULL_MAX_PX, 9);

    sim.step(finger);
    expect(sim.bubble.state).toBe('AIMING');
    expect(sim.bubble.pullDist).toBeCloseTo(t.PULL_MAX_PX, 9);
    expect(sim.of('aimStart')).toHaveLength(1);

    sim.step(POINTER_UP);
    expect(sim.of('launch')[0]?.airLaunch).toBe(false);
    expect(sim.bubble.air).toBe(5); // captured before the release: the double jump was never spent
  });
});

// ---------------------------------------------------------------------------------------------
// 5. §2.3 — the pressure clock while attached to a ceiling
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — pressure drain while aiming from rest (§2.3, §2.4.4)', () => {
  /**
   * §2.3 freezes the passive drain "mientras dura el reposo", and what Bur does while resting is aim.
   * Keying the freeze on `state === 'RESTING'` instead of on the attachment makes a Z5 player pay for
   * every second spent lining up a shot from a ledge she is demonstrably hanging from.
   */
  it('keeps the Z5 pressure clock frozen for the whole aim', () => {
    const sim = restingSim({ maxRestMs: 60_000 });
    sim.zone = 5;
    sim.bubble.air = 6;
    const origin = vec(90, 300);
    sim.step(press(origin));
    // The whole aim budget, which is what D2 lets a player spend lining a shot up from a ledge.
    sim.run_(t.AIM_MAX_MS - 200, pullTo(origin));

    expect(sim.bubble.state).toBe('AIMING');
    expect(sim.bubble.pressureDrainMs).toBe(0);
    expect(sim.of('airLost')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Event contract — a cancelled gesture is announced, and it is free
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — every gesture ends with exactly one event (D2)', () => {
  /**
   * The shell drives the charge ring, the guide and the sling SFX off this stream. A gesture that
   * ended without saying so leaves the ring drawn at full stretch over a Bur who is resting again;
   * one that ends twice restarts the sound. Every ending is one `launch` or one `aimCancel`.
   */
  it('ends a cancel, a timeout and a displacement with one aimCancel each, and no launch', () => {
    const zone = restingSim({ maxRestMs: 60_000 });
    const origin = vec(90, 300);
    zone.step(press(origin));
    zone.step({ down: true, x: origin.x, y: origin.y - 3 });
    zone.step(POINTER_UP);
    expect(zone.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'zone' }]);
    expect(zone.of('launch')).toHaveLength(0);

    const timeout = restingSim({ maxRestMs: 60_000 });
    timeout.step(press(origin));
    timeout.run_(t.AIM_MAX_MS + 500, pullTo(origin));
    expect(timeout.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'timeout' }]);
    expect(timeout.of('launch')).toHaveLength(0);

    const displaced = restingSim({ maxRestMs: 60_000 });
    displaced.step(press(origin));
    displaced.step(pullTo(origin));
    displaced.solids = [];
    displaced.step(pullTo(origin));
    expect(displaced.of('aimCancel')).toEqual([{ type: 'aimCancel', reason: 'displaced' }]);
    expect(displaced.of('launch')).toHaveLength(0);
  });

  /** A cancelled AIR aim must cost nothing: D2 says the cancel is free, in the water as on a ledge. */
  it('never charges a pip for a gesture that did not launch', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 5;
    const origin = vec(90, 400);
    for (let i = 0; i < 6; i++) {
      sim.step(press(origin));
      sim.step({ down: true, x: origin.x + 2, y: origin.y - 2 });
      sim.step(POINTER_UP);
    }
    expect(sim.bubble.air).toBe(5);
    expect(sim.bubble.airLaunchesUsed).toBe(0);
    expect(sim.of('aimCancel')).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------------------------
// 5. D1 — "nunca está disponible con el último pip" is a property of the RELEASE, not of the press
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — the double jump on the last pip (D1)', () => {
  /**
   * D1 states the rule without a time qualifier: the mid-air launch "cuesta 1 pip de Aire y NUNCA está
   * disponible con el último pip". `canAim` tests it at the pointerdown and nothing tests it again, so
   * a gesture opened while Bur could afford the shot survives losing the pip it was counting on: a
   * hazard (or, in Z5/Z6, the passive pressure clock of §2.4.4) takes her to one pip mid-aim and the
   * release still fires. `loseAir`'s floor then declines to charge for it, which turns the refusal into
   * a DISCOUNT — the one shot D1 says does not exist is granted, and granted free.
   *
   * That is not a rounding error in the economy: the whole point of the floor is that a player on her
   * last pip has no double jump to gamble with, so she must reach a ledge with the shot she already
   * took. Here she gets a second one, and the HUD (`airLaunchAvailable`) has already told her she has
   * none.
   */
  it('refuses to fire a mid-air launch the last pip cannot pay for', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 2; // Enough to open the gesture: AIR_LAUNCH_COST is 1 and 2 > 1.
    const origin = vec(90, 400);

    sim.step(press(origin));
    sim.run_(160, pullTo(origin));
    expect(sim.of('aimStart')).toHaveLength(1);

    // A hazard connects mid-pull and takes the pip the aim was counting on (this is exactly what
    // `loseAir` does to `bubble.air`; the geometry of the hit belongs to GameWorld and is not the
    // subject here). Bur is now on her LAST pip.
    sim.bubble.air = 1;
    sim.step(POINTER_UP);

    expect(sim.of('launch')).toHaveLength(0);
    expect(sim.bubble.airLaunchesUsed).toBe(0);
    expect(sim.bubble.air).toBe(1);
    expect(sim.bubble.state).not.toBe('LAUNCHED');
  });
});

// ---------------------------------------------------------------------------------------------
// 6. D2 × §2.3 × §2.4.4 — the aim freezes BOTH clocks, and one finger can renew it for ever
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — the frozen clocks of an aim are renewable (D2, §2.3, §2.4.4)', () => {
  /**
   * D2 freezes the posadero's anti-camping clock while Bur aims and argues the freeze is bounded:
   * "AIM_MAX_MS bounds that at 6 s, and the same finger cannot open a second aim without lifting".
   * Lifting costs ONE frame. The loop is press → hold 6 s → the timeout cancels → lift for a single
   * step → press again, and it renews the freeze at a price of 16,7 ms of ledge per 6 s of camping: a
   * 3 s posadero survives about 18 minutes of it.
   *
   * On a Z5/Z6 ledge the same loop also parks §2.4.4's passive pressure drain, which `stepBubble`
   * freezes for as long as Bur is ATTACHED. That is the half that is not a matter of taste: "cada 25 s
   * sin tocar bolsa de aire pierdes 1 Aire" is the clock the two deepest zones are built around, and a
   * player who never lifts her thumb for more than a frame never pays it. The rule §2.3 states is
   * "nadie acampa"; a bound of 18 minutes is not one.
   *
   * The fix keeps the freeze D2 asks for and makes it a LOAN: `cancelAim` charges the frozen time back
   * to `restMs`, so only a gesture that actually LAUNCHES (and therefore leaves the ledge) escapes the
   * clock. Camping is then bounded by REST_MAX_MS + AIM_MAX_MS whatever the finger does, which is what
   * this test asserts — the loop runs until the ledge throws Bur off, and that has to happen inside
   * one posadero plus one aim, not eighteen minutes later.
   */
  it('bounds the drumming-finger loop at REST_MAX_MS + AIM_MAX_MS, ledge and pressure clock alike', () => {
    const slab = ceiling('deep-ledge', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(90, 124), [slab], 4);
    sim.bubble.vel = { x: 0, y: -200 };
    for (let i = 0; i < 10 && sim.bubble.state !== 'RESTING'; i++) sim.step();
    expect(sim.bubble.state).toBe('RESTING');

    const origin = vec(90, 300);
    const restedAtMs = sim.nowMs;
    // "Thinking about the shot" for as long as the ledge allows: each cycle is a full aim, its
    // timeout, and the one frame off the glass that used to buy another six seconds.
    while (sim.nowMs < 60_000 && sim.of('restRelease').length === 0) {
      sim.step(press(origin));
      sim.run_(t.AIM_MAX_MS, pullTo(origin));
      sim.step(POINTER_UP);
    }

    expect(sim.of('launch')).toHaveLength(0); // Nothing was ever fired: this is pure camping.
    expect(sim.of('restRelease')).toHaveLength(1);
    // One aim's worth of freeze is all the ledge lends, and the eject is what un-parks §2.4.4's drain.
    expect(sim.nowMs - restedAtMs).toBeLessThanOrEqual(t.REST_MAX_MS.posadero + t.AIM_MAX_MS + 2 * 1000 * t.FIXED_DT);
  });
});
