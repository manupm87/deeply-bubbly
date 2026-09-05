/**
 * Air: the only bar (GDD §2.4, §2.5). Every pip Bur loses or gains goes through this file — the
 * ARCHITECTURE "un solo lugar para cada regla" rule names it explicitly — so the shield, the
 * invulnerability window, the overcharge floor and the capacity clamp cannot drift apart.
 *
 * What lives here and NOT in the callers: the five ways to lose air (§2.4) are all `loseAir` reasons,
 * so the shell, `GameWorld` and `bubbleStep` never touch `bubble.air` themselves.
 */
import { clamp } from '../math/vec';
import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { AirGainReason, AirLossReason, Bubble, GameEvent, RunState } from '../types';

export interface AirChange {
  events: GameEvent[];
  /** True when air reached 0 (caller transitions to DEAD). */
  died: boolean;
}

/** §11.7.9: no entity in the catalogue ever costs more than one pip per contact. */
const AIR_COST = 1;

/**
 * The ONLY entry point for losing air (§2.4). Handles: invulnerability (hit/trap ignored while invulnerable),
 * the shell shield (absorbs the first 'hit' of the zone, emits shieldUsed), the overcharge floor
 * (never below OVERCHARGE_MIN_AIR, never more than OVERCHARGE_MAX_DRAIN per hold), and emits airLost.
 * Sets invulnUntil/stunUntil for 'hit' and 'trap'. Never mutates run.pearls/shells.
 *
 * NOT done here, by design:
 *  - the HIT_PUSHBACK impulse (§2.4.1): only the caller knows the hazard geometry, so only the caller
 *    knows which way "away from it" points. `GameWorld` applies it after a truthy `airLost`/`shieldUsed`.
 *  - the DEAD transition: `died` is reported, and `applyAirLoss` (bubbleStep) performs it.
 *
 * Side effects worth knowing about (they are air rules, and this is where air rules live):
 *  - a hazard that connects ('hit'/'trap', shield-absorbed or not) breaks the bounce chain, because
 *    §2.5 pays the chain only when it is "sin tocar peligro";
 *  - a successful 'overcharge' drain counts against `bubble.overchargeDrained` (the per-hold cap).
 */
export function loseAir(
  bubble: Bubble,
  run: RunState,
  reason: AirLossReason,
  at: Vec2,
  nowMs: number,
  t: Tuning,
): AirChange {
  const events: GameEvent[] = [];

  // A deflating Bur has nothing left to lose, and §11.7.6 forbids re-entering the death flow.
  if (bubble.state === 'DEAD' || bubble.air <= 0) return { events, died: false };

  const fromHazard = reason === 'hit' || reason === 'trap';
  if (fromHazard && nowMs < bubble.flags.invulnUntil) return { events, died: false };

  if (reason === 'overcharge') {
    // Hard floor and per-hold cap (§2.2): a long hold is a cost, never a lost run.
    if (bubble.air <= t.OVERCHARGE_MIN_AIR) return { events, died: false };
    if (bubble.overchargeDrained >= t.OVERCHARGE_MAX_DRAIN) return { events, died: false };
    bubble.overchargeDrained += 1;
  }

  // Copy: events outlive the step, and the caller usually passes `bubble.pos` itself.
  const point: Vec2 = { x: at.x, y: at.y };

  if (fromHazard) {
    resetBounceChain(bubble);
    if (reason === 'hit' && run.shieldAvailable) {
      // The shell shield absorbs the first hit of each zone (§2.5). It also grants the normal
      // invulnerability window: without it the same hazard would take a pip on the very next tick
      // and the shield would have bought nothing.
      run.shieldAvailable = false;
      bubble.flags.invulnUntil = nowMs + t.INVULN_MS;
      events.push({ type: 'shieldUsed', at: point });
      return { events, died: false };
    }
    bubble.flags.invulnUntil = nowMs + t.INVULN_MS;
    bubble.flags.stunUntil = nowMs + t.STUN_MS;
  }

  bubble.air = Math.max(0, bubble.air - AIR_COST);
  events.push({ type: 'airLost', reason, air: bubble.air, at: point });
  return { events, died: bubble.air <= 0 };
}

/**
 * Clamps to bubble.airMax and emits airGained.
 * Returns no event when there was nothing to gain (Bur already at capacity): §11.7.12 makes the cap an
 * invariant, and a "+1 air" flash for a pip that never existed is a lie to the player.
 * Air bags and stations also restart the Z5–Z6 pressure clock — §2.4.4 counts "cada 25 s SIN TOCAR
 * bolsa de aire" — which is why that accumulator is reset here and nowhere else.
 */
export function gainAir(bubble: Bubble, amount: number, reason: AirGainReason, at: Vec2): GameEvent[] {
  const room = Math.max(0, bubble.airMax - bubble.air);
  const gained = Math.min(Math.max(0, amount), room);
  if (reason === 'pickup' || reason === 'station') bubble.pressureDrainMs = 0;
  // `gained > 0` and not `gained <= 0`: the amount comes from level data (`Pickup.value`, §11.2), and
  // a NaN passes every `<=` test while poisoning `air` — and with it the §11.7.12 invariant, the HUD
  // and the `air <= 0` death test — for the rest of the run. +Infinity is fine: `room` clamps it.
  if (!(gained > 0)) return [];
  bubble.air += gained;
  return [{ type: 'airGained', reason, air: bubble.air, at: { x: at.x, y: at.y } }];
}

/** Zone air capacity (§2.6): ZONE_AIR_MAX[zone] + upgrades. Only ever applied inside a RestStation. */
export function zoneAirMax(zone: number, upgrades: number, t: Tuning): number {
  const table = t.ZONE_AIR_MAX;
  const extra = Math.max(0, upgrades);
  if (table.length === 0) return t.AIR_MAX_BASE + extra;
  const index = clamp(Math.trunc(zone), 0, table.length - 1);
  return (table[index] ?? t.AIR_MAX_BASE) + extra;
}

/**
 * Ends the current bounce chain (§2.5). Lives next to `loseAir` because the two halves of the rule are
 * inseparable: the chain pays +1 air, and touching a hazard is what voids it.
 */
export function resetBounceChain(bubble: Bubble): void {
  bubble.bounceChain = 0;
  bubble.bounceChainBodies.length = 0;
}
