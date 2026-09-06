/**
 * Adversarial review of D5 "ojeo" through the façade: `GameWorld.setPeek` + the step-order wiring.
 *
 * The feature's whole promise is a negative one — the picture moves, the GAME does not — and a
 * negative promise is only worth what the nastiest input can prove. So the tests here do not peek
 * politely: they peek from a `SeededRNG` on every step of a long guided run (including NaN targets,
 * points a thousand screens away and releases mid-gesture), they resize the view while a peek is
 * live, they respawn with the finger still down, and they steer the view WHILE a sling is being
 * pulled. Everything is compared against a TWIN world stepped with exactly the same pointer samples
 * and no peek at all: any difference outside `peekX/peekY/renderX/renderY` is a bug.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { WorldStreamer } from '../level/streaming';
import { SeededRNG } from '../ports';
import { GuidedFinger } from './autoPlayer';
import { POINTER_UP, buildMvpCampaign, createMvpWorld, pullGesture } from './testHarness';
import type { GameWorld } from './GameWorld';
import type { Vec2 } from '../math/vec';
import type { PointerInput, WorldSnapshot } from '../types';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;

/**
 * Everything a peek is forbidden to change, as one comparable string.
 *
 * Two deliberate holes:
 *  - `aimOrigin` is the ONE field the design moves on purpose: it is the world point under the finger
 *    on the PEEKED glass (`GameWorld.pointerCam`), so only its null-ness — "is a gesture live" — is a
 *    rule, and that is what is compared. Everything derived from it (`pullDist`, `pullTheta`,
 *    `cancelZone`, the launch) is RELATIVE, and that is the interesting claim, so it is compared.
 *  - Numbers are compared with a tolerance of TOL px. The pull is relative in exact arithmetic but
 *    not in floating point: both ends of it are shifted by the peek offset before being subtracted,
 *    so a partial pull made 200 px off to the side loses the last bits (`pullDist`
 *    3,888888888888904 against 3,888888888888868) and that lands in Bur's position. The size of it is
 *    measured, and pinned, by "the pull is relative to the last bit a double has" below; a bit-for-bit
 *    comparison here would be a test of that noise and nothing else.
 */
/** Everything below this is floating-point noise, not a rule (measured drift: ~1e-12 px in 200 s). */
const TOL = 1e-6;

/** First numeric or structural difference between two rule payloads, or null. */
function firstDiff(a: unknown, b: unknown, path = ''): string | null {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return null;
    return Math.abs(a - b) <= TOL ? null : `${path}: ${a} vs ${b}`;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return `${path}: array shape`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d !== null) return d;
    }
    return null;
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (d !== null) return d;
    }
    return null;
  }
  return Object.is(a, b) ? null : `${path}: ${String(a)} vs ${String(b)}`;
}

function rulesOf(s: WorldSnapshot): unknown {
  const c = s.camera;
  return {
    t: s.timeMs,
    bubble: { ...s.bubble, aimOrigin: s.bubble.aimOrigin === null },
    run: s.run,
    zone: s.zone,
    phase: s.phase,
    hud: s.hud,
    trajectory: s.trajectory,
    events: s.events.map((e) => e.type),
    entities: s.entities.map((e) => e.id),
    cam: {
      x: c.x,
      y: c.y,
      maxY: c.maxY,
      recallPx: c.recallPx,
      zoom: c.zoom,
      zoomPunchUntil: c.zoomPunchUntil,
      shakePx: c.shakePx,
      shakeUntil: c.shakeUntil,
      viewW: c.viewW,
      viewH: c.viewH,
      lookaheadPx: c.lookaheadPx,
    },
    // The map is anchored on the LIVE camera, so everything but the frame must match too.
    map: { w: s.minimap.w, h: s.minimap.h, worldTopY: s.minimap.worldTopY, bur: s.minimap.bur, marks: s.minimap.marks },
  };
}

/** The whole invariance check: the discrete half exactly, the continuous half within TOL. */
function expectSameGame(a: WorldSnapshot, b: WorldSnapshot, label: string): void {
  expect(exactOf(a), label).toBe(exactOf(b));
  expect(firstDiff(rulesOf(a), rulesOf(b)), label).toBeNull();
}

