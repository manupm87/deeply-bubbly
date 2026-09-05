import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { AirGainReason, AirLossReason, Bubble, GameEvent, RunState } from '../types';

export interface AirChange {
  events: GameEvent[];
  /** True when air reached 0 (caller transitions to DEAD). */
  died: boolean;
}

/**
 * The ONLY entry point for losing air (§2.4). Handles: invulnerability (hit/trap ignored while invulnerable),
 * the shell shield (absorbs the first 'hit' of the zone, emits shieldUsed), the overcharge floor
 * (never below OVERCHARGE_MIN_AIR, never more than OVERCHARGE_MAX_DRAIN per hold), and emits airLost.
 * Sets invulnUntil/stunUntil for 'hit' and 'trap'. Never mutates run.pearls/shells.
 */
export function loseAir(bubble: Bubble, run: RunState, reason: AirLossReason, at: Vec2, nowMs: number, t: Tuning): AirChange {
  void bubble; void run; void reason; void at; void nowMs; void t;
  throw new Error('not implemented');
}

/** Clamps to bubble.airMax and emits airGained. */
export function gainAir(bubble: Bubble, amount: number, reason: AirGainReason, at: Vec2): GameEvent[] {
  void bubble; void amount; void reason; void at;
  throw new Error('not implemented');
}

/** Zone air capacity (§2.6): ZONE_AIR_MAX[zone] + upgrades. Only ever applied inside a RestStation. */
export function zoneAirMax(zone: number, upgrades: number, t: Tuning): number {
  void zone; void upgrades; void t;
  throw new Error('not implemented');
}
