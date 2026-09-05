import type { Tuning } from '../tuning';
import type { GameEvent, PointerInput, WorldSnapshot } from '../types';
import type { AdProvider, KeyValueStore, Telemetry } from '../ports';
import type { Campaign } from '../level/campaign';

export interface GameWorldDeps {
  campaign: Campaign;
  tuning: Tuning;
  telemetry: Telemetry;
  ads: AdProvider;
  store: KeyValueStore;
  /** Visible height in design px (320–420); can change on resize via setViewHeight. */
  viewH: number;
  seed: number;
  /** Start from this station index (checkpoint), -1 = surface. */
  startStationIndex?: number;
}

/**
 * Façade composing every core module into one deterministic simulation (§11). This is the ONLY thing the
 * shell talks to. Responsibilities: fixed-step accumulator (FIXED_DT, MAX_STEPS_PER_FRAME), streaming,
 * hazards (periodic phase, contact → loseAir('hit') + pushback), force fields, pickups, boyas (checkpoint),
 * stations (recharge to zone max, capacity change, immersionComplete, phase 'station'), zone changes (radius),
 * resaca detection with the camera, respawn, death flow (DEFLATE_MS → phase 'dead' → restart()), camera step,
 * trajectory preview while charging, telemetry, save on checkpoint.
 */
export class GameWorld {
  constructor(deps: GameWorldDeps) {
    void deps;
    throw new Error('not implemented');
  }
  /** Advance by a rendered-frame delta (ms); runs 0..MAX_STEPS_PER_FRAME fixed steps. Pointer is in VIEWPORT design px. */
  update(frameDtMs: number, pointer: PointerInput): void {
    void frameDtMs; void pointer;
    throw new Error('not implemented');
  }
  /** Read-only view for the renderer; drains the event queue. */
  snapshot(): WorldSnapshot {
    throw new Error('not implemented');
  }
  /** Player pressed "Otra vez" (from 'dead') — respawn at last boya/station in < RESTART_BUDGET_MS. */
  restart(): void {
    throw new Error('not implemented');
  }
  /** Player pressed "Seguir bajando" (from 'station'). */
  continueDescent(): void {
    throw new Error('not implemented');
  }
  setViewHeight(viewH: number): void {
    void viewH;
    throw new Error('not implemented');
  }
  /** Replace tuning live (tuning panel). Derived values recomputed by the caller via createTuning. */
  setTuning(t: Tuning): void {
    void t;
    throw new Error('not implemented');
  }
  /** Subscribe to events as they happen (alternative to snapshot().events). */
  onEvent(listener: (e: GameEvent) => void): () => void {
    void listener;
    throw new Error('not implemented');
  }
}
