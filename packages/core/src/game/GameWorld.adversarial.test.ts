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
import { GuidedFinger } from './autoPlayer';
import { createTestWorld } from './testHarness';
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
   * `aimOrigin` is frozen in WORLD coordinates at the pointerdown (D2), but `GameWorld.step`
   * re-converts the pointer from viewport to world every step. If it used the camera OF THAT STEP the
   * world-space vector from the frozen origin to a motionless finger would rotate on its own: the
   * camera scrolls while Bur aims — she is outside the dead zone whenever she is descending, from Z3
   * the "corriente mínima" of §4.3 scrolls it unconditionally, and since D3 it also tracks her in X.
   *
   * This is exactly the failure the frozen origin exists to prevent ("el tiro rotaría solo bajo un
   * dedo completamente quieto"); freezing one end of the vector and measuring the other through a
   * moving camera reintroduces it one level up.
   */
  it('holds the aim while the camera scrolls under a motionless pointer', () => {
    const world = createTestWorld();
    let snap = world.snapshot();

    // Full pulls straight down, released. Bur starts resting under the foam raft of §8 and the raft
    // catches the first shot on the way back up (§2.3), so the gesture is repeated until she is really
    // falling, with the camera chasing her, which is what this test needs.
    const falling = (): boolean => snap.bubble.restingOnId === null && snap.bubble.vel.y > 150;
    for (let round = 0; round < 12 && !falling(); round++) {
      // Wait for a ledge first: D1 launches come from REST, and a press in open water would spend the
      // one double jump of this fall — which is the gesture the rest of the test is about to make.
      for (let i = 0; i < 600 && snap.bubble.state !== 'RESTING' && !falling(); i++) {
        world.update(STEP_MS, UP);
        snap = world.snapshot();
      }
      if (falling()) break;
      // D2: the origin freezes at the FINGER, and the sling is drawn UP for a downward shot.
      const anchor = { x: snap.bubble.pos.x - snap.camera.x, y: snap.bubble.pos.y - snap.camera.y };
      for (let i = 0; i < 34; i++) {
        const stretch = Math.min(1, i / 6);
        world.update(STEP_MS, { down: true, x: anchor.x, y: anchor.y - T.PULL_MAX_PX * stretch });
        snap = world.snapshot();
      }
      for (let i = 0; i < 19; i++) {
        world.update(STEP_MS, UP); // release + the LAUNCH_LOCK_MS window, so a press is accepted again
        snap = world.snapshot();
      }
    }
    expect(snap.bubble.vel.y).toBeGreaterThan(150); // the camera really is following her down
    expect(snap.bubble.restingOnId).toBeNull();

    // From here the finger never moves: one fixed viewport point for the press, one for the pull.
    const origin = { x: snap.bubble.pos.x - snap.camera.x, y: snap.bubble.pos.y - snap.camera.y + 20 };
    world.update(STEP_MS, { down: true, ...origin });
    const pointer: PointerInput = { down: true, x: origin.x + 10, y: origin.y - 60 };
    const thetas: number[] = [];
    const pulls: number[] = [];
    for (let i = 0; i < 30; i++) {
      world.update(STEP_MS, pointer);
      snap = world.snapshot();
      thetas.push(snap.bubble.pullTheta);
      pulls.push(snap.bubble.pullDist);
    }

    expect(snap.bubble.state).toBe('AIMING');
    const first = thetas[0] ?? 0;
    const last = thetas[thetas.length - 1] ?? 0;
    expect(Math.abs(last - first)).toBeLessThan(1e-6);
    for (const pull of pulls) expect(pull).toBeCloseTo(pulls[0] ?? 0, 12);
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
  // The aiming autoplayer of `game/autoPlayer.ts`, not a metronome: since D1/D3/D4 a fixed cadence
  // misses every hop by design, so a save test built on one would never reach a station to persist.
  const finger = new GuidedFinger(T);
  let snap = world.snapshot();
  for (let i = 0; i < 240 * 60; i++) {
    world.update(STEP_MS, finger.next(STEP_MS, snap));
    snap = world.snapshot();
    if (snap.phase === 'station') world.continueDescent();
    if (snap.phase === 'dead') world.restart();
    if (snap.phase === 'campaignComplete') break;
  }
  return snap;
}
