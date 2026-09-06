/**
 * Adversarial pass over the world map registry (`worlds.ts`) and the save/flow contract it sits on.
 *
 * `worlds.test.ts` proves the rules as designed. This file assumes they are wrong and pushes from the
 * outside: saves that never came out of `writeSave`, a campaign that is smaller than the map, the
 * promise a node makes ("tap level n and you start at the station of level n - 1") checked against a
 * REAL `GameWorld` instead of against arithmetic, and the loop map -> run -> save -> map closed with
 * the bot, so that "completed" on the map means the station the game actually banked.
 *
 * Everything here is black box: only public exports, no reaching into the implementation.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { MemoryStore } from '../ports';
import { GuidedFinger } from '../game/autoPlayer';
import { buildMvpCampaign, createMvpWorld } from '../game/testHarness';
import { SAVE_KEY, defaultSave, loadSave } from '../run/save';
import { IMMERSIONS_PER_ZONE, amberOcean, levelStatuses, worlds } from './worlds';
import type { SaveData } from '../run/save';
import type { WorldSnapshot } from '../types';
import type { LevelStatus, WorldDef } from './worlds';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;
const TOTAL_LEVELS = IMMERSIONS_PER_ZONE.reduce((a, b) => a + b, 0);

type MapSave = Pick<SaveData, 'unlockedStation' | 'shellsByImmersion'>;

function saveWith(unlockedStation: number, shellsByImmersion: Record<number, number> = {}): MapSave {
  return { unlockedStation, shellsByImmersion };
}

/** The campaign `apps/web` builds (`buildWorld` -> `buildMvpCampaign`) and hands to the map. */
const campaign = buildMvpCampaign(T);
const PLAYABLE = campaign.immersions.length;

const enterable = (s: LevelStatus): boolean => s.state === 'available' || s.state === 'completed';

// -------------------------------------------------------------------------------------------
// The map may only offer what the campaign can actually build
// -------------------------------------------------------------------------------------------

describe('the map against the campaign the shell really builds', () => {
  // The shell passes `this.ctx.campaign.immersions.length` (apps/web/src/scenes/MapScene.ts) and that
  // campaign is `buildMvpCampaign` (apps/web/src/main.ts `buildWorld`). That is the number under test.
  const world: WorldDef = amberOcean(PLAYABLE);

  it('builds exactly the authored immersions and points every built level at a real one', () => {
    const built = world.levels.filter((l) => l.immersionIndex !== null);
    expect(built).toHaveLength(Math.min(PLAYABLE, TOTAL_LEVELS));
    for (const level of built) {
      expect(campaign.immersions[level.immersionIndex as number]).toBeDefined();
      expect(level.immersionIndex).toBe(level.index); // level n IS immersion n; the map has no offset
    }
  });

  it('never lets a node be entered whose immersion the campaign cannot start', () => {
    for (let unlocked = -5; unlocked <= 25; unlocked++) {
      for (const status of levelStatuses(world, saveWith(unlocked))) {
        if (!enterable(status)) continue;
        expect(status.level.immersionIndex, `unlocked=${unlocked}`).not.toBeNull();
        expect(status.startStationIndex).toBeGreaterThanOrEqual(-1);
        // The run starts at station n - 1 and plays immersion n, so BOTH have to exist.
        expect(status.startStationIndex).toBeLessThanOrEqual(PLAYABLE - 2);
        expect(campaign.immersions[status.startStationIndex + 1]).toBeDefined();
      }
    }
  });

  it('tints every built node with the zone its immersion was authored in', () => {
    // The map paints `level.zone` from the GDD table while the game reads `immersion.zone` from the
    // authored chunks. A sixth Z2 immersion would silently draw the wrong palette under the node.
    for (const level of world.levels) {
      if (level.immersionIndex === null) continue;
      expect(level.zone, `level ${level.index}`).toBe(campaign.immersions[level.immersionIndex]?.zone);
    }
  });

  it('shows why the count is a parameter: a hardcoded 18 would promise runs the campaign cannot give', () => {
    const optimistic = levelStatuses(amberOcean(TOTAL_LEVELS), saveWith(TOTAL_LEVELS - 1));
    const last = optimistic[TOTAL_LEVELS - 1];
    expect(last?.state).toBe('completed');
    expect(campaign.immersions[last?.startStationIndex ?? 0]).toBeUndefined();
    // What such a tap would do: GameWorld silently clamps to the last station and the run then claims
    // an immersion that does not exist — no throw, no wrong-level warning, just the wrong level.
    const snap = createMvpWorld({ startStationIndex: last?.startStationIndex ?? 0 }).snapshot();
    expect(snap.run.lastStationIndex).toBe(PLAYABLE - 1);
    expect(campaign.immersions[snap.run.immersionIndex]).toBeUndefined();
  });
});

