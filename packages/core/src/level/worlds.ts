/**
 * Worlds and levels for the map menu (docs/design/WORLD-MAP.md). Pure data + one pure rule:
 * which node is locked, available or completed, read from the save. The map scene in the shell
 * only PAINTS what `levelStatuses` returns; it never decides an unlock on its own.
 *
 * Vocabulary: a WORLD is a whole setting with its story (the first is the amber ocean of the GDD,
 * six zones from the surface to the trench); a LEVEL is one Immersion (§3.1: 5 playable chunks plus
 * the station that closes it, a permanent checkpoint); an AREA is a GDD zone, which only groups
 * levels and tints its stretch of the map.
 *
 * Unlock rule (the only one): the station of immersion n is checkpoint n, so
 *   completed  ⇔ save.unlockedStation >= n
 *   available  ⇔ save.unlockedStation >= n - 1   (level 0 is always available)
 *   locked     otherwise
 *   noContent  when the level has no immersion built yet (`immersionIndex === null`): the campaign
 *              of the GDD has 18 immersions but only some are authored.
 * Entering level n means a new run from checkpoint n - 1 (`startStationIndex`, -1 = surface).
 */
import type { SaveData } from '../run/save';
import type { ZoneIndex } from '../types';

export type WorldId = 'amber-ocean' | 'volcano' | 'loch-ness';

export interface LevelDef {
  /** Position in the world, 0-based. */
  index: number;
  /** GDD zone (area) the level belongs to; tints its stretch of the map. */
  zone: ZoneIndex;
  /** Index into `campaign.immersions`, or null when the level has not been built yet. */
  immersionIndex: number | null;
}

export interface WorldDef {
  id: WorldId;
  /** False for the placeholder islands of future worlds: shown locked, no levels. */
  playable: boolean;
  levels: readonly LevelDef[];
}

export type LevelState = 'noContent' | 'locked' | 'available' | 'completed';

export interface LevelStatus {
  /** The level itself, aliased from the world (not a copy): read-only for every caller. */
  level: Readonly<LevelDef>;
  state: LevelState;
  /** Shells banked in this level's immersion (0-3), 0 when not completed. */
  shells: number;
  /** The deepest node the player can enter: where the map scrolls to and what "Seguir" means. */
  current: boolean;
  /** Checkpoint a new run starts from to play this level; -1 is the surface. */
  startStationIndex: number;
}

/** Immersions per zone of the GDD §3.2 table (2 + 3 + 3 + 3 + 3 + 4 = 18). */
export const IMMERSIONS_PER_ZONE: readonly number[] = [2, 3, 3, 3, 3, 4];

/**
 * The first world: 18 levels along the six zones, of which the first `playableImmersions` are built
 * (the caller passes `campaign.immersions.length`, so the map can never offer a level the campaign
 * cannot start). Extra authored immersions beyond 18 are ignored.
 */
export function amberOcean(playableImmersions: number): WorldDef {
  // A count is a number of authored immersions: never fractional, never negative, never NaN. A
  // fractional one would otherwise build ceil(n) levels and promise a run the campaign cannot start.
  const built = Number.isFinite(playableImmersions) ? Math.max(0, Math.floor(playableImmersions)) : 0;
  const levels: LevelDef[] = [];
  let index = 0;
  IMMERSIONS_PER_ZONE.forEach((count, zone) => {
    for (let i = 0; i < count; i++) {
      levels.push({ index, zone: zone as ZoneIndex, immersionIndex: index < built ? index : null });
      index++;
    }
  });
  return { id: 'amber-ocean', playable: true, levels };
}

/** Every world on the map, in display order. Only the first one is playable for now. */
export function worlds(playableImmersions: number): readonly WorldDef[] {
  return [
    amberOcean(playableImmersions),
    { id: 'volcano', playable: false, levels: [] },
    { id: 'loch-ness', playable: false, levels: [] },
  ];
}

/** Node states of a world for this save. Pure; the `current` flag is set on exactly one node when any is enterable. */
export function levelStatuses(
  world: WorldDef,
  save: Pick<SaveData, 'unlockedStation' | 'shellsByImmersion'>,
): LevelStatus[] {
  // Clamped like the save sanitizer: anything below -1 (or non-finite) means "nothing unlocked",
  // so level 0 stays available instead of locking the player out of the map.
  const unlocked = Number.isFinite(save.unlockedStation) ? Math.max(-1, Math.floor(save.unlockedStation)) : -1;
  const statuses: LevelStatus[] = world.levels.map((level) => {
    const n = level.immersionIndex;
    let state: LevelState = 'noContent';
    if (n !== null) state = unlocked >= n ? 'completed' : unlocked >= n - 1 ? 'available' : 'locked';
    const banked = n === null ? undefined : save.shellsByImmersion[n];
    // Number.isFinite, not typeof: a NaN in a hand-edited save would otherwise reach the map as NaN shells.
    const shells = state === 'completed' && Number.isFinite(banked) ? Math.max(0, Math.min(3, Math.floor(banked as number))) : 0;
    return { level, state, shells, current: false, startStationIndex: n === null ? -1 : n - 1 };
  });
  // The deepest enterable node: the first 'available' if there is one, else the last 'completed'.
  const available = statuses.find((s) => s.state === 'available');
  const target = available ?? [...statuses].reverse().find((s) => s.state === 'completed');
  if (target) target.current = true;
  return statuses;
}
