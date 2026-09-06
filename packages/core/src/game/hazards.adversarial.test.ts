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
import { createTrapState, stepHazards } from './hazards';
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
