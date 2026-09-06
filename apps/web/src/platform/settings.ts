/**
 * Accessibility / audio settings persistence. Settings live inside `SaveData.settings` (core owns the
 * schema and its validation), so this module is only the translation between the shell's `Settings`
 * shape and the save file, plus the one tuning transform the settings imply.
 *
 * No Phaser here on purpose: `main.ts` needs the settings before the game exists.
 */
import { loadSave, withCalmDive, withSlowCharge, writeSave } from '@deeply-bubbly/core';
import type { KeyValueStore, SaveData, Tuning } from '@deeply-bubbly/core';
import type { Settings } from '../context';

/** `SaveData.settings` and `Settings` hold the same five flags; this keeps the mapping in one place. */
export function settingsFromSave(save: SaveData): Settings {
  const s = save.settings;
  return {
    sound: s.sound,
    slowCharge: s.slowCharge,
    assistedTrajectory: s.assistedTrajectory,
    noShake: s.noShake,
    calm: s.calm,
  };
}

export function settingsToSave(save: SaveData, settings: Settings): SaveData {
  return {
    ...save,
    settings: {
      sound: settings.sound,
      slowCharge: settings.slowCharge,
      assistedTrajectory: settings.assistedTrajectory,
      noShake: settings.noShake,
      calm: settings.calm,
    },
  };
}

/** Reads the persisted settings; falls back to the defaults of a fresh save (never throws). */
export function loadSettings(store: KeyValueStore): Settings {
  return settingsFromSave(loadSave(store));
}

/**
 * Persists the settings without clobbering the rest of the save: the current file is re-read first,
 * so progress written by another system between load and save survives.
 */
export function saveSettings(store: KeyValueStore, settings: Settings): SaveData {
  const merged = settingsToSave(loadSave(store), settings);
  writeSave(store, merged);
  return merged;
}

/**
 * The two settings that change numbers, both transformed by core and never by the shell:
 *   - "carga lenta" scales every gesture time (§8) → `withSlowCharge`;
 *   - "Buceo tranquilo" widens rest, resaca grace and pressure drain (§8) → `withCalmDive`.
 * The other two ("sin temblor", "trayectoria asistida") are presentation and are honoured where they
 * are drawn: `fx/Juice` and `render/Trajectory`.
 */
export function applySettingsToTuning(base: Tuning, settings: Settings): Tuning {
  let t = base;
  if (settings.slowCharge) t = withSlowCharge(t);
  if (settings.calm) t = withCalmDive(t);
  return t;
}
