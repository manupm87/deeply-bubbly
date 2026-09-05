/**
 * Ports (dependency inversion, GDD §11): the core depends only on these interfaces.
 * The shell (Phaser / Capacitor / tests) provides implementations.
 */

export interface Clock {
  /** Monotonic milliseconds. */
  now(): number;
}

export interface RNG {
  /** Uniform float in [0, 1). Must be deterministic for a given seed. */
  next(): number;
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

export type AdPlacement = 'segundoAliento' | 'perlasDobles';

export interface AdProvider {
  isAvailable(placement: AdPlacement): boolean;
  /** Resolves true when the reward was earned. Never throws; failures resolve false. */
  showRewarded(placement: AdPlacement): Promise<boolean>;
}

export interface TelemetryEvent {
  name: string;
  timeMs: number;
  data?: Record<string, number | string | boolean>;
}

export interface Telemetry {
  track(event: TelemetryEvent): void;
}

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** No-op implementations for tests and for the v1 build without ads. */
export const noopAds: AdProvider = {
  isAvailable: () => false,
  showRewarded: async () => false,
};

export const noopTelemetry: Telemetry = { track: () => {} };

export class MemoryStore implements KeyValueStore {
  private readonly m = new Map<string, string>();
  get(key: string): string | null {
    return this.m.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.m.set(key, value);
  }
  remove(key: string): void {
    this.m.delete(key);
  }
}

/** Mulberry32: tiny, fast, deterministic. Enough for chunk jitter and cosmetic choices. */
export class SeededRNG implements RNG {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
  }
  pick<T>(items: readonly T[]): T {
    const item = items[this.int(0, items.length)];
    if (item === undefined) throw new Error('pick() on empty array');
    return item;
  }
}
