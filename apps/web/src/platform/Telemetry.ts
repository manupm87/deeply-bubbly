/**
 * Local-only telemetry: a 500-event ring buffer in memory, mirrored to `localStorage` so a crash or a
 * reload does not lose the tail of the session. Nothing leaves the device (GDD §6.5: no accounts, no
 * network in the kids build); `dump()` is what the tuning panel and bug reports read.
 */
import type { KeyValueStore, Telemetry, TelemetryEvent } from '@deeply-bubbly/core';
import { createStore } from './LocalStorageStore';

export const TELEMETRY_KEY = 'deeply-bubbly.telemetry';
export const TELEMETRY_CAPACITY = 500;

/** Minimum gap between mirrors: serialising 500 events on every track would stall the frame. */
const FLUSH_INTERVAL_MS = 1000;

function isEvent(v: unknown): v is TelemetryEvent {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e['name'] === 'string' && typeof e['timeMs'] === 'number';
}

export class LocalTelemetry implements Telemetry {
  private readonly store: KeyValueStore;
  private readonly capacity: number;
  private readonly events: TelemetryEvent[];
  private lastFlushMs = 0;
  private dirty = false;

  constructor(store: KeyValueStore = createStore(), capacity: number = TELEMETRY_CAPACITY) {
    this.store = store;
    this.capacity = Math.max(1, capacity);
    this.events = this.restore();
  }

  track(event: TelemetryEvent): void {
    this.events.push(event);
    if (this.events.length > this.capacity) this.events.splice(0, this.events.length - this.capacity);
    this.dirty = true;
    const now = Date.now();
    if (now - this.lastFlushMs >= FLUSH_INTERVAL_MS) this.flush(now);
  }

  /** Copy of the ring buffer, oldest first. */
  dump(): readonly TelemetryEvent[] {
    return this.events.slice();
  }

  /** Writes the buffer through to the store immediately (call on pause / visibilitychange). */
  flush(nowMs: number = Date.now()): void {
    if (!this.dirty) return;
    this.lastFlushMs = nowMs;
    this.dirty = false;
    try {
      this.store.set(TELEMETRY_KEY, JSON.stringify(this.events));
    } catch {
      // Telemetry is best-effort: a full or unavailable store must never break the run.
    }
  }

  clear(): void {
    this.events.length = 0;
    this.dirty = false;
    try {
      this.store.remove(TELEMETRY_KEY);
    } catch {
      // ignored, see flush()
    }
  }

  /** Previous session's tail; anything malformed is dropped rather than crashing the boot. */
  private restore(): TelemetryEvent[] {
    let text: string | null = null;
    try {
      text = this.store.get(TELEMETRY_KEY);
    } catch {
      return [];
    }
    if (text === null) return [];
    try {
      const raw: unknown = JSON.parse(text);
      if (!Array.isArray(raw)) return [];
      const out = raw.filter(isEvent);
      return out.slice(Math.max(0, out.length - this.capacity));
    } catch {
      return [];
    }
  }
}

export function createTelemetry(store?: KeyValueStore): LocalTelemetry {
  return store ? new LocalTelemetry(store) : new LocalTelemetry();
}
