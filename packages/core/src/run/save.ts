import type { KeyValueStore } from '../ports';

export interface SaveData {
  version: 1;
  /** Highest station index unlocked (checkpoint), -1 when none. */
  unlockedStation: number;
  bestDepthM: number;
  pearls: number;
  shellsByImmersion: Record<number, number>;
  settings: { slowCharge: boolean; assistedTrajectory: boolean; noShake: boolean; calm: boolean; sound: boolean };
  tutorialDone: boolean;
}

export const SAVE_KEY = 'deeply-bubbly.save.v1';

export function defaultSave(): SaveData {
  throw new Error('not implemented');
}

/** Loads and validates; returns defaultSave() on missing/corrupt data (never throws). */
export function loadSave(store: KeyValueStore): SaveData {
  void store;
  throw new Error('not implemented');
}

export function writeSave(store: KeyValueStore, data: SaveData): void {
  void store; void data;
  throw new Error('not implemented');
}
