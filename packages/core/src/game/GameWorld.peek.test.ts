/**
 * D5 "ojeo" through the façade: what `setPeek` may and may not change.
 *
 * The whole feature is a promise about what does NOT happen — the view moves and the GAME does not —
 * so almost every test here runs a TWIN world: two `createMvpWorld()` instances stepped with exactly
 * the same pointer samples, one of them peeking. Anything that differs between the twins beyond
 * `peekX/peekY/renderX/renderY` is a bug, whether it is the camera ratchet, the streaming or the shot.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { WorldStreamer } from '../level/streaming';
import { POINTER_UP, buildMvpCampaign, createMvpWorld, pullGesture } from './testHarness';
import type { GameWorld } from './GameWorld';
import type { PointerInput, WorldSnapshot } from '../types';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;
/** Where a peek to the far right lands the view: the right edge of the 540 px world (D3). */
const X_MAX = T.WORLD_W - T.VIEW_W;

/** Steps every world with the same sample until they are all resting under the opening raft (§2.3). */
function settle(...worlds: GameWorld[]): WorldSnapshot {
  for (let i = 0; i < 400; i++) {
    const snaps = worlds.map((w) => w.snapshot());
    if (snaps.every((s) => s.bubble.state === 'RESTING')) return snaps[0] as WorldSnapshot;
    for (const w of worlds) w.update(STEP_MS, POINTER_UP);
  }
  throw new Error('Bur never rested');
}

/** One step of every world with the same pointer; only `peeking` is told where to look. */
function stepBoth(a: GameWorld, b: GameWorld, pointer: PointerInput): void {
  a.update(STEP_MS, pointer);
  b.update(STEP_MS, pointer);
}

/** Everything a peek is forbidden to touch. `toBe`, not `toBeCloseTo`: the twins must be identical. */
function expectSameWorld(a: WorldSnapshot, b: WorldSnapshot): void {
  expect(a.camera.x).toBe(b.camera.x);
  expect(a.camera.y).toBe(b.camera.y);
  expect(a.camera.maxY).toBe(b.camera.maxY);
  expect(a.camera.lookaheadPx).toBe(b.camera.lookaheadPx);
  expect(a.bubble.state).toBe(b.bubble.state);
  expect(a.bubble.pos).toEqual(b.bubble.pos);
  expect(a.bubble.vel).toEqual(b.bubble.vel);
  expect(a.bubble.air).toBe(b.bubble.air);
  expect(a.bubble.restingOnId).toBe(b.bubble.restingOnId);
  expect(a.bubble.aimOrigin === null).toBe(b.bubble.aimOrigin === null);
  expect(a.run.maxProgressY).toBe(b.run.maxProgressY);
  expect(a.zone).toBe(b.zone);
  expect(a.entities.length).toBe(b.entities.length);
}

/** A full-power pull, ramped like a thumb, played on both worlds from the same viewport anchor. */
function pullAndRelease(a: GameWorld, b: GameWorld, anchor: { x: number; y: number }, peek: () => void): void {
  const pull = pullGesture(1, 20, T);
  for (let i = 0; i < 34; i++) {
    const stretch = Math.min(1, i / 6);
    peek();
    stepBoth(a, b, { down: true, x: anchor.x + pull.x * stretch, y: anchor.y + pull.y * stretch });
  }
  peek();
  stepBoth(a, b, POINTER_UP); // the release IS the shot (D2)
}

