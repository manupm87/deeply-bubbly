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

/** A still finger straight below the point where the press started (neutral drag). */
function fingerAt(origin: Vec2): PointerInput {
  return { down: true, x: origin.x, y: origin.y + t.DRAG_NEUTRAL_PX };
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
// 1. §11.7.4 / §2.2 — the per-hold overcharge cap
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — overcharge cap across the auto-release (§2.2, §11.7.4)', () => {
  /**
   * §2.2: "la sobrecarga (…) nunca drena más de 2 pips en un mismo mantenido", justified in the same
   * paragraph by the exact scenario this test plays: "un niño que mantiene el dedo 3,4 s —exactamente
   * lo que enseña la mano fantasma del tutorial— se quedaba sin aire de una sentada". §11.7.4 repeats
   * it as a contract: "nunca drena más de 2 en un mismo mantenido".
   *
   * The finger never lifts, so this is ONE `mantenido`. What the implementation sees is different:
   * `stepCharging` auto-releases at AUTO_RELEASE_MS, `launch` leaves LAUNCHED after LAUNCH_LOCK_MS,
   * and then the input-edge rule ("a press is honoured from IDLE" — the state IS the previous pointer
   * sample) starts a BRAND NEW hold under the same, still-pressed finger. `beginCharge` resets
   * `overchargeDrained` to 0, so the cap re-arms every 2.750 ms and the drain is unbounded in a hold
   * of unbounded length: 4 pips at 5 s, 6 at 7,75 s, out of a maximum of 8.
   *
   * The existing test "never drains more than OVERCHARGE_MAX_DRAIN in one hold" holds for exactly
   * AUTO_RELEASE_MS and stops on the boundary, one step before the second hold begins, so it passes
   * without ever exercising the rule it names.
   */
  it('a single uninterrupted 5 s press drains at most OVERCHARGE_MAX_DRAIN pips', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const origin = { ...sim.bubble.pos };

    sim.run_(5000, fingerAt(origin)); // the finger is down on every single step

    expect(sim.of('airLost').map((e) => e.reason)).toEqual(['overcharge', 'overcharge']);
    expect(sim.bubble.air).toBe(8 - t.OVERCHARGE_MAX_DRAIN);
  });

  /**
   * The other half of the same defect, on the event stream the shell draws from: one press must
   * produce one `chargeStart`. Here the finger is never lifted and the module reports two charges
   * (and one launch the player never asked for), so the HUD's charge ring and the aiming guide
   * restart mid-gesture.
   */
  it('one press produces one chargeStart, however long it lasts (§2.1)', () => {
    const sim = new Sim(vec(90, 200));
    sim.bubble.air = 8;
    const origin = { ...sim.bubble.pos };

    sim.run_(5000, fingerAt(origin));

    expect(sim.of('chargeStart')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. §2.3 — the anti-camping timer must keep running while Bur aims from rest
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — rest timer while charging from rest (§2.3, §11.3)', () => {
  /**
   * §2.3 fixes the budget explicitly: "En reposo, Bur puede cargar hasta 1.800 ms antes de entrar en
   * sobrecarga (…). Con el temporizador de reposo de 3,0 s, eso deja presupuesto de puntería de sobra
   * SIN NECESIDAD DE QUITAR EL ANTI-CAMPING." That sentence only means anything if `restMs` keeps
   * running while the player aims: 1.800 < 3.000 is the whole argument.
   *
   * `stepResting` runs only while `state === 'RESTING'`, and a charge from rest is CHARGING, so the
   * timer stops dead. Drumming the finger — press, press, press, lift, repeat, which is exactly what a
   * child does while deciding where to shoot — keeps Bur glued under the same ledge for 12 s instead of
   * 3 s. The anti-camping rule the GDD says it did not have to remove is removed in practice.
   */
  it('ejects Bur within REST_MAX_MS of wall-clock time even if she is aiming (finger drumming)', () => {
    const sim = restingSim();
    const origin = { ...sim.bubble.pos };
    const finger = fingerAt(origin);

    // 3 pressed steps + 1 released step, forever: every press is under MIN_TAP_MS, so nothing launches.
    for (let cycle = 0; cycle < 1200 && sim.of('restRelease').length === 0; cycle++) {
      for (let i = 0; i < 3; i++) sim.step(finger);
      sim.step(POINTER_UP);
    }

    expect(sim.of('launch')).toHaveLength(0); // no tap was long enough to fire: this is pure camping
    expect(sim.of('restRelease')).toEqual([{ type: 'restRelease', reason: 'timeout' }]);
    expect(sim.nowMs).toBeLessThanOrEqual(t.REST_MAX_MS.posadero + 4 * STEP_MS);
  });

  /**
   * The same rule with one single, ordinary hold: rest for 2,5 s, then aim for 1,8 s (the budget §2.3
   * grants). The anti-camping push is due at 3,0 s of contact and never arrives, because the clock is
   * frozen for the whole aim.
   */
  it('keeps counting rest time during a single 1.800 ms aim (§2.3 budget argument)', () => {
    const sim = restingSim();
    sim.run_(2500);
    expect(sim.bubble.state).toBe('RESTING');

    const origin = { ...sim.bubble.pos };
    sim.run_(t.OVERCHARGE_MS_RESTING, fingerAt(origin));

    expect(sim.bubble.restMs).toBeGreaterThanOrEqual(t.REST_MAX_MS.posadero);
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
// 4. §11.3 — capturing mid-charge throws the player's hold away
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — capture while CHARGING in mid-water (§11.3, §2.1)', () => {
  /**
   * Charging in the air is explicitly legal (§2.1, §11.3: "Se puede entrar desde IDLE (cargar en el
   * aire, permitido y necesario para corregir)") and buoyancy still lifts Bur at 35 %. So a hold that
   * starts under a ledge ends with an ascending contact against a capturable bottom face — at ~10 px/s,
   * far below REST_CAPTURE_SPEED, so §2.3 captures it.
   *
   * The implementation turns CHARGING into RESTING keeping `chargeMs` and `aimOrigin`, and then, on
   * the very next step, the input-edge rule sees "pointer down + RESTING" and calls `beginCharge`,
   * which throws 500 ms of accumulated power away and emits a SECOND `chargeStart` for a finger that
   * never left the glass. The player who charged a full shot under a ledge fires a dry tap.
   *
   * §11.3 is explicit that "las transiciones son la especificación completa del control; no existe
   * ninguna otra ruta", and it has no CHARGING → RESTING arrow. Whichever way it is resolved (keep the
   * hold across the capture, or refuse to capture while charging), silently zeroing the hold is not it.
   */
  it('does not discard the accumulated hold when Bur is captured mid-charge', () => {
    const slab = ceiling('ceil', { x: 60, y: 100, w: 60, h: 10 });
    const sim = new Sim(vec(90, 121), [slab]);
    const origin = { ...sim.bubble.pos };
    const finger = fingerAt(origin);

    let heldAtCapture = 0;
    for (let i = 0; i < 200; i++) {
      sim.step(finger);
      if (sim.bubble.state === 'RESTING') {
        heldAtCapture = sim.bubble.chargeMs;
        break;
      }
    }
    expect(heldAtCapture).toBeGreaterThan(400); // half a second of charge was in the bank

    sim.step(finger);
    expect(sim.bubble.chargeMs).toBeGreaterThanOrEqual(heldAtCapture);
    expect(sim.of('chargeStart')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// 5. §2.3 — the pressure clock while attached to a ceiling
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — pressure drain while charging from rest (§2.3, §2.4.4)', () => {
  /**
   * §2.3: "El drenaje pasivo de Aire por presión SE CONGELA MIENTRAS DURA EL REPOSO; es un alivio
   * pequeño y honesto (a lo sumo 3 s de un reloj de 25 s)". The freeze is keyed on `state === 'RESTING'`
   * only, but the natural thing to do while resting is to aim, and aiming is CHARGING — so the relief
   * the GDD budgets at "up to 3 s" is worth ~0 s in practice.
   *
   * The module already treats a charge from rest AS rest everywhere else (pinned position, 1.800 ms
   * overcharge threshold, REST_STICKY_IMPULSE_MUL on the launch, `restingOnId` still set): this clock
   * is the one place the same situation is classified the other way.
   */
  it('freezes the Z5–Z6 pressure clock for as long as Bur is attached to the ceiling', () => {
    const sim = restingSim({ maxRestMs: 60_000 });
    sim.zone = 5;
    sim.bubble.air = 6;
    const origin = { ...sim.bubble.pos };

    sim.run_(2000, fingerAt(origin));

    expect(sim.bubble.state).toBe('CHARGING');
    expect(sim.bubble.restingOnId).toBe('ceil');
    expect(sim.bubble.pressureDrainMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Event contract — no air is ever lost to overcharge without the warning that precedes it
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — overchargeStart is the only tell for the drain (§2.2)', () => {
  /**
   * `overchargeStart` is the shell's cue for the "estás sobrecargando" feedback, and §2.2 sells the
   * overcharge as a *communicated* cost ("no arruina el tiro: fuga aire lentamente"), never a silent
   * one. The event is emitted only on the step where `chargeMs` crosses the threshold — but the
   * threshold itself MOVES: it is 1.800 ms while `restingOnId` is set and 900 ms once it is not.
   *
   * Marine snow dissolving (§5), a boss slab moving away or the streamer dropping the chunk all clear
   * `restingOnId` mid-hold (`detachRest(… 'displaced')`). A hold already past 900 ms then jumps
   * straight into overcharge with `previousChargeMs > threshold`, so the tell never fires and Bur
   * quietly vents a pip 500 ms later.
   */
  it('emits overchargeStart before any overcharge pip is spent', () => {
    const sim = restingSim();
    sim.bubble.air = 5;
    const origin = { ...sim.bubble.pos };
    const finger = fingerAt(origin);

    sim.run_(1200, finger); // past OVERCHARGE_MS, still inside the 1.800 ms rest budget
    expect(sim.of('overchargeStart')).toHaveLength(0);

    sim.solids = []; // the ceiling dissolves under her: the threshold drops to 900 ms
    sim.run_(700, finger);

    expect(sim.of('airLost')).toHaveLength(1); // it does vent a pip
    expect(sim.of('overchargeStart')).toHaveLength(1); // …with no warning at all
  });
});