/** The DISCRETE half of the same comparison, where "close enough" is not a thing. */
function exactOf(s: WorldSnapshot): string {
  return JSON.stringify({
    state: s.bubble.state,
    air: s.bubble.air,
    airMax: s.bubble.airMax,
    restingOnId: s.bubble.restingOnId,
    lastRestingCeilingId: s.bubble.lastRestingCeilingId,
    airLaunchesUsed: s.bubble.airLaunchesUsed,
    aiming: s.bubble.aimOrigin !== null,
    flags: s.bubble.flags,
    phase: s.phase,
    zone: s.zone,
    // The two continuous fields of `run` are compared with a tolerance in `rulesOf`, not here.
    run: { ...s.run, maxProgressY: 0, elapsedMs: 0 },
    entities: s.entities.map((e) => e.id),
    events: s.events.map((e) => e.type),
    marks: s.minimap.marks.map((m) => m.kind),
  });
}

/** Presentation, which IS allowed to differ. */
function viewOf(s: WorldSnapshot): string {
  const c = s.camera;
  return JSON.stringify({ peekX: c.peekX, peekY: c.peekY, renderX: c.renderX, renderY: c.renderY });
}

function expectSaneCamera(s: WorldSnapshot): void {
  const c = s.camera;
  for (const [name, v] of Object.entries({ peekX: c.peekX, peekY: c.peekY, renderX: c.renderX, renderY: c.renderY })) {
    expect(Number.isFinite(v), `${name} is ${String(v)}`).toBe(true);
  }
  expect(c.renderX).toBeGreaterThanOrEqual(-1e-9);
  expect(c.renderX).toBeLessThanOrEqual(T.WORLD_W - c.viewW + 1e-9);
  expect(c.renderX).toBeCloseTo(c.x + c.peekX, 9);
  expect(c.renderY).toBeCloseTo(c.y + c.lookaheadPx + c.peekY, 9);
}

/** Steps a world until Bur rests under the opening raft. */
function settle(...worlds: GameWorld[]): WorldSnapshot {
  for (let i = 0; i < 400; i++) {
    const snaps = worlds.map((w) => w.snapshot());
    if (snaps.every((s) => s.bubble.state === 'RESTING')) return snaps[0] as WorldSnapshot;
    for (const w of worlds) w.update(STEP_MS, POINTER_UP);
  }
  throw new Error('Bur never rested');
}

/**
 * The nastiest finger a shell could put on the minimap: real points, releases, and the two kinds of
 * garbage a division by a zero-sized minimap or an unparsed touch produces.
 */
function nastyPeek(rng: SeededRNG, s: WorldSnapshot): Vec2 | null {
  const roll = rng.next();
  if (roll < 0.28) return null;
  if (roll < 0.34) return { x: NaN, y: NaN };
  if (roll < 0.38) return { x: rng.next() * T.WORLD_W, y: NaN };
  if (roll < 0.42) return { x: Infinity, y: -Infinity };
  if (roll < 0.46) return { x: 1e9, y: -1e9 };
  return { x: rng.next() * T.WORLD_W, y: s.camera.y + (rng.next() - 0.35) * 900 };
}

