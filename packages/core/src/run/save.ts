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

export const SAVE_VERSION = 1;

export function defaultSave(): SaveData {
  return {
    version: 1,
    unlockedStation: -1,
    bestDepthM: 0,
    pearls: 0,
    shellsByImmersion: {},
    settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: true },
    tutorialDone: false,
  };
}

type Unknown = Record<string, unknown>;

function isRecord(v: unknown): v is Unknown {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Finite number or the fallback; NaN/Infinity/strings never reach the game. */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Keeps only entries whose key is a non-negative integer and whose value is a finite number. */
function shellsRecord(v: unknown): Record<number, number> {
  const out: Record<number, number> = {};
  if (!isRecord(v)) return out;
  for (const [key, value] of Object.entries(v)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[index] = value;
  }
  return out;
}

function settingsOf(v: unknown, fallback: SaveData['settings']): SaveData['settings'] {
  const s = isRecord(v) ? v : {};
  return {
    slowCharge: bool(s['slowCharge'], fallback.slowCharge),
    assistedTrajectory: bool(s['assistedTrajectory'], fallback.assistedTrajectory),
    noShake: bool(s['noShake'], fallback.noShake),
    calm: bool(s['calm'], fallback.calm),
    sound: bool(s['sound'], fallback.sound),
  };
}

/**
 * Field-by-field validation: anything missing, mistyped or non-finite falls back to its default,
 * so a partially corrupt save degrades instead of wiping the run.
 */
function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!isRecord(raw)) return d;
  if (raw['version'] !== SAVE_VERSION) return d; // unknown/legacy schema: start clean
  return {
    version: 1,
    unlockedStation: Math.max(-1, Math.trunc(num(raw['unlockedStation'], d.unlockedStation))),
    bestDepthM: Math.max(0, num(raw['bestDepthM'], d.bestDepthM)),
    pearls: Math.max(0, Math.trunc(num(raw['pearls'], d.pearls))),
    shellsByImmersion: shellsRecord(raw['shellsByImmersion']),
    settings: settingsOf(raw['settings'], d.settings),
    tutorialDone: bool(raw['tutorialDone'], d.tutorialDone),
  };
}

/** Loads and validates; returns defaultSave() on missing/corrupt data (never throws). */
export function loadSave(store: KeyValueStore): SaveData {
  let text: string | null = null;
  try {
    text = store.get(SAVE_KEY);
  } catch {
    return defaultSave();
  }
  if (text === null) return defaultSave();
  try {
    return sanitize(JSON.parse(text));
  } catch {
    return defaultSave();
  }
}

export function writeSave(store: KeyValueStore, data: SaveData): void {
  try {
    store.set(SAVE_KEY, JSON.stringify(sanitize(data)));
  } catch {
    // A full or unavailable store must never break the run; the save is simply skipped.
  }
}
