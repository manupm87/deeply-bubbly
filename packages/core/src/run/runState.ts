import type { Tuning } from '../tuning';
import type { GameMode, RunState } from '../types';

export function createRunState(seed: number, mode: GameMode): RunState {
  return {
    seed,
    mode,
    immersionIndex: 0,
    lastBoyaId: null,
    lastStationIndex: -1,
    maxProgressY: 0,
    pearls: 0,
    shells: 0,
    failCountThisImmersion: 0,
    mercyLevel: 0,
    shieldAvailable: true,
    elapsedMs: 0,
  };
}

/** Mercy level implied by a fail count (§4.2.3, §11.5.8). Monotonic in `fails`. */
function mercyLevelFor(fails: number, t: Tuning): 0 | 1 | 2 {
  const [lvl1, lvl2] = t.MERCY_FAILS;
  if (fails >= lvl2) return 2;
  if (fails >= lvl1) return 1;
  return 0;
}

/** Called on each failure of the current immersion; updates failCount and mercyLevel (§4.2.3, §11.5.8). */
export function registerFailure(run: RunState, t: Tuning): void {
  run.failCountThisImmersion += 1;
  // Mercy is silent help for 'expedicion' only; 'abismo' is the honest mode (§4.2.3).
  run.mercyLevel = run.mode === 'expedicion' ? mercyLevelFor(run.failCountThisImmersion, t) : 0;
}

/** Called when an immersion is completed: resets failCount/mercy, advances immersionIndex, sets lastStationIndex. */
export function completeImmersion(run: RunState, stationIndex: number): void {
  run.failCountThisImmersion = 0;
  run.mercyLevel = 0;
  run.immersionIndex += 1;
  run.lastStationIndex = stationIndex;
  // The boya of the finished immersion is above the new checkpoint; respawn must fall back to the station.
  run.lastBoyaId = null;
}

/** Hazard density multiplier for the current mercy level (1, 0.8, 0.65). Never shown to the player. */
export function mercyDensityMul(run: RunState, t: Tuning): number {
  const [mul1, mul2] = t.MERCY_DENSITY_MUL;
  if (run.mercyLevel === 2) return mul2;
  if (run.mercyLevel === 1) return mul1;
  return 1;
}

/** Whether a rewarded 'segundoAliento' may even be OFFERED: failCount >= AD_OFFER_MIN_FAILS (always after mercy). */
export function mayOfferSecondBreath(run: RunState, t: Tuning): boolean {
  return run.failCountThisImmersion >= t.AD_OFFER_MIN_FAILS;
}