// -------------------------------------------------------------------------------------------
// The run a node promises, checked against a real world
// -------------------------------------------------------------------------------------------

describe('startStationIndex is the run the node promises', () => {
  const statuses = levelStatuses(amberOcean(PLAYABLE), saveWith(PLAYABLE - 1));

  it('starts every built level at the checkpoint right before it, playing that level', () => {
    for (const status of statuses) {
      const n = status.level.immersionIndex;
      if (n === null) continue;
      expect(status.startStationIndex).toBe(n - 1);
      const snap = createMvpWorld({ startStationIndex: status.startStationIndex }).snapshot();
      expect(snap.phase).toBe('playing');
      expect(snap.run.lastStationIndex, `level ${n}`).toBe(n - 1);
      // The run is ABOUT to play immersion n: that is what makes the node's number honest.
      expect(snap.run.immersionIndex, `level ${n}`).toBe(n);
      const immersion = campaign.immersions[n];
      expect(immersion).toBeDefined();
      if (!immersion) continue;
      if (n === 0) {
        // The surface: above the first boya, so nothing is skipped by starting there.
        expect(snap.bubble.pos.y).toBeLessThan(immersion.boyaY);
      } else {
        // Inside the station band that closes level n - 1: never above it (progress given back) and
        // never past the start of level n (content skipped).
        expect(snap.bubble.pos.y).toBeGreaterThanOrEqual(campaign.immersions[n - 1]?.stationY ?? 0);
        expect(snap.bubble.pos.y).toBeLessThan(immersion.startY);
        expect(immersion.startY - snap.bubble.pos.y).toBeLessThanOrEqual(T.CHUNK_H);
      }
    }
  });

  it('is deterministic: the same node twice is the same start, to the pixel', () => {
    for (const status of statuses) {
      if (status.level.immersionIndex === null) continue;
      const a = createMvpWorld({ startStationIndex: status.startStationIndex }).snapshot();
      const b = createMvpWorld({ startStationIndex: status.startStationIndex }).snapshot();
      expect(a.bubble.pos).toEqual(b.bubble.pos);
      expect(a.run.immersionIndex).toBe(b.run.immersionIndex);
      expect(a.zone).toBe(b.zone);
    }
  });

  it('stops offering the deepest banked station once the last authored level is cleared', () => {
    // Documented, and worth an owner decision: the removed start screen's "Seguir" dived from
    // `save.unlockedStation` itself, so a player who had cleared everything resumed AT the last
    // station. The map cannot: the node that would start there is level PLAYABLE (no content), so the
    // deepest thing on offer is a REPLAY of the last level from the station before it.
    const cleared = levelStatuses(amberOcean(PLAYABLE), saveWith(PLAYABLE - 1));
    const offers = cleared.filter(enterable).map((s) => s.startStationIndex);
    expect(Math.max(...offers)).toBe(PLAYABLE - 2);
    expect(cleared.find((s) => s.current)).toMatchObject({ state: 'completed', startStationIndex: PLAYABLE - 2 });
    expect(cleared[PLAYABLE]?.state).toBe('noContent');
  });

  it('never starts a run below the deepest station the save has banked', () => {
    // A node cannot be entered unless unlockedStation >= n - 1, so the start is always a checkpoint
    // the player has actually reached: the map can never hand out unearned depth.
    for (let unlocked = -1; unlocked < PLAYABLE; unlocked++) {
      for (const status of levelStatuses(amberOcean(PLAYABLE), saveWith(unlocked))) {
        if (!enterable(status)) continue;
        expect(status.startStationIndex, `unlocked=${unlocked}`).toBeLessThanOrEqual(unlocked);
      }
    }
  });
});

