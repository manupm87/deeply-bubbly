import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../ports';
import { MemoryStore } from '../ports';
import { SAVE_KEY, defaultSave, loadSave, writeSave } from './save';

describe('defaultSave', () => {
  it('is a fresh profile with no station unlocked', () => {
    expect(defaultSave()).toEqual({
      version: 1,
      unlockedStation: -1,
      bestDepthM: 0,
      pearls: 0,
      shellsByImmersion: {},
      settings: { slowCharge: false, assistedTrajectory: false, noShake: false, calm: false, sound: true },
      tutorialDone: false,
    });
  });

  it('returns a fresh object every call', () => {
    const a = defaultSave();
    a.pearls = 9;
    a.shellsByImmersion[0] = 3;
    expect(defaultSave().pearls).toBe(0);
    expect(defaultSave().shellsByImmersion).toEqual({});
  });
});

describe('write + load round trip', () => {
  it('preserves every field', () => {
    const store = new MemoryStore();
    const data = {
      ...defaultSave(),
      unlockedStation: 4,
      bestDepthM: 1234.5,
      pearls: 77,
      shellsByImmersion: { 0: 3, 1: 1 },
      settings: { slowCharge: true, assistedTrajectory: true, noShake: true, calm: true, sound: false },
      tutorialDone: true,
    };
    writeSave(store, data);
    expect(loadSave(store)).toEqual(data);
    expect(store.get(SAVE_KEY)).not.toBeNull();
  });

  it('overwrites the previous save under the same key', () => {
    const store = new MemoryStore();
    writeSave(store, { ...defaultSave(), pearls: 1 });
    writeSave(store, { ...defaultSave(), pearls: 2 });
    expect(loadSave(store).pearls).toBe(2);
  });
});

describe('loadSave validation (never throws)', () => {
  const loadRaw = (raw: string | null): ReturnType<typeof loadSave> => {
    const store = new MemoryStore();
    if (raw !== null) store.set(SAVE_KEY, raw);
    return loadSave(store);
  };

  it('returns defaults for an empty store', () => {
    expect(loadRaw(null)).toEqual(defaultSave());
  });

  it('returns defaults for corrupt JSON', () => {
    for (const raw of ['', '{', 'not json', '[1,2,3]', 'null', '"a string"', '42']) {
      expect(loadRaw(raw)).toEqual(defaultSave());
    }
  });

  it('returns defaults for a wrong or missing version', () => {
    expect(loadRaw(JSON.stringify({ ...defaultSave(), version: 2, pearls: 50 }))).toEqual(defaultSave());
    expect(loadRaw(JSON.stringify({ ...defaultSave(), version: '1', pearls: 50 }))).toEqual(defaultSave());
    const noVersion: Record<string, unknown> = { ...defaultSave(), pearls: 50 };
    delete noVersion['version'];
    expect(loadRaw(JSON.stringify(noVersion))).toEqual(defaultSave());
  });

  it('fills in missing fields and keeps the valid ones', () => {
    const loaded = loadRaw(JSON.stringify({ version: 1, pearls: 12 }));
    expect(loaded.pearls).toBe(12);
    expect(loaded.unlockedStation).toBe(-1);
    expect(loaded.bestDepthM).toBe(0);
    expect(loaded.shellsByImmersion).toEqual({});
    expect(loaded.settings).toEqual(defaultSave().settings);
    expect(loaded.tutorialDone).toBe(false);
  });

  it('rejects mistyped, non-finite and out-of-range scalars', () => {
    const loaded = loadRaw(
      JSON.stringify({
        version: 1,
        unlockedStation: -9,
        bestDepthM: -100,
        pearls: 'many',
        tutorialDone: 'yes',
        settings: 12,
      }),
    );
    expect(loaded.unlockedStation).toBe(-1);
    expect(loaded.bestDepthM).toBe(0);
    expect(loaded.pearls).toBe(0);
    expect(loaded.tutorialDone).toBe(false);
    expect(loaded.settings).toEqual(defaultSave().settings);

    // NaN / Infinity do not survive JSON, so exercise them through writeSave too.
    const store = new MemoryStore();
    writeSave(store, { ...defaultSave(), bestDepthM: Number.NaN, pearls: Number.POSITIVE_INFINITY });
    expect(loadSave(store).bestDepthM).toBe(0);
    expect(loadSave(store).pearls).toBe(0);
  });

  it('accepts partial settings and drops unknown keys', () => {
    const loaded = loadRaw(JSON.stringify({ version: 1, settings: { calm: true, bogus: 3, sound: 'loud' } }));
    expect(loaded.settings).toEqual({
      slowCharge: false,
      assistedTrajectory: false,
      noShake: false,
      calm: true,
      sound: true, // 'loud' is not a boolean → default
    });
    expect(Object.keys(loaded.settings)).toHaveLength(5);
  });

  it('sanitises shellsByImmersion entry by entry', () => {
    const loaded = loadRaw(
      JSON.stringify({ version: 1, shellsByImmersion: { 0: 3, 2: 'x', '-1': 5, 'a': 2, 1.5: 1, 7: 2 } }),
    );
    expect(loaded.shellsByImmersion).toEqual({ 0: 3, 7: 2 });
  });

  it('ignores a shellsByImmersion that is not an object', () => {
    expect(loadRaw(JSON.stringify({ version: 1, shellsByImmersion: [1, 2] })).shellsByImmersion).toEqual({});
    expect(loadRaw(JSON.stringify({ version: 1, shellsByImmersion: null })).shellsByImmersion).toEqual({});
  });

  it('survives a store that throws on read', () => {
    const hostile: KeyValueStore = {
      get: () => {
        throw new Error('storage unavailable');
      },
      set: () => {},
      remove: () => {},
    };
    expect(() => loadSave(hostile)).not.toThrow();
    expect(loadSave(hostile)).toEqual(defaultSave());
  });
});

describe('writeSave', () => {
  it('sanitises on the way out, so a corrupt in-memory save is never persisted', () => {
    const store = new MemoryStore();
    writeSave(store, { ...defaultSave(), unlockedStation: -50, bestDepthM: Number.NaN });
    const loaded = loadSave(store);
    expect(loaded.unlockedStation).toBe(-1);
    expect(loaded.bestDepthM).toBe(0);
  });

  it('survives a store that throws on write (quota exceeded)', () => {
    const hostile: KeyValueStore = {
      get: () => null,
      set: () => {
        throw new Error('quota exceeded');
      },
      remove: () => {},
    };
    expect(() => writeSave(hostile, defaultSave())).not.toThrow();
  });
});