describe('setPeek: the view moves and the game does not', () => {
  it('moves renderX / renderY while camera.x, camera.y and Bur stay bit-for-bit identical', () => {
    const peeking = createMvpWorld();
    const twin = createMvpWorld();
    const start = settle(peeking, twin);
    const target = { x: 520, y: start.bubble.pos.y + 150 };

    for (let i = 0; i < 60; i++) {
      peeking.setPeek(target);
      stepBoth(peeking, twin, POINTER_UP);
    }

    const a = peeking.snapshot();
    const b = twin.snapshot();
    expectSameWorld(a, b);
    // The view really did travel: from the middle column of the world to its right edge.
    expect(b.camera.renderX).toBe(b.camera.x);
    expect(a.camera.renderX).toBeGreaterThan(a.camera.x + 100);
    expect(a.camera.renderX).toBeCloseTo(X_MAX, 1);
    expect(a.camera.renderY).toBeGreaterThan(b.camera.renderY + 50);
    expect(a.camera.renderY).toBeCloseTo(a.camera.y + a.camera.lookaheadPx + a.camera.peekY, 9);
  });

  it('glides back to the camera on release, and lands on it exactly', () => {
    const world = createMvpWorld();
    const twin = createMvpWorld();
    const start = settle(world, twin);
    for (let i = 0; i < 60; i++) {
      world.setPeek({ x: 520, y: start.bubble.pos.y });
      stepBoth(world, twin, POINTER_UP);
    }
    expect(world.snapshot().camera.peekX).toBeGreaterThan(100);

    world.setPeek(null);
    for (let i = 0; i < 90; i++) stepBoth(world, twin, POINTER_UP); // 1,5 s, the e2e budget
    const a = world.snapshot();
    expect(a.camera.peekX).toBe(0);
    expect(a.camera.peekY).toBe(0);
    expect(a.camera.renderX).toBe(a.camera.x);
    expectSameWorld(a, twin.snapshot());
  });

  it('does not reach further down than PEEK_DOWN_PX from the live camera', () => {
    const world = createMvpWorld();
    const start = settle(world);
    for (let i = 0; i < 120; i++) {
      world.setPeek({ x: 270, y: start.bubble.pos.y + 5000 });
      world.update(STEP_MS, POINTER_UP);
    }
    const down = world.snapshot().camera;
    expect(down.peekY).toBeGreaterThan(0);
    expect(down.peekY).toBeLessThanOrEqual(T.PEEK_DOWN_PX + 1e-6);
  });

  it('looks up into nothing at the surface: there is no chunk above y = 0 to show', () => {
    const world = createMvpWorld();
    const start = settle(world);
    expect(start.camera.y).toBeLessThan(0); // the opening view hangs over the surface
    for (let i = 0; i < 120; i++) {
      world.setPeek({ x: 270, y: start.bubble.pos.y - 5000 });
      world.update(STEP_MS, POINTER_UP);
    }
    // Nothing happens, and above all the view is not shoved DOWN to the first streamed row.
    const up = world.snapshot().camera;
    expect(up.peekY).toBe(0);
    expect(up.renderY).toBe(up.y + up.lookaheadPx);
  });
});