// -------------------------------------------------------------------------------------------
// Saves that never came out of writeSave
// -------------------------------------------------------------------------------------------

describe('garbage saves never break the map', () => {
  const world = amberOcean(PLAYABLE);
  const garbage: unknown[] = [
    '3',
    '',
    true,
    false,
    null,
    undefined,
    {},
    [],
    [3],
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    1e308,
    -1e308,
    1e21,
    -0,
    -0.5,
    17.9,
    Number.EPSILON,
  ];

  it('always answers with a legal set of nodes, whatever unlockedStation is', () => {
    for (const raw of garbage) {
      const save = saveWith(raw as number);
      const statuses = levelStatuses(world, save);
      expect(statuses, String(raw)).toHaveLength(TOTAL_LEVELS);
      for (const s of statuses) {
        expect(['noContent', 'locked', 'available', 'completed'], String(raw)).toContain(s.state);
        expect(Number.isInteger(s.shells), `${String(raw)} shells=${s.shells}`).toBe(true);
        expect(s.shells).toBeGreaterThanOrEqual(0);
        expect(s.shells).toBeLessThanOrEqual(3);
        expect(Number.isInteger(s.startStationIndex), String(raw)).toBe(true);
      }
      // Exactly one current whenever anything can be entered; never two.
      const currents = statuses.filter((s) => s.current);
      expect(currents.length, String(raw)).toBe(statuses.some(enterable) ? 1 : 0);
    }
  });

  it('treats a non-numeric unlockedStation as a fresh profile, not as station 0', () => {
    for (const raw of ['3', true, null, undefined, {}, [], Number.NaN]) {
      const statuses = levelStatuses(world, saveWith(raw as number));
      expect(statuses[0]?.state, String(raw)).toBe('available');
      expect(statuses[1]?.state, String(raw)).toBe('locked');
    }
  });

  it('survives a save whose shells came from a different, larger campaign', () => {
    // The player played a build with 18 levels; this build ships 5. The map must not paint conchas on
    // nodes that no longer have content, and must not lose the ones that do.
    const shells: Record<number, number> = {};
    for (let i = 0; i < TOTAL_LEVELS; i++) shells[i] = 3;
    const statuses = levelStatuses(world, saveWith(TOTAL_LEVELS - 1, shells));
    expect(statuses.slice(0, PLAYABLE).map((s) => s.shells)).toEqual(Array(PLAYABLE).fill(3));
    expect(statuses.slice(PLAYABLE).every((s) => s.state === 'noContent' && s.shells === 0)).toBe(true);
    expect(statuses.filter((s) => s.current).map((s) => s.level.index)).toEqual([PLAYABLE - 1]);
  });

  it('clamps every conceivable shell value into 0..3 integers', () => {
    const values: unknown[] = [
      -1,
      -0,
      -0.5,
      0.5,
      2.9999,
      3,
      4,
      1e9,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NaN,
      '3',
      true,
      null,
      undefined,
      [],
      {},
      [3],
    ];
    for (const value of values) {
      const shells = { 0: value } as unknown as Record<number, number>;
      const status = levelStatuses(world, saveWith(0, shells))[0];
      expect(status?.state).toBe('completed');
      expect(Number.isInteger(status?.shells), `value=${String(value)} -> ${String(status?.shells)}`).toBe(true);
      expect(status?.shells).toBeGreaterThanOrEqual(0);
      expect(status?.shells).toBeLessThanOrEqual(3);
    }
  });

  it('reads shells by immersion index only, ignoring stray keys', () => {
    const shells = { '-1': 3, '1.5': 3, x: 3, toString: 3, '0': 2 } as unknown as Record<number, number>;
    const statuses = levelStatuses(world, saveWith(1, shells));
    expect(statuses.map((s) => s.shells).slice(0, 3)).toEqual([2, 0, 0]);
  });
});

// -------------------------------------------------------------------------------------------
// The save round trip: what loadSave hands the map
// -------------------------------------------------------------------------------------------

