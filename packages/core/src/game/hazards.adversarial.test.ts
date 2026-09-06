/**
 * Adversarial review of `game/hazards.ts` — the Anémona Pegajosa, the fifth way to lose Air.
 *
 * GDD §2.4 lists exactly five ways to lose Air and names this one: "Ventilación por atrapamiento →
 * la Anémona Pegajosa (§5, nº 7) es el único caso: atrapa 0,8 s, y si sigues dentro a los 1,5 s
 * ventila 1 Aire. **Escapar cuesta una carga del 60% o más (≈330 ms)**, que cabe holgadamente en la
 * ventana." §5 nº 7 repeats it: "Escapar cuesta una carga del 60% (≈330 ms), que cabe de sobra en la
 * ventana de 1,5 s: recurso, no muerte."
 *
 * Both sentences only mean something if staying inside is the DEFAULT and the 60 % charge is the ONLY
 * way out before the vent. The module contract says the same in one line: "while overlapping, pin Bur
 * (vel 0) ... escape = launch with power >= 0.6 (the launch clears the trap); if still trapped at
 * trapVentAt -> loseAir('trap'), release."
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { NEUTRAL_ENV } from '../physics/forceFields';
import { createBubble, stepBubble } from '../bubble/bubbleStep';
import { createRunState } from '../run/runState';
import { TRAP_ESCAPE_POWER, createTrapState, escapeTrap, stepHazards } from './hazards';
import { pullGesture } from './testHarness';
import type { GameEvent, Hazard, PointerInput, RunState } from '../types';
import type { TrapState } from './hazards';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;
const UP: PointerInput = { down: false, x: 0, y: 0 };

/** §5 nº 7 sized anemone: a small patch of sea floor, wide enough that Bur starts well inside it. */
const ANEMONE: Hazard = {
  type: 'hazard',
  id: 'anemone',
  catalogId: 7,
  shape: { x: 78, y: 92, w: 24, h: 16 },
  airCost: 1,
  pushDir: 'lateral',
  trap: true,
};

interface Run {
  bubble: ReturnType<typeof createBubble>;
  run: RunState;
  trap: TrapState;
  events: GameEvent[];
  /** Simulation time at which the 'trap' pip was charged, or -1. */
  ventedAtMs: number;
  /** Simulation time at which the trap let go of Bur, or -1. */
  freedAtMs: number;
}

/**
 * Bur caught in the anemone with her finger off the glass: she never charges, so §2.4.5 leaves her
 * exactly one outcome — the vent at TRAP_VENT_MS. Runs `stepBubble` then `stepHazards`, the same
 * order `GameWorld.step` uses.
 */
function sitInTheAnemone(steps: number): Run {
  const bubble = createBubble({ x: 90, y: 100 }, 0, T);
  const run = createRunState(1, 'expedicion');
  const trap = createTrapState();
  const events: GameEvent[] = [];
  let ventedAtMs = -1;
  let freedAtMs = -1;
  let nowMs = 0;

  for (let i = 0; i < steps; i++) {
    stepBubble(
      bubble,
      run,
      { pointer: UP, solids: [], env: NEUTRAL_ENV, zone: 0, nowMs, dt: T.FIXED_DT, currentChunkId: 'c' },
      T,
    );
    const stepped = stepHazards(bubble, run, trap, { hazards: [ANEMONE], nowMs }, T);
    events.push(...stepped.events);
    if (ventedAtMs < 0 && stepped.events.some((e) => e.type === 'airLost' && e.reason === 'trap')) {
      ventedAtMs = nowMs;
    }
    if (freedAtMs < 0 && i > 0 && trap.hazardId === null) freedAtMs = nowMs;
    nowMs += STEP_MS;
  }
  return { bubble, run, trap, events, ventedAtMs, freedAtMs };
}

