/**
 * The two checkpoints of a run: the silent boya of mid-immersion (GDD §3.1) and the rest station that
 * closes it (§3.3). Both are markers derived from the campaign by `campaignMarkers`, never authored
 * inside a chunk, and both are crossed by DEPTH — `pos.y >= worldY` — not by an overlap test: a boya
 * that a fast shot flew past would otherwise cost the player the checkpoint the pillar-3 budget of
 * §3.1 is built on.
 */
import { gainAir, zoneAirMax } from '../bubble/air';
import { completeImmersion } from '../run/runState';
import type { Tuning } from '../tuning';
import type { Boya, Bubble, EntityId, GameEvent, RestStation, RunState, ZoneIndex } from '../types';

/** What the world remembers about checkpoints already taken. Owned by `GameWorld`, mutated here. */
export interface CheckpointState {
  /** Boyas already crossed in this run: crossing one twice is not a checkpoint, it is a bug. */
  reachedBoyas: Set<EntityId>;
  /** Immersion indices whose station has already been entered. */
  completedStations: Set<number>;
  /** Deepest zone reached, so the shell shield and `zoneChange` fire once per zone (§2.5). */
  maxZone: ZoneIndex;
}

export function createCheckpointState(zone: ZoneIndex): CheckpointState {
  return { reachedBoyas: new Set(), completedStations: new Set(), maxZone: zone };
}

/**
 * §3.1: "una burbuja anclada que Bur atraviesa y que hace un plín grave". No air, no interface, no
 * pause — it only moves `run.lastBoyaId`, which is branch (c) of the respawn chain (§2.4.2).
 */
export function crossBoyas(
  bubble: Bubble,
  run: RunState,
  boyas: readonly Boya[],
  state: CheckpointState,
): GameEvent[] {
  // §3.1: "Abismo: una sola bajada continua, sin checkpoints —sin boyas tampoco—". The marker is still
  // in the world (it is the same column) but it is not a checkpoint there, so it never moves
  // `run.lastBoyaId` and branch (c) of the respawn chain stays unreachable in that mode.
  const events: GameEvent[] = [];
  if (run.mode === 'abismo') return events;
  for (const boya of boyas) {
    if (bubble.pos.y < boya.worldY) continue;
    if (state.reachedBoyas.has(boya.id)) continue;
    state.reachedBoyas.add(boya.id);
    run.lastBoyaId = boya.id;
    events.push({ type: 'boya', boyaId: boya.id });
  }
  return events;
}

/** The station Bur has just reached, or null. `worldY` is the TOP of the 240 px band (§11.2). */
export function reachedStation(
  bubble: Bubble,
  stations: readonly RestStation[],
  state: CheckpointState,
): RestStation | null {
  for (const station of stations) {
    if (bubble.pos.y < station.worldY) continue;
    if (state.completedStations.has(station.immersionIndex)) continue;
    return station;
  }
  return null;
}

/**
 * Everything a station does to the simulation (§3.3.1 and §3.3.2): capacity moves to the zone being
 * entered, the bar refills to that capacity, the immersion is marked complete and the checkpoint
 * advances. §11.7.12 lives here too — this is the ONLY place in the game where `airMax` changes, and the
 * clamp is what keeps "el Aire actual nunca supera ZONE_AIR_MAX[zone]" true when capacity steps DOWN
 * (Z2 → Z3 is 8 → 7). The refill immediately after is why §2.6 can promise it never feels like a theft.
 *
 * The phase change, the save and the telemetry are `GameWorld`'s; they are not simulation.
 */
export function enterStation(
  bubble: Bubble,
  run: RunState,
  station: RestStation,
  state: CheckpointState,
  t: Tuning,
): GameEvent[] {
  state.completedStations.add(station.immersionIndex);
  const events: GameEvent[] = [{ type: 'stationEnter', station }];

  bubble.airMax = zoneAirMax(station.zoneTo, 0, t);
  bubble.air = Math.min(bubble.air, bubble.airMax);
  events.push(...gainAir(bubble, bubble.airMax, 'station', bubble.pos));

  completeImmersion(run, station.immersionIndex);
  return events;
}

/**
 * Zone bookkeeping (§2.5, §2.6). The zone Bur is in is derived from her depth every step — that is what
 * drives her radius and the dot count — but the things that happen ONCE per zone key on the deepest
 * zone reached, so hovering on a boundary cannot re-arm the shell shield over and over.
 * Capacity is deliberately NOT touched here: §11.7.12 allows it to change only inside a station.
 */
export function advanceZone(run: RunState, zone: ZoneIndex, state: CheckpointState): GameEvent[] {
  if (zone <= state.maxZone) return [];
  const from = state.maxZone;
  state.maxZone = zone;
  run.shieldAvailable = true;
  return [{ type: 'zoneChange', from, to: zone }];
}