describe('setPeek and the slingshot (D2)', () => {
  it('launches with exactly the same velocity peeked as not peeked: the pull is relative', () => {
    const peeking = createMvpWorld();
    const twin = createMvpWorld();
    const start = settle(peeking, twin);
    const target = { x: 520, y: start.bubble.pos.y + 120 };

    // One finger walks the view to the right edge and STAYS on the minimap...
    for (let i = 0; i < 60; i++) {
      peeking.setPeek(target);
      stepBoth(peeking, twin, POINTER_UP);
    }
    const before = peeking.snapshot();
    expect(before.camera.peekX).toBeGreaterThan(100);

    // ...while the other pulls the sling. Same viewport samples in both worlds.
    const anchor = { x: before.bubble.pos.x - before.camera.x, y: before.bubble.pos.y - before.camera.y };
    pullAndRelease(peeking, twin, anchor, () => peeking.setPeek(target));

    const a = peeking.snapshot();
    const b = twin.snapshot();
    expect(a.bubble.state).toBe('LAUNCHED');
    expect(Math.hypot(a.bubble.vel.x, a.bubble.vel.y)).toBeGreaterThan(0);
    // Equal to the last ulp but one, not bit for bit: the pull is `(finger + C) - (origin + C)` and
    // with the peek in it that C is ~400 px instead of ~200, which rounds the subtraction one bit
    // differently. 1e-9 px/s of launch speed is 10 000 times finer than the physics step can see.
    expect(a.bubble.vel.x).toBeCloseTo(b.bubble.vel.x, 9);
    expect(a.bubble.vel.y).toBeCloseTo(b.bubble.vel.y, 9);
    expect(a.bubble.pos.x).toBeCloseTo(b.bubble.pos.x, 9);
    expect(a.bubble.pos.y).toBeCloseTo(b.bubble.pos.y, 9);
    // And the second finger is still steering: the view has not come home.
    expect(a.camera.peekX).toBeGreaterThan(100);
  });

  it('freezes the aim origin at the world point under the finger ON THE PEEKED VIEW', () => {
    const world = createMvpWorld();
    const start = settle(world);
    const target = { x: 520, y: start.bubble.pos.y + 120 };
    for (let i = 0; i < 60; i++) {
      world.setPeek(target);
      world.update(STEP_MS, POINTER_UP);
    }

    // The camera the contact is converted against is the one the player SAW: the step reads the
    // pointer before it moves the camera, so the offsets of this snapshot are the ones that count.
    // COPIED, not aliased: `snapshot()` hands out the live camera and the next step will move it.
    const live = world.snapshot().camera;
    const seen = { x: live.x, y: live.y, peekX: live.peekX, peekY: live.peekY };
    const finger = { down: true, x: 40, y: 90 };
    world.setPeek(target);
    world.update(STEP_MS, finger);

    const origin = world.snapshot().bubble.aimOrigin;
    expect(origin).not.toBeNull();
    expect(origin?.x).toBeCloseTo(finger.x + seen.x + seen.peekX, 9);
    expect(origin?.y).toBeCloseTo(finger.y + seen.y + seen.peekY, 9);
    // Which is NOT where the un-peeked view would have put it: the peek is what makes the sling band
    // appear under the thumb instead of a screen to the left of it.
    expect(origin?.x).toBeGreaterThan(finger.x + seen.x + 100);
  });

  it('freezes the RETURNING view when a pull starts, and lets it go home on release', () => {
    const world = createMvpWorld();
    const twin = createMvpWorld();
    const start = settle(world, twin);
    for (let i = 0; i < 60; i++) {
      world.setPeek({ x: 520, y: start.bubble.pos.y });
      stepBoth(world, twin, POINTER_UP);
    }

    // The minimap finger lifts and the view starts gliding back...
    world.setPeek(null);
    for (let i = 0; i < 10; i++) stepBoth(world, twin, POINTER_UP);
    const returning = world.snapshot().camera.peekX;
    expect(returning).toBeGreaterThan(100);
    expect(returning).toBeLessThan(T.WORLD_W); // it did move: the return is under way

    // ...and the player presses mid-glide. The view she aims on is the view she shoots on.
    const snap = world.snapshot();
    const anchor = { x: snap.bubble.pos.x - snap.camera.x, y: snap.bubble.pos.y - snap.camera.y };
    const pull = pullGesture(1, 0, T);
    for (let i = 0; i < 20; i++) {
      const stretch = Math.min(1, i / 6);
      stepBoth(world, twin, { down: true, x: anchor.x + pull.x * stretch, y: anchor.y + pull.y * stretch });
      expect(world.snapshot().bubble.aimOrigin).not.toBeNull();
      expect(world.snapshot().camera.peekX).toBe(returning);
    }

    // The release ends the gesture, so the return resumes on the very next step.
    stepBoth(world, twin, POINTER_UP);
    expect(world.snapshot().camera.peekX).toBeLessThan(returning);
    for (let i = 0; i < 120; i++) stepBoth(world, twin, POINTER_UP);
    expect(world.snapshot().camera.peekX).toBe(0);
    expectSameWorld(world.snapshot(), twin.snapshot());
  });
});

