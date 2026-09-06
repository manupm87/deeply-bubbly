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
  /** Used when localStorage is missing, or after the first failed write (quota, privacy mode). */
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
    if (this.usable) {
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        this.degrade();
      }
    }
    return this.fallback.get(key);
  }

  set(key: string, value: string): void {
    if (this.usable) {
      try {
        globalThis.localStorage.setItem(key, value);
        return;
      } catch {
        this.degrade();
      }
    }
    this.fallback.set(key, value);
  }

  remove(key: string): void {
    if (this.usable) {
      try {
        globalThis.localStorage.removeItem(key);
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