describe('anemone trap (GDD §2.4.5, §5 nº 7)', () => {
  it('holds Bur past TRAP_HOLD_MS: she cannot float out for free before the vent', () => {
    // TRAP_HOLD_MS is 800 ms and TRAP_VENT_MS is 1.500 ms. Buoyancy alone lifts Bur ~21 px in the
    // 700 ms between the two, which is more than enough to leave a 16 px anemone: if the pin stops at
    // TRAP_HOLD_MS, the trap releases her at no cost and "escapar cuesta una carga del 60%" is false.
    const held = sitInTheAnemone(Math.ceil((T.TRAP_VENT_MS - 1) / STEP_MS));
    expect(held.trap.hazardId).toBe('anemone');
    expect(held.freedAtMs).toBe(-1);
  });

  it('vents exactly one pip at TRAP_VENT_MS when the player never pays the 60 % charge', () => {
    const held = sitInTheAnemone(Math.ceil((T.TRAP_VENT_MS + 500) / STEP_MS));

    expect(held.ventedAtMs).toBeGreaterThanOrEqual(T.TRAP_VENT_MS);
    expect(held.ventedAtMs).toBeLessThan(T.TRAP_VENT_MS + 2 * STEP_MS);
    expect(held.bubble.air).toBe(T.AIR_START - 1);
    // §2.4.5: venting is also what frees her — the anemone has had its pip.
    expect(held.trap.hazardId).toBeNull();
    expect(held.events.filter((e) => e.type === 'airLost' && e.reason === 'trap')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// D1 × §2.4.5 — the escape shot is now a mid-air launch, and D1 forbids it on the last pip
// ---------------------------------------------------------------------------------------------

/**
 * The same anemone, with the player doing everything §2.4.5 asks of her: she waits out the 0,8 s hold
 * (`GameWorld` suppresses her input for exactly that long) and then pulls a full slingshot, which is
 * well past the 60 % escape threshold.
 */
function pullOutOfTheAnemone(air: number, steps: number): Run {
  const bubble = createBubble({ x: 90, y: 100 }, 0, T);
  bubble.air = air;
  const run = createRunState(1, 'expedicion');
  const trap = createTrapState();
  const events: GameEvent[] = [];
  let ventedAtMs = -1;
  let freedAtMs = -1;
  let nowMs = 0;
  const origin = { x: 90, y: 300 };
  const pull = pullGesture(1, 0, T);

  for (let i = 0; i < steps; i++) {
    // §5 nº 7 pins her for TRAP_HOLD_MS: GameWorld drops the pointer while `trap.pinUntil` runs.
    // The moment it lets go she presses, draws the sling over 100 ms and lifts — a full-power shot
    // released 1,05 s into a 1,5 s window, exactly the "cabe de sobra" §2.4.5 promises.
    const since = nowMs - T.TRAP_HOLD_MS;
    const held = nowMs < trap.pinUntil || since < 0;
    const stretch = Math.min(1, since / 100);
    const pointer: PointerInput =
      held || since > 250 ? UP : { down: true, x: origin.x + pull.x * stretch, y: origin.y + pull.y * stretch };
    const stepped = stepBubble(
      bubble,
      run,
      { pointer, solids: [], env: NEUTRAL_ENV, zone: 0, nowMs, dt: T.FIXED_DT, currentChunkId: 'c' },
      T,
    );
    events.push(...stepped.events);
    // `GameWorld.escapeTrapOnLaunch`, reproduced: the shot is what frees her (§2.4.5).
    if (stepped.events.some((e) => e.type === 'launch' && e.power >= TRAP_ESCAPE_POWER)) escapeTrap(bubble, trap);
    const hazards = stepHazards(bubble, run, trap, { hazards: [ANEMONE], nowMs }, T);
    events.push(...hazards.events);
    if (ventedAtMs < 0 && hazards.events.some((e) => e.type === 'airLost' && e.reason === 'trap')) ventedAtMs = nowMs;
    if (freedAtMs < 0 && i > 0 && trap.hazardId === null) freedAtMs = nowMs;
    nowMs += STEP_MS;
  }
  return { bubble, run, trap, events, ventedAtMs, freedAtMs };
}

describe('ADVERSARIAL — the anemone after DECISIONS-v1.2 D1 (§2.4.5, §5 nº 7)', () => {
  /**
   * A pinned Bur is not RESTING, so the escape shot §2.4.5 prices at "una carga del 60 %" is, since
   * D1, the one mid-air launch of the fall — and D1 refuses that launch outright when Bur is on her
   * last pip ("nunca está disponible con el último pip"). The player therefore presses, pulls and
   * releases with nothing at all happening ("ni evento ni castigo"), and 1,5 s later the vent takes
   * the pip she had left.
   *
   * That is the exact opposite of what both §2.4.5 and §5 nº 7 promise about this hazard — "recurso,
   * NO muerte" — and it is the case in which the promise mattered. The rule is not "the anemone costs
   * a pip"; it is that the player always has a way out that is cheaper than dying.
   */
  it('still lets a player on her last pip buy her way out with the 60 % shot', () => {
    const escape = pullOutOfTheAnemone(1, Math.ceil((T.TRAP_VENT_MS + 500) / STEP_MS));

    expect(escape.bubble.state).not.toBe('DEAD');
    expect(escape.bubble.air).toBe(1);
    expect(escape.freedAtMs).toBeGreaterThan(0);
    expect(escape.freedAtMs).toBeLessThan(T.TRAP_VENT_MS);
  });

  /**
   * The companion half, and the reason the one above is not a matter of taste: with two pips the same
   * player, the same press and the same pull DO escape. Nothing about her input changed — only the
   * size of the bar — so the escape is not a skill the game teaches, it is a purchase the game
   * silently refuses her exactly when she cannot afford the alternative.
   */
  it('escapes with two pips, which is what makes the refusal on one a rule and not a difficulty', () => {
    const escape = pullOutOfTheAnemone(2, Math.ceil((T.TRAP_VENT_MS + 500) / STEP_MS));

    expect(escape.freedAtMs).toBeGreaterThan(0);
    expect(escape.freedAtMs).toBeLessThan(T.TRAP_VENT_MS);
    expect(escape.bubble.state).not.toBe('DEAD');
  });
});
