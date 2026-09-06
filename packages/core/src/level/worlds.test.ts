import { describe, expect, it } from 'vitest';
import type { SaveData } from '../run/save';
import { defaultSave } from '../run/save';
import type { LevelState, LevelStatus, WorldDef } from './worlds';
import { IMMERSIONS_PER_ZONE, amberOcean, levelStatuses, worlds } from './worlds';

const TOTAL_LEVELS = 18;

type MapSave = Pick<SaveData, 'unlockedStation' | 'shellsByImmersion'>;

function saveWith(unlockedStation: number, shellsByImmersion: Record<number, number> = {}): MapSave {
  return { ...defaultSave(), unlockedStation, shellsByImmersion };
}

const states = (statuses: readonly LevelStatus[]): LevelState[] => statuses.map((s) => s.state);
const currentIndexes = (statuses: readonly LevelStatus[]): number[] =>
  statuses.filter((s) => s.current).map((s) => s.level.index);

describe('amberOcean', () => {
  it('has 18 levels with consecutive 0-based indexes', () => {
    const world = amberOcean(TOTAL_LEVELS);
    expect(world.id).toBe('amber-ocean');
    expect(world.playable).toBe(true);
    expect(world.levels).toHaveLength(TOTAL_LEVELS);
    expect(world.levels.map((l) => l.index)).toEqual([...Array(TOTAL_LEVELS).keys()]);
  });

  it('spreads the levels over the six zones as the GDD table (2/3/3/3/3/4)', () => {
    expect(IMMERSIONS_PER_ZONE).toEqual([2, 3, 3, 3, 3, 4]);
    const world = amberOcean(TOTAL_LEVELS);
    const perZone = IMMERSIONS_PER_ZONE.map((_, zone) => world.levels.filter((l) => l.zone === zone).length);
    expect(perZone).toEqual([2, 3, 3, 3, 3, 4]);
    // Zones are contiguous and non-decreasing along the path.
    expect(world.levels.map((l) => l.zone)).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5]);
  });

  it('maps the first `playableImmersions` levels to an immersion and the rest to null', () => {
    const world = amberOcean(3);
    expect(world.levels.slice(0, 3).map((l) => l.immersionIndex)).toEqual([0, 1, 2]);
    expect(world.levels.slice(3).every((l) => l.immersionIndex === null)).toBe(true);
  });

  it('ignores authored immersions beyond the 18 levels of the world', () => {
    const world = amberOcean(99);
    expect(world.levels).toHaveLength(TOTAL_LEVELS);
    expect(world.levels.map((l) => l.immersionIndex)).toEqual([...Array(TOTAL_LEVELS).keys()]);
  });

  it('builds nothing when no immersion is authored', () => {
    for (const count of [0, -1, Number.NaN]) {
      const world = amberOcean(count);
      expect(world.levels).toHaveLength(TOTAL_LEVELS);
      expect(world.levels.every((l) => l.immersionIndex === null)).toBe(true);
      expect(states(levelStatuses(world, saveWith(5)))).toEqual(Array(TOTAL_LEVELS).fill('noContent'));
    }
  });

  it('returns a fresh world every call', () => {
    const a = amberOcean(TOTAL_LEVELS);
    const first = a.levels[0] as { immersionIndex: number | null } | undefined;
    expect(first).toBeDefined();
    if (first) first.immersionIndex = null;
    expect(amberOcean(TOTAL_LEVELS).levels[0]?.immersionIndex).toBe(0);
  });
});

describe('worlds', () => {
  it('lists the three worlds in display order, only the amber ocean playable', () => {
    const list = worlds(TOTAL_LEVELS);
    expect(list.map((w) => w.id)).toEqual(['amber-ocean', 'volcano', 'loch-ness']);
    expect(list.map((w) => w.playable)).toEqual([true, false, false]);
    expect(list[1]?.levels).toEqual([]);
    expect(list[2]?.levels).toEqual([]);
  });

  it('passes the playable count through to the amber ocean', () => {
    const [amber] = worlds(2);
    expect(amber).toBeDefined();
    expect(amber?.levels.filter((l) => l.immersionIndex !== null)).toHaveLength(2);
    expect(amber).toEqual(amberOcean(2));
  });
});

