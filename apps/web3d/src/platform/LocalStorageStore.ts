// From apps/web/src/platform/LocalStorageStore.ts, kept apart so the Three.js shell never imports the Phaser one.
// One difference: a refused write costs that key alone. There, the telemetry mirror filling the quota also
// hides the save from every later read, and the map shows a player who has just lost all her progress.
/**
 * `KeyValueStore` backed by `localStorage`, with a silent in-memory fallback.
 *
 * Private browsing, disabled cookies, exhausted quota and sandboxed iframes all throw on plain
 * `localStorage` access, so every call is guarded: a store that cannot persist still behaves like a
 * store for the rest of the run (the save is simply lost when the tab closes).
 */
import { MemoryStore } from '@deeply-bubbly/core';
import type { KeyValueStore } from '@deeply-bubbly/core';

const PROBE_KEY = 'deeply-bubbly.probe';

/** Set by the Pages build: /3d/ shares its origin with the Phaser game, and must not share its save. */
const KEY_PREFIX: string = (import.meta.env.VITE_STORE_PREFIX as string | undefined) ?? '';

/** True when `localStorage` exists and accepts a write. Never throws. */
export function localStorageAvailable(): boolean {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return false;
    ls.setItem(PROBE_KEY, '1');
    ls.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

export class LocalStorageStore implements KeyValueStore {
  /** Used when localStorage is missing, and for each key whose last write it refused (quota, privacy mode). */
  private readonly fallback = new MemoryStore();
  private usable: boolean;

  constructor() {
    this.usable = localStorageAvailable();
  }

  /** False once the adapter has degraded to memory; exposed for the tuning panel / telemetry. */
  get persistent(): boolean {
    return this.usable;
  }

  get(key: string): string | null {
    const unsaved = this.fallback.get(key);
    if (unsaved !== null) return unsaved;
    if (this.usable) {
      try {
        return globalThis.localStorage.getItem(KEY_PREFIX + key);
      } catch {
        this.degrade();
      }
    }
    return this.fallback.get(key);
  }

  set(key: string, value: string): void {
    if (this.usable) {
      try {
        globalThis.localStorage.setItem(KEY_PREFIX + key, value);
        this.fallback.remove(key);
        return;
      } catch {
        // Below: readable for the rest of the session, and the next write of this key tries again.
      }
    }
    this.fallback.set(key, value);
  }

  remove(key: string): void {
    if (this.usable) {
      try {
        globalThis.localStorage.removeItem(KEY_PREFIX + key);
        this.fallback.remove(key);
        return;
      } catch {
        this.degrade();
      }
    }
    this.fallback.remove(key);
  }

  private degrade(): void {
    this.usable = false;
  }
}

/** Single entry point for the shell: the persistent store when possible, memory otherwise. */
export function createStore(): KeyValueStore {
  return new LocalStorageStore();
}
