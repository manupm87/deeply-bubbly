/**
 * Adversarial review of `game/GameWorld.ts` — the façade's own rules, not the modules it composes.
 *
 * Two contracts are checked here:
 *  - GDD §2.1, the sentence the whole aim design is built on: "Con el origen congelado, **dedo quieto
 *    = tiro quieto**."
 *  - GDD §6.1 / §12.1 ("guardado local del progreso"): the save is permanent meta-progression. Perlas
 *    and conchas already earned are not a report of the current run.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { MemoryStore } from '../ports';
import { SAVE_KEY, defaultSave } from '../run/save';
import { ScriptedFinger, createTestWorld } from './testHarness';
import type { PointerInput, WorldSnapshot } from '../types';
import type { SaveData } from '../run/save';
import type { GameWorld } from './GameWorld';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;
const UP: PointerInput = { down: false, x: 0, y: 0 };

function readSave(store: MemoryStore): SaveData {
  return JSON.parse(store.get(SAVE_KEY) ?? '{}') as SaveData;
}

describe('a still finger is a still shot (§2.1)', () => {
  /**
   * `aimOrigin` is frozen in WORLD coordinates at the pointerdown (§2.1, §11.4), but `GameWorld.step`
   * re-converts the pointer from viewport to world every step with the camera OF THAT STEP. The camera
   * scrolls while Bur is charging — she is outside the dead zone whenever she is descending, and from
   * Z3 the "corriente mínima" of §4.3 scrolls it unconditionally — so the world-space vector from the
   * frozen origin to a motionless finger rotates on its own.
   *
   * This is exactly the failure §2.1 introduces the frozen origin to prevent ("el tiro rotaría solo
   * bajo un dedo completamente quieto"); freezing the origin in world space while measuring the finger
   * in world space through a moving camera reintroduces it one level up.
   */
  it('holds the aim while the camera scrolls under a motionless pointer', () => {
    const world = createTestWorld();
    let snap = world.snapshot();

    // A full charge straight down, released: Bur now descends at ~417 px/s and the camera chases her.
    for (let i = 0; i < 34; i++) {
      world.update(STEP_MS, { down: true, x: snap.bubble.pos.x, y: snap.bubble.pos.y - snap.camera.y + 45 });
      snap = world.snapshot();
    }
    for (let i = 0; i < 19; i++) {
      world.update(STEP_MS, UP); // release + the LAUNCH_LOCK_MS window, so a press is accepted again
      snap = world.snapshot();
    }
    expect(snap.bubble.vel.y).toBeGreaterThan(200); // the camera really is following her down

    // From here the finger never moves: one fixed viewport point, sampled every frame.
    const pointer: PointerInput = { down: true, x: snap.bubble.pos.x + 10, y: snap.bubble.pos.y - snap.camera.y + 45 };
    const thetas: number[] = [];
    for (let i = 0; i < 30; i++) {
      world.update(STEP_MS, pointer);
      snap = world.snapshot();
      thetas.push(snap.bubble.aimTheta);
    }

    expect(snap.bubble.state).toBe('CHARGING');
    const first = thetas[0] ?? 0;
    const last = thetas[thetas.length - 1] ?? 0;
    // Half a second of a perfectly still thumb currently rotates the shot by ~8°.
    expect(Math.abs(last - first)).toBeLessThan(1e-6);
  });
});

describe('the save is progress, not a report of this run (§6.1, §12.1)', () => {
  it('never lowers the pearls already banked', () => {
    const store = new MemoryStore();
    const saved: SaveData = { ...defaultSave(), bestDepthM: 200, pearls: 500 };
    store.set(SAVE_KEY, JSON.stringify(saved));

    const world = createTestWorld({ store });
    const snap = playToTheBottom(world);

    // Guard against a vacuous pass: `persist` must actually have run at least once.
    expect(snap.run.lastStationIndex).toBeGreaterThanOrEqual(0);
    expect(snap.run.pearls).toBeLessThan(500);
    expect(readSave(store).pearls).toBeGreaterThanOrEqual(500);
  });

  it('does not erase the conchas of the last immersion when the campaign ends', () => {
    // `checkCampaignEnd` calls `persist(run.lastStationIndex, 0)` — a hard-coded zero written under the
    // index of an immersion that was completed (and correctly persisted) earlier. Starting AT that
    // station isolates the call: no station is entered during this run, so the only write is that one.
    const store = new MemoryStore();
    const saved: SaveData = {
      ...defaultSave(),
      unlockedStation: 1,
      bestDepthM: 200,
      pearls: 40,
      shellsByImmersion: { 1: 3 },
    };
    store.set(SAVE_KEY, JSON.stringify(saved));

    const world = createTestWorld({ store, startStationIndex: 1 });
    const snap = playToTheBottom(world);

    expect(snap.phase).toBe('campaignComplete');
    expect(readSave(store).shellsByImmersion[1]).toBe(3);
  });
});

/** The bot of `GameWorld.test.ts`: charges 400 ms, releases, repeats, answering both prompts. */
function playToTheBottom(world: GameWorld): WorldSnapshot {
  const finger = new ScriptedFinger(400, 140, 45, 16);
  let snap = world.snapshot();
  for (let i = 0; i < 120 * 60; i++) {
    world.update(STEP_MS, finger.next(STEP_MS, snap.bubble.pos.x, snap.bubble.pos.y, snap.camera.y));
    snap = world.snapshot();
    if (snap.phase === 'station') world.continueDescent();
    if (snap.phase === 'dead') world.restart();
    if (snap.phase === 'campaignComplete') break;
  }
  return snap;
}
