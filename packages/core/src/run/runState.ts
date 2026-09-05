import type { Tuning } from '../tuning';
import type { GameMode, RunState } from '../types';

export function createRunState(seed: number, mode: GameMode): RunState {
  void seed; void mode;
  throw new Error('not implemented');
}

/** Called on each failure of the current immersion; updates failCount and mercyLevel (§4.2.3, §11.5.8). */
export function registerFailure(run: RunState, t: Tuning): void {
  void run; void t;
  throw new Error('not implemented');
}

/** Called when an immersion is completed: resets failCount/mercy, advances immersionIndex, sets lastStationIndex. */
export function completeImmersion(run: RunState, stationIndex: number): void {
  void run; void stationIndex;
  throw new Error('not implemented');
}

/** Hazard density multiplier for the current mercy level (1, 0.8, 0.65). Never shown to the player. */
export function mercyDensityMul(run: RunState, t: Tuning): number {
  void run; void t;
  throw new Error('not implemented');
}

/** Whether a rewarded 'segundoAliento' may even be OFFERED: failCount >= AD_OFFER_MIN_FAILS (always after mercy). */
export function mayOfferSecondBreath(run: RunState, t: Tuning): boolean {
  void run; void t;
  throw new Error('not implemented');
}