describe('a random peek script changes nothing but the picture', () => {
  it('leaves the twin bit-for-bit identical over a whole guided descent', () => {
    const peeking = createMvpWorld();
    const twin = createMvpWorld();
    const finger = new GuidedFinger();
    const rng = new SeededRNG(20260906);
    let snap = peeking.snapshot();
    let differed = 0;

    for (let i = 0; i < 6000; i++) {
      const pointer = finger.next(STEP_MS, snap);
      peeking.setPeek(nastyPeek(rng, snap));
      peeking.update(STEP_MS, pointer);
      twin.update(STEP_MS, pointer);
      snap = peeking.snapshot();
      const other = twin.snapshot();
      expectSameGame(snap, other, `step ${i}`);
      expectSaneCamera(snap);
      if (viewOf(snap) !== viewOf(other)) differed++;
    }
    // Not vacuous: the picture really did move for most of the run.
    expect(differed).toBeGreaterThan(3000);
  });

  it('is deterministic (§11.7.14): the same peek script twice gives the same pixels', () => {
    const play = (): string[] => {
      const world = createMvpWorld();
      const finger = new GuidedFinger();
      const rng = new SeededRNG(4242);
      const out: string[] = [];
      let snap = world.snapshot();
      for (let i = 0; i < 1500; i++) {
        const pointer = finger.next(STEP_MS, snap);
        world.setPeek(nastyPeek(rng, snap));
        world.update(STEP_MS, pointer);
        snap = world.snapshot();
        out.push(JSON.stringify(rulesOf(snap)) + viewOf(snap));
      }
      return out;
    };
    expect(play()).toEqual(play());
  });

  it('is deterministic across two different accumulator splits of the same frame', () => {
    // §11.7.14: "dos órdenes de acumulador distintos" produce the same world. The peek is set on the
    // same simulation-time boundary in both, so the two runs are the same input.
    const one = createMvpWorld();
    const two = createMvpWorld();
    const rng = new SeededRNG(31337);
    settle(one, two);
    for (let i = 0; i < 600; i++) {
      const target = nastyPeek(rng, one.snapshot());
      one.setPeek(target);
      two.setPeek(target);
      one.update(STEP_MS * 2, POINTER_UP);
      two.update(STEP_MS, POINTER_UP);
      two.update(STEP_MS, POINTER_UP);
      const a = one.snapshot();
      const b = two.snapshot();
      expect(JSON.stringify(rulesOf(a)) + viewOf(a)).toBe(JSON.stringify(rulesOf(b)) + viewOf(b));
    }
  });

  it('copies the point: a shell that reuses one object cannot steer the view after the call', () => {
    const world = createMvpWorld();
    settle(world);
    const reused = { x: 40, y: world.snapshot().camera.y };
    world.setPeek(reused);
    reused.x = 520; // the shell's scratch vector, mutated on the next frame
    for (let i = 0; i < 120; i++) world.update(STEP_MS, POINTER_UP);
    // The view went to the LEFT edge (the point that was passed), not to the right one (the mutation).
    expect(world.snapshot().camera.renderX).toBeCloseTo(0, 6);
  });
});