describe('the save contract the map is fed', () => {
  const world = amberOcean(PLAYABLE);

  function loadedFrom(raw: unknown): SaveData {
    const store = new MemoryStore();
    store.set(SAVE_KEY, JSON.stringify({ ...defaultSave(), unlockedStation: raw }));
    return loadSave(store);
  }

  it('never marks level 1 completed for a save that reached no station', () => {
    // Was FAILING when this file was written, fixed in `save.ts`: the two clamps disagreed in (-1, 0).
    // `worlds.ts` floors ("clamped like the save sanitizer"), but `save.ts` TRUNCATED —
    // `Math.max(-1, Math.trunc(-0.5))` is -0, which every
    // comparison in `levelStatuses` reads as 0, so a corrupt save of -0.4 hands out station 0: level 1
    // is drawn completed and level 2 opens, without a single station ever having been reached. It also
    // sticks: `JSON.stringify(-0)` is "0", so the next `writeSave` persists the unearned checkpoint.
    // Anything below zero means "no checkpoint": the first node must stay merely available, because a
    // completed node is also a claim that the player has seen that level's station.
    for (const raw of [-1, -0.4, -0.5, -0.9, -1.5, -2, -99]) {
      const save = loadedFrom(raw);
      const statuses = levelStatuses(world, save);
      expect(statuses[0]?.state, `raw=${raw} -> unlockedStation=${save.unlockedStation}`).toBe('available');
      expect(statuses[1]?.state, `raw=${raw}`).toBe('locked');
    }
  });

  it('agrees with the sanitizer about every unlockedStation the map can be handed', () => {
    // The map may be given a save straight from `loadSave` or (in tests and in the shell's own
    // `Object.assign(ctx.save, ...)`) a plain object; both must paint the same nodes.
    for (const raw of [-2, -1, 0, 0.5, 1, 1.9, 4, 99, Number.NaN, 'x', null]) {
      const save = loadedFrom(raw);
      const viaSave = levelStatuses(world, save).map((s) => s.state);
      const viaRaw = levelStatuses(world, saveWith(raw as number)).map((s) => s.state);
      expect(viaSave, `raw=${String(raw)} -> ${save.unlockedStation}`).toEqual(viaRaw);
    }
  });

  it('reads a fresh save as "only the first level, nothing banked"', () => {
    const statuses = levelStatuses(world, defaultSave());
    expect(statuses[0]).toMatchObject({ state: 'available', current: true, shells: 0, startStationIndex: -1 });
    expect(statuses.slice(1, PLAYABLE).every((s) => s.state === 'locked')).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------
// Purity
// -------------------------------------------------------------------------------------------

describe('levelStatuses is pure', () => {
  it('leaves the save it was handed exactly as it found it', () => {
    const save = saveWith(2, { 0: 3, 1: 1 });
    const before = JSON.stringify(save);
    levelStatuses(amberOcean(PLAYABLE), save);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('works on a deeply frozen world and save', () => {
    const world = amberOcean(PLAYABLE);
    world.levels.forEach((l) => Object.freeze(l));
    Object.freeze(world.levels);
    Object.freeze(world);
    const save = Object.freeze(saveWith(1, Object.freeze({ 0: 2 }) as Record<number, number>));
    expect(() => levelStatuses(world, save)).not.toThrow();
    expect(levelStatuses(world, save).map((s) => s.state)).toEqual(levelStatuses(amberOcean(PLAYABLE), saveWith(1, { 0: 2 })).map((s) => s.state));
  });

  it('gives the same answer every time for the same inputs', () => {
    const world = amberOcean(PLAYABLE);
    const save = saveWith(1, { 0: 3 });
    expect(JSON.stringify(levelStatuses(world, save))).toBe(JSON.stringify(levelStatuses(world, save)));
  });

  it('hands out worlds that cannot be corrupted by a previous caller', () => {
    const a = worlds(PLAYABLE);
    const b = worlds(PLAYABLE);
    expect(a[0]?.levels).not.toBe(b[0]?.levels);
    expect(a[1]?.levels).not.toBe(b[1]?.levels);
    (a[1]?.levels as unknown as unknown[]).push({ index: 0, zone: 0, immersionIndex: 0 });
    expect(worlds(PLAYABLE)[1]?.levels).toEqual([]);
  });

  it('hands back the world`s own levels, so a caller must treat them as read-only', () => {
    // Documented, not endorsed: `status.level` IS `world.levels[i]`, not a copy. `MapScene`/`MapNode`
    // only read it, and `worlds()` mints a fresh world per call, so nothing is corrupted today — but a
    // future caller that writes through a status would change what the next `levelStatuses` reports.
    const world = amberOcean(PLAYABLE);
    const statuses = levelStatuses(world, saveWith(0));
    statuses.forEach((s, i) => expect(s.level).toBe(world.levels[i]));
    (statuses[1]?.level as { immersionIndex: number | null }).immersionIndex = null;
    expect(levelStatuses(world, saveWith(0))[1]?.state).toBe('noContent');
    expect(levelStatuses(amberOcean(PLAYABLE), saveWith(0))[1]?.state).toBe('available');
  });
});

// -------------------------------------------------------------------------------------------
// The current node, exhaustively
// -------------------------------------------------------------------------------------------

describe('exactly one current node, for every campaign size and every save', () => {
  it('is always the deepest enterable node and never a locked or empty one', () => {
    for (let built = 0; built <= TOTAL_LEVELS; built++) {
      for (let unlocked = -3; unlocked <= TOTAL_LEVELS + 2; unlocked++) {
        const label = `built=${built} unlocked=${unlocked}`;
        const statuses = levelStatuses(amberOcean(built), saveWith(unlocked));
        const currents = statuses.filter((s) => s.current);
        const open = statuses.filter(enterable);
        expect(currents.length, label).toBe(open.length > 0 ? 1 : 0);
        if (open.length === 0) continue;
        const current = currents[0];
        expect(enterable(current as LevelStatus), label).toBe(true);
        expect(current?.level.index, label).toBe(open[open.length - 1]?.level.index);
        // States are monotonic along the path: completed*, then at most one available, then locked*,
        // then noContent*. A hole would make the "deepest enterable" answer meaningless.
        const order = ['completed', 'available', 'locked', 'noContent'];
        const ranks = statuses.map((s) => order.indexOf(s.state));
        expect([...ranks].sort((x, y) => x - y), label).toEqual(ranks);
        expect(statuses.filter((s) => s.state === 'available').length, label).toBeLessThanOrEqual(1);
      }
    }
  });
});

// -------------------------------------------------------------------------------------------
// map -> run -> save -> map, with the bot closing the loop
// -------------------------------------------------------------------------------------------

describe('the loop: what the map promises, the run banks, the map redraws', () => {
  it('turns the node just played into a completed one with its conchas', () => {
    const store = new MemoryStore();
    const world = amberOcean(PLAYABLE);
    // A player who has banked station 0: the map opens level 2 (index 1) and calls it current.
    store.set(SAVE_KEY, JSON.stringify({ ...defaultSave(), unlockedStation: 0 }));
    const before = levelStatuses(world, loadSave(store));
    const target = before.find((s) => s.current);
    expect(target?.level.index).toBe(1);
    expect(target?.state).toBe('available');

    // Play exactly the run that node promises, from the checkpoint it names.
    const game = createMvpWorld({ startStationIndex: target?.startStationIndex ?? -1, store });
    const finger = new GuidedFinger(T);
    let snap: WorldSnapshot = game.snapshot();
    let frames = 0;
    const budget = 300 * 60;
    for (; frames < budget && snap.run.lastStationIndex < 1; frames++) {
      game.update(STEP_MS, finger.next(STEP_MS, snap));
      snap = game.snapshot();
      if (snap.phase === 'dead') game.restart();
    }
    expect(frames, 'the bot never reached the station the node promised').toBeLessThan(budget);
    expect(snap.phase).toBe('station');

    // The map is rebuilt from the store exactly as `toMap` does it in the shell.
    const after = levelStatuses(world, loadSave(store));
    expect(after[1]?.state).toBe('completed');
    expect(after[2]?.state).toBe('available');
    expect(after.filter((s) => s.current).map((s) => s.level.index)).toEqual([2]);
    expect(after[1]?.shells).toBe(Math.min(3, loadSave(store).shellsByImmersion[1] ?? 0));
    // Nothing the player had is taken away by finishing a level.
    expect(after[0]?.state).toBe('completed');
  }, 60_000);
});