describe('levelStatuses unlock rule', () => {
  const world: WorldDef = amberOcean(6);

  it('opens only level 0 on a fresh save (unlockedStation = -1)', () => {
    const statuses = levelStatuses(world, saveWith(-1));
    expect(states(statuses).slice(0, 6)).toEqual([
      'available',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(currentIndexes(statuses)).toEqual([0]);
    expect(statuses[0]?.startStationIndex).toBe(-1);
  });

  it('marks completed up to the unlocked station and opens the next one', () => {
    const statuses = levelStatuses(world, saveWith(0));
    expect(states(statuses).slice(0, 6)).toEqual([
      'completed',
      'available',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(currentIndexes(statuses)).toEqual([1]);
    expect(statuses[1]?.startStationIndex).toBe(0);
  });

  it('moves the frontier with the unlocked station (1 and 4)', () => {
    expect(states(levelStatuses(world, saveWith(1))).slice(0, 4)).toEqual([
      'completed',
      'completed',
      'available',
      'locked',
    ]);
    const deep = levelStatuses(world, saveWith(4));
    expect(states(deep).slice(0, 6)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
      'completed',
      'available',
    ]);
    expect(currentIndexes(deep)).toEqual([5]);
    expect(deep[5]?.startStationIndex).toBe(4);
  });

  it('never opens a level with no content, however deep the save says it went', () => {
    for (const unlocked of [5, 17, 99]) {
      const statuses = levelStatuses(world, saveWith(unlocked));
      expect(states(statuses).slice(0, 6)).toEqual(Array(6).fill('completed'));
      expect(states(statuses).slice(6)).toEqual(Array(TOTAL_LEVELS - 6).fill('noContent'));
      // Nothing left to enter: the current node is the last completed one.
      expect(currentIndexes(statuses)).toEqual([5]);
    }
  });

  it('treats a garbage unlockedStation as a fresh profile (NaN, -5)', () => {
    const fresh = states(levelStatuses(world, saveWith(-1)));
    for (const unlocked of [Number.NaN, -5, Number.NEGATIVE_INFINITY]) {
      const statuses = levelStatuses(world, saveWith(unlocked));
      expect(states(statuses)).toEqual(fresh);
      expect(currentIndexes(statuses)).toEqual([0]);
    }
  });

  it('floors a fractional unlockedStation instead of rounding up', () => {
    expect(states(levelStatuses(world, saveWith(1.9))).slice(0, 3)).toEqual(['completed', 'completed', 'available']);
  });

  it('completes the whole world when every level is built and cleared', () => {
    const full = amberOcean(TOTAL_LEVELS);
    const statuses = levelStatuses(full, saveWith(TOTAL_LEVELS - 1));
    expect(states(statuses)).toEqual(Array(TOTAL_LEVELS).fill('completed'));
    expect(currentIndexes(statuses)).toEqual([TOTAL_LEVELS - 1]);
  });

  it('has exactly one current node when anything is enterable and none when nothing is', () => {
    for (const built of [1, 6, TOTAL_LEVELS]) {
      for (const unlocked of [-5, -1, 0, 1, 4, 17, 99]) {
        expect(currentIndexes(levelStatuses(amberOcean(built), saveWith(unlocked)))).toHaveLength(1);
      }
    }
    expect(currentIndexes(levelStatuses(amberOcean(0), saveWith(3)))).toEqual([]);
    expect(currentIndexes(levelStatuses({ id: 'volcano', playable: false, levels: [] }, saveWith(3)))).toEqual([]);
  });

  it('starts each level from the station right before it', () => {
    const statuses = levelStatuses(amberOcean(TOTAL_LEVELS), saveWith(TOTAL_LEVELS - 1));
    expect(statuses.map((s) => s.startStationIndex)).toEqual([...Array(TOTAL_LEVELS).keys()].map((i) => i - 1));
  });

  it('does not mutate the world it reads', () => {
    const snapshot = JSON.stringify(world);
    levelStatuses(world, saveWith(3, { 0: 3 }));
    expect(JSON.stringify(world)).toBe(snapshot);
  });
});

describe('levelStatuses shells', () => {
  const world = amberOcean(6);
  const shellsOf = (save: MapSave): number[] => levelStatuses(world, save).map((s) => s.shells);

  it('reports the banked shells of completed levels only', () => {
    expect(shellsOf(saveWith(1, { 0: 3, 1: 1, 2: 2 }))).toEqual([3, 1, 0, 0, 0, 0, ...Array(12).fill(0)]);
  });

  it('is 0 for levels with no entry in the save', () => {
    expect(shellsOf(saveWith(2, { 1: 2 }))).toEqual([0, 2, 0, ...Array(15).fill(0)]);
  });

  it('clamps to 0-3 and floors fractions', () => {
    expect(shellsOf(saveWith(3, { 0: -7, 1: 99, 2: 2.9, 3: 3 }))).toEqual([0, 3, 2, 3, ...Array(14).fill(0)]);
  });

  it('ignores garbage entries instead of leaking them to the map', () => {
    const garbage = { 0: 'three', 1: Number.NaN, 2: null, 3: undefined } as unknown as Record<number, number>;
    expect(shellsOf(saveWith(3, garbage))).toEqual(Array(TOTAL_LEVELS).fill(0));
  });

  it('never reports shells for levels with no content', () => {
    const statuses = levelStatuses(world, saveWith(99, { 6: 3, 17: 3 }));
    expect(statuses.slice(6).every((s) => s.shells === 0)).toBe(true);
  });
});