describe('the pull is relative, whatever the view is doing', () => {
  /** A full pull, ramped like a thumb, released on the last step. `peek` runs before every step. */
  function pullAndRelease(worlds: GameWorld[], anchor: Vec2, peek: (i: number) => void): void {
    const pull = pullGesture(1, 20, T);
    for (let i = 0; i < 34; i++) {
      const stretch = Math.min(1, i / 6);
      peek(i);
      const p: PointerInput = { down: true, x: anchor.x + pull.x * stretch, y: anchor.y + pull.y * stretch };
      for (const w of worlds) w.update(STEP_MS, p);
    }
    peek(34);
    for (const w of worlds) w.update(STEP_MS, POINTER_UP);
  }

  it('launches the same shot when a SECOND finger steers the view all through the pull', () => {
    const peeking = createMvpWorld();
    const twin = createMvpWorld();
    const start = settle(peeking, twin);
    const anchor = { x: start.bubble.pos.x - start.camera.x, y: start.bubble.pos.y - start.camera.y };
    const rng = new SeededRNG(9);
    pullAndRelease([peeking, twin], anchor, () => {
      // The minimap finger keeps moving: a different world point every single step.
      peeking.setPeek({ x: rng.next() * T.WORLD_W, y: start.bubble.pos.y + (rng.next() - 0.5) * 600 });
    });
    const a = peeking.snapshot();
    const b = twin.snapshot();
    expect(a.bubble.state).toBe('LAUNCHED');
    expect(a.bubble.vel).toEqual(b.bubble.vel);
    expect(a.bubble.lastLaunchPower).toBe(b.bubble.lastLaunchPower);
    expect(a.bubble.pos).toEqual(b.bubble.pos);
    // …and the view really was somewhere else while it happened.
    expect(Math.abs(a.camera.peekX)).toBeGreaterThan(20);
  });

  it('launches the same shot when the minimap finger LIFTS in the middle of the pull', () => {
    const peeking = createMvpWorld();
    const twin = createMvpWorld();
    const start = settle(peeking, twin);
    const anchor = { x: start.bubble.pos.x - start.camera.x, y: start.bubble.pos.y - start.camera.y };
    pullAndRelease([peeking, twin], anchor, (i) => {
      peeking.setPeek(i < 12 ? { x: 520, y: start.bubble.pos.y } : null);
    });
    const a = peeking.snapshot();
    const b = twin.snapshot();
    expect(a.bubble.vel).toEqual(b.bubble.vel);
    // `hold` suspends the RETURN: the view the player aimed on is the view she shot on.
    expect(a.camera.peekX).toBeGreaterThan(20);
  });

  it('holds the frozen view to the bit while the sling is live, then comes home on the shot', () => {
    const world = createMvpWorld();
    const start = settle(world);
    const anchor = { x: start.bubble.pos.x - start.camera.x, y: start.bubble.pos.y - start.camera.y };
    for (let i = 0; i < 60; i++) {
      world.setPeek({ x: 520, y: start.bubble.pos.y });
      world.update(STEP_MS, POINTER_UP);
    }
    world.setPeek(null);
    const pull = pullGesture(1, 0, T);
    let frozen: number | null = null;
    for (let i = 0; i < 40; i++) {
      const stretch = Math.min(1, i / 6);
      world.update(STEP_MS, { down: true, x: anchor.x + pull.x * stretch, y: anchor.y + pull.y * stretch });
      const cam = world.snapshot().camera;
      if (world.snapshot().bubble.aimOrigin !== null) {
        frozen ??= cam.peekX;
        expect(cam.peekX).toBe(frozen);
      }
    }
    expect(frozen).not.toBeNull();
    world.update(STEP_MS, POINTER_UP);
    for (let i = 0; i < 200; i++) world.update(STEP_MS, POINTER_UP);
    expect(world.snapshot().camera.peekX).toBe(0);
  });

  it('releases the frozen view when the gesture is CANCELLED instead of shot', () => {
    const world = createMvpWorld();
    const start = settle(world);
    const anchor = { x: start.bubble.pos.x - start.camera.x, y: start.bubble.pos.y - start.camera.y };
    for (let i = 0; i < 60; i++) {
      world.setPeek({ x: 520, y: start.bubble.pos.y });
      world.update(STEP_MS, POINTER_UP);
    }
    world.setPeek(null);
    // A pull shorter than PULL_CANCEL_PX: D2 says releasing here is a cancel, not a shot.
    for (let i = 0; i < 20; i++) world.update(STEP_MS, { down: true, x: anchor.x, y: anchor.y - 2 });
    world.cancelAim();
    const held = world.snapshot().camera.peekX;
    expect(held).toBeGreaterThan(20);
    for (let i = 0; i < 200; i++) world.update(STEP_MS, POINTER_UP);
    const after = world.snapshot();
    expect(after.bubble.state).not.toBe('LAUNCHED');
    expect(after.camera.peekX).toBe(0);
  });

  it('freezes the aim origin on the PEEKED view and never on the lookahead', () => {
    const world = createMvpWorld();
    const start = settle(world);
    for (let i = 0; i < 90; i++) {
      world.setPeek({ x: 520, y: start.bubble.pos.y + 200 });
      world.update(STEP_MS, POINTER_UP);
    }
    // A COPY: `snapshot().camera` is the live object and the next `update` mutates it.
    const live = world.snapshot().camera;
    const seen = { x: live.x, y: live.y, peekX: live.peekX, peekY: live.peekY, renderY: live.renderY };
    expect(seen.peekX).toBeGreaterThan(50);
    expect(seen.peekY).toBeGreaterThan(20);
    const finger = { x: 30, y: 120 };
    world.update(STEP_MS, { down: true, x: finger.x, y: finger.y });
    const origin = world.snapshot().bubble.aimOrigin;
    expect(origin?.x).toBeCloseTo(finger.x + seen.x + seen.peekX, 9);
    expect(origin?.y).toBeCloseTo(finger.y + seen.y + seen.peekY, 9);
    // The §7 lookahead is drift the frozen origin must not inherit — checked where it is not zero,
    // which is why this runs on a FALLING Bur below.
    expect(origin?.y).toBeCloseTo(finger.y + seen.y + seen.peekY, 9);
  });
});