describe('setPeek and the streamed window (§11.5.10)', () => {
  it('never draws water the streamer has not instantiated, all the way down a fall', () => {
    const world = createMvpWorld();
    // A shadow streamer fed exactly what `GameWorld.step` feeds its own at the top of each step: the
    // PRE-step position and ascenso flag. It is the only way to see the window from outside.
    const shadow = new WorldStreamer(buildMvpCampaign(T), T);
    const start = settle(world);

    // Shoot her downwards so the column keeps scrolling under the peek.
    const anchor = { x: start.bubble.pos.x - start.camera.x, y: start.bubble.pos.y - start.camera.y };
    const pull = pullGesture(1, 0, T);
    for (let i = 0; i < 34; i++) {
      const stretch = Math.min(1, i / 6);
      world.update(STEP_MS, { down: true, x: anchor.x + pull.x * stretch, y: anchor.y + pull.y * stretch });
    }

    let deepestPeek = 0;
    for (let i = 0; i < 600; i++) {
      const before = world.snapshot();
      shadow.update(before.bubble.pos.y, before.bubble.flags.ascensoUntil > before.timeMs);
      const window = shadow.windowBounds();

      world.setPeek({ x: 270, y: before.bubble.pos.y + 400 }); // as far down as the finger can ask
      world.update(STEP_MS, POINTER_UP);

      const cam = world.snapshot().camera;
      deepestPeek = Math.max(deepestPeek, cam.peekY);
      // The peeked view is inside the streamed window — or, when the camera itself has outrun the
      // streamer on a fast fall, at least no further out than the un-peeked view already was.
      expect(cam.y + cam.peekY + cam.viewH).toBeLessThanOrEqual(Math.max(window.bottomY, cam.y + cam.viewH) + 1e-6);
      expect(cam.y + cam.peekY).toBeGreaterThanOrEqual(Math.min(window.topY, cam.y) - 1e-6);
      expect(cam.peekY).toBeLessThanOrEqual(T.PEEK_DOWN_PX + 1e-6);
    }
    // Not a vacuous run: the finger really was dragging the view a long way down.
    expect(deepestPeek).toBeGreaterThan(100);
  });

  it('looks up as far as PEEK_UP_PX once there IS streamed water above: the surface is the exception', () => {
    // A run resumed from the first station starts deep in the column, with a chunk instantiated above.
    const world = createMvpWorld({ startStationIndex: 0 });
    const start = settle(world);
    expect(start.camera.y).toBeGreaterThan(T.CHUNK_H);
    for (let i = 0; i < 120; i++) {
      world.setPeek({ x: 270, y: start.bubble.pos.y - 5000 });
      world.update(STEP_MS, POINTER_UP);
    }
    const up = world.snapshot().camera;
    expect(up.peekY).toBeLessThan(0);
    expect(up.peekY).toBeGreaterThanOrEqual(-T.PEEK_UP_PX - 1e-6);
    expect(up.renderY).toBeCloseTo(up.y + up.lookaheadPx + up.peekY, 9);
  });
});

describe('clearPeek: the ending a paused world cannot step to', () => {
  it('drops target and offset at once, and leaves the real camera alone', () => {
    const world = createMvpWorld();
    const twin = createMvpWorld();
    settle(world, twin);
    for (let i = 0; i < 120; i++) {
      world.setPeek({ x: 520, y: world.snapshot().camera.y + 150 });
      world.update(STEP_MS, POINTER_UP);
      twin.update(STEP_MS, POINTER_UP);
    }
    const peeked = world.snapshot().camera;
    expect(Math.abs(peeked.peekX)).toBeGreaterThan(50);

    world.clearPeek();
    const c = world.snapshot().camera;
    const t = twin.snapshot().camera;
    expect(c.peekX).toBe(0);
    expect(c.peekY).toBe(0);
    expect(c.renderX).toBe(c.x);
    expect(c.renderY).toBe(c.y + c.lookaheadPx);
    // The §4.3 camera never noticed any of it.
    expect(c.x).toBe(t.x);
    expect(c.y).toBe(t.y);
    expect(c.maxY).toBe(t.maxY);
    // …and the target is gone too: a step with nobody holding the map does not peek again.
    world.update(STEP_MS, POINTER_UP);
    const after = world.snapshot().camera;
    expect(after.peekX).toBe(0);
    expect(after.peekY).toBe(0);
  });
});