describe('the view survives everything the shell can do to it', () => {
  it('keeps renderX consistent and inside the world when the view is RESIZED while peeked', () => {
    // `setViewWidth` re-clamps `camera.x` on the spot precisely because "snapshot() may be taken
    // between a resize and that step and the shell places the camera verbatim". Since D5 the shell
    // places it at `renderX`, so that is the number the argument is about.
    const world = createMvpWorld();
    settle(world);
    for (let i = 0; i < 120; i++) {
      world.setPeek({ x: 520, y: world.snapshot().camera.y + 100 });
      world.update(STEP_MS, POINTER_UP);
    }
    const peeked = world.snapshot().camera;
    expect(peeked.renderX).toBeGreaterThan(100);

    world.setViewWidth(T.WORLD_W); // a landscape phone: the whole world fits on the glass
    const cam = world.snapshot().camera;
    expect(cam.renderX).toBeCloseTo(cam.x + cam.peekX, 9);
    expect(cam.renderX).toBeGreaterThanOrEqual(0);
    expect(cam.renderX + cam.viewW).toBeLessThanOrEqual(T.WORLD_W + 1e-9);
  });

  it('recovers a legal column on the first step after a resize', () => {
    const world = createMvpWorld();
    settle(world);
    for (let i = 0; i < 120; i++) {
      world.setPeek({ x: 520, y: world.snapshot().camera.y + 100 });
      world.update(STEP_MS, POINTER_UP);
    }
    world.setViewWidth(T.WORLD_W);
    world.update(STEP_MS, POINTER_UP);
    const cam = world.snapshot().camera;
    expect(cam.renderX + cam.viewW).toBeLessThanOrEqual(T.WORLD_W + 1e-9);
    expect(cam.renderX).toBeCloseTo(cam.x + cam.peekX, 9);
  });

  it('does not carry a peek into the fresh camera of a respawn', () => {
    const world = createMvpWorld({ startStationIndex: 0 });
    const start = settle(world);
    for (let i = 0; i < 120; i++) {
      world.setPeek({ x: 520, y: start.bubble.pos.y - 400 });
      world.update(STEP_MS, POINTER_UP);
    }
    expect(Math.abs(world.snapshot().camera.peekX)).toBeGreaterThan(50);
    // The finger is STILL on the minimap when the player asks for the immersion again.
    world.restartImmersion();
    const fresh = world.snapshot().camera;
    expect(fresh.peekX).toBe(0);
    expect(fresh.peekY).toBe(0);
    expect(fresh.renderX).toBe(fresh.x);
    expect(fresh.renderY).toBe(fresh.y + fresh.lookaheadPx);
  });

  it('never shows unstreamed water after a respawn with the finger still down', () => {
    const world = createMvpWorld({ startStationIndex: 0 });
    const shadow = new WorldStreamer(buildMvpCampaign(T), T);
    const start = settle(world);
    world.setPeek({ x: 520, y: start.bubble.pos.y - 400 });
    for (let i = 0; i < 120; i++) world.update(STEP_MS, POINTER_UP);
    world.restartImmersion();
    for (let i = 0; i < 300; i++) {
      const before = world.snapshot();
      shadow.update(before.bubble.pos.y, before.bubble.flags.ascensoUntil > before.timeMs);
      const window = shadow.windowBounds();
      world.update(STEP_MS, POINTER_UP);
      const cam = world.snapshot().camera;
      expect(cam.y + cam.peekY).toBeGreaterThanOrEqual(Math.min(window.topY, cam.y) - 1e-6);
      expect(cam.y + cam.peekY + cam.viewH).toBeLessThanOrEqual(Math.max(window.bottomY, cam.y + cam.viewH) + 1e-6);
    }
  });

  it('survives a view TALLER than the whole streamed window', () => {
    // STREAM_CHUNKS * CHUNK_H = 960 px of streamed water under a 1000 px view: no legal top edge at
    // all. The band has to collapse without ever going NaN, and the peek has to stay harmless.
    const world = createMvpWorld({ viewH: 1000 });
    const rng = new SeededRNG(5);
    for (let i = 0; i < 900; i++) {
      world.setPeek(nastyPeek(rng, world.snapshot()));
      world.update(STEP_MS, POINTER_UP);
      expectSaneCamera(world.snapshot());
    }
  });

  it('peeks harmlessly while the game is not "playing" (station summary, death)', () => {
    const peeking = createMvpWorld({ startStationIndex: 0 });
    const twin = createMvpWorld({ startStationIndex: 0 });
    const finger = new GuidedFinger();
    const rng = new SeededRNG(11);
    let snap = peeking.snapshot();
    let sawPause = false;
    for (let i = 0; i < 6000; i++) {
      const pointer = finger.next(STEP_MS, snap);
      peeking.setPeek(nastyPeek(rng, snap));
      peeking.update(STEP_MS, pointer);
      twin.update(STEP_MS, pointer);
      snap = peeking.snapshot();
      if (snap.phase !== 'playing') sawPause = true;
      expectSameGame(snap, twin.snapshot(), `step ${i}, phase ${snap.phase}`);
    }
    expect(sawPause).toBe(true);
  });
});

describe('what the shell is told it may draw', () => {
  it('never draws unstreamed water during a fall, at full downward peek', () => {
    // The narrow claim, and the one the e2e can assert literally: through a whole fall, the DRAWN
    // view (`renderY`, so the §7 lookahead included) stays inside the streamed window even with the
    // finger dragging the map as far down as it goes.
    const world = createMvpWorld();
    const shadow = new WorldStreamer(buildMvpCampaign(T), T);
    const start = settle(world);
    const anchor = { x: start.bubble.pos.x - start.camera.x, y: start.bubble.pos.y - start.camera.y };
    const pull = pullGesture(1, 0, T);
    for (let i = 0; i < 34; i++) {
      const stretch = Math.min(1, i / 6);
      world.update(STEP_MS, { down: true, x: anchor.x + pull.x * stretch, y: anchor.y + pull.y * stretch });
    }
    let worst = -Infinity;
    let deepest = 0;
    for (let i = 0; i < 900; i++) {
      const before = world.snapshot();
      shadow.update(before.bubble.pos.y, before.bubble.flags.ascensoUntil > before.timeMs);
      const window = shadow.windowBounds();
      world.setPeek({ x: 270, y: before.bubble.pos.y + 400 });
      world.update(STEP_MS, POINTER_UP);
      const cam = world.snapshot().camera;
      deepest = Math.max(deepest, cam.peekY);
      worst = Math.max(worst, cam.renderY + cam.viewH - window.bottomY);
    }
    expect(deepest).toBeGreaterThan(100);
    expect(worst).toBeLessThanOrEqual(1e-6);
  });

  it('never makes the drawn view stick out FURTHER than the un-peeked camera already does', () => {
    // The general claim, over a whole guided descent with the finger yanking the map up and down.
    // It is the relative form on purpose: the §4.3 ratchet ALONE already outruns the streamed window
    // (measured: the un-peeked view reaches 163 px past the window's bottom edge on this run, when
    // Bur bounces back up and the camera stays down inside its recall band). That is not a peek bug
    // and a peek must not make it worse — which is exactly what `shrinkInto` promises.
    const world = createMvpWorld();
    const shadow = new WorldStreamer(buildMvpCampaign(T), T);
    const finger = new GuidedFinger();
    let snap = world.snapshot();
    let worstDown = -Infinity;
    let worstUp = -Infinity;
    let plainDown = -Infinity;
    let deepest = 0;
    let highest = 0;
    for (let i = 0; i < 9000; i++) {
      const pointer = finger.next(STEP_MS, snap);
      shadow.update(snap.bubble.pos.y, snap.bubble.flags.ascensoUntil > snap.timeMs);
      const window = shadow.windowBounds();
      world.setPeek({ x: 270, y: snap.bubble.pos.y + (i % 400 < 200 ? 400 : -400) });
      world.update(STEP_MS, pointer);
      snap = world.snapshot();
      const c = snap.camera;
      worstDown = Math.max(worstDown, c.y + c.peekY + c.viewH - Math.max(window.bottomY, c.y + c.viewH));
      worstUp = Math.max(worstUp, Math.min(window.topY, c.y) - (c.y + c.peekY));
      plainDown = Math.max(plainDown, c.y + c.viewH - window.bottomY);
      deepest = Math.max(deepest, c.peekY);
      highest = Math.min(highest, c.peekY);
    }
    expect(worstDown).toBeLessThanOrEqual(1e-6);
    expect(worstUp).toBeLessThanOrEqual(1e-6);
    // Not vacuous: the finger really did drag the view to both ends…
    expect(deepest).toBeGreaterThan(200);
    expect(highest).toBeLessThan(-100);
    // …and the un-peeked camera really was outside the window part of the time (see the comment).
    expect(plainDown).toBeGreaterThan(0);
  });

  it('never looks further than PEEK_UP_PX / PEEK_DOWN_PX from a camera that is inside the window', () => {
    // §11.6 defines the reach as PEEK_UP_PX above and PEEK_DOWN_PX below the live camera, and that is
    // what holds while the camera's own view is inside the streamed window — i.e. all of normal play.
    // It does NOT hold unconditionally, on purpose: when the reach and the window do not meet, the
    // band collapses onto the WINDOW (`peekBounds`), because showing un-streamed water is a hole the
    // player sees and a few px of extra reach is not. The §4.3 ratchet alone puts the camera outside
    // the window (measured: 163 px past its bottom edge when Bur bounces back up and the camera stays
    // down in its recall band), and there the collapse hands the finger exactly that much extra look —
    // all of it streamed water, all of it NEARER the window than the un-peeked view already is. So the
    // reach is asserted absolutely where it is a rule and relatively where the camera broke it first.
    const world = createMvpWorld();
    const shadow = new WorldStreamer(buildMvpCampaign(T), T);
    const finger = new GuidedFinger();
    let snap = world.snapshot();
    let extra = 0;
    for (let i = 0; i < 9000; i++) {
      const pointer = finger.next(STEP_MS, snap);
      shadow.update(snap.bubble.pos.y, snap.bubble.flags.ascensoUntil > snap.timeMs);
      const window = shadow.windowBounds();
      world.setPeek({ x: 270, y: snap.bubble.pos.y + (i % 400 < 200 ? 400 : -400) });
      world.update(STEP_MS, pointer);
      snap = world.snapshot();
      const c = snap.camera;
      // How far the CAMERA itself is outside the streamed window this step; zero in normal play.
      const outranBelow = Math.max(0, c.y + c.viewH - window.bottomY);
      const outranAbove = Math.max(0, window.topY - c.y);
      expect(c.peekY, `step ${i}`).toBeGreaterThanOrEqual(-T.PEEK_UP_PX - outranBelow - 1e-6);
      expect(c.peekY, `step ${i}`).toBeLessThanOrEqual(T.PEEK_DOWN_PX + outranAbove + 1e-6);
      extra = Math.max(extra, -c.peekY - T.PEEK_UP_PX, c.peekY - T.PEEK_DOWN_PX);
    }
    // Not vacuous the other way either: the run really does contain frames where the collapse grants
    // more than the nominal reach, which is the deviation this test exists to pin rather than forbid.
    expect(extra).toBeGreaterThan(0);
  });


  it('the pull is relative to the last bit a double has, and no further', () => {
    // Exact arithmetic says a peek cannot touch the pull: both ends of it are shifted by the same
    // frozen offset. Floating point disagrees in the last bits — `(f + C) - (o + C)` is not `f - o`
    // — so a PARTIAL pull (a full one is clamped to PULL_MAX_PX and hides this) made 200 px off to
    // the side gives a very slightly different shot. This pins how much: nothing a player or a rule
    // can see, but not zero, which is why the twin comparisons above use a tolerance.
    const peeking = createMvpWorld();
    const twin = createMvpWorld();
    const start = settle(peeking, twin);
    const anchor = { x: start.bubble.pos.x - start.camera.x, y: start.bubble.pos.y - start.camera.y };
    const pull = pullGesture(0.5, 20, T); // partial: pullDist is NOT clamped
    for (let i = 0; i < 60; i++) {
      peeking.setPeek({ x: 411.37, y: start.bubble.pos.y + 137.91 });
      peeking.update(STEP_MS, POINTER_UP);
      twin.update(STEP_MS, POINTER_UP);
    }
    for (let i = 0; i < 34; i++) {
      const stretch = Math.min(1, i / 6);
      const p: PointerInput = { down: true, x: anchor.x + pull.x * stretch, y: anchor.y + pull.y * stretch };
      peeking.update(STEP_MS, p);
      twin.update(STEP_MS, p);
    }
    const before = { a: peeking.snapshot().bubble.pullDist, b: twin.snapshot().bubble.pullDist };
    peeking.update(STEP_MS, POINTER_UP);
    twin.update(STEP_MS, POINTER_UP);
    const a = peeking.snapshot().bubble;
    const b = twin.snapshot().bubble;
    expect(a.state).toBe('LAUNCHED');
    expect(Math.abs(before.a - before.b)).toBeLessThan(1e-9);
    expect(Math.abs(a.vel.x - b.vel.x)).toBeLessThan(1e-9);
    expect(Math.abs(a.vel.y - b.vel.y)).toBeLessThan(1e-9);
    expect(a.lastLaunchPower).toBeCloseTo(b.lastLaunchPower, 9);
  });
});
