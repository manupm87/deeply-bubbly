/**
 * Adversarial review of `game/minimap.ts` (DECISIONS-v1.2 D5).
 *
 * The minimap is not decoration: it is the TOUCH SURFACE of the peek, so a wrong scaling is a finger
 * that asks to look somewhere else, and a mark drawn outside the panel is a white pixel painted over
 * the world. The attacks below are: geometry the shell cannot draw (marks outside the map, Bur off
 * the map, a frame that leaves the panel), the reachability contract between the map and the peek
 * band (every legal peek must be expressible with a tap, and no tap may ask for an illegal one),
 * entities that move under the model, and inputs a validated level would never produce.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { createBubble } from '../bubble/bubbleStep';
import { createCamera } from '../camera/camera';
import { peekBounds, peekTopLeft } from '../camera/peek';
import { SeededRNG } from '../ports';
import { buildMinimap, minimapToWorld } from './minimap';
import { GuidedFinger } from './autoPlayer';
import { POINTER_UP, createMvpWorld } from './testHarness';
import type { Rect } from '../math/vec';
import type { Bubble, Camera, Ceiling, Hazard, MinimapModel, RestStation, WorldEntity } from '../types';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;
const VIEW_H = 400;

function cam(y = 1000, over: Partial<Camera> = {}): Camera {
  const c = createCamera(270, VIEW_H, T, 180);
  c.y = y;
  c.maxY = y;
  c.renderX = c.x;
  c.renderY = c.y;
  return Object.assign(c, over);
}

function bubbleAt(x: number, y: number): Bubble {
  return createBubble({ x, y }, 0, T);
}

function ceiling(rect: Rect): Ceiling {
  return {
    type: 'ceiling',
    id: 'c1',
    rect,
    kind: 'posadero',
    capturable: true,
    restitution: T.RESTITUTION_ROCK,
    material: 'rock',
  };
}

function hazard(shape: Rect): Hazard {
  return { type: 'hazard', id: 'h1', catalogId: 6, shape, airCost: 1, pushDir: 'lateral' };
}

function station(worldY: number): RestStation {
  return { type: 'station', id: 's1', worldY, zoneFrom: 0, zoneTo: 1, isDelivery: false, immersionIndex: 0 };
}

function build(entities: WorldEntity[], camera: Camera, b: Bubble = bubbleAt(270, camera.y + 200)): MinimapModel {
  return buildMinimap(entities, camera, b, T);
}

describe('nothing the shell draws from marks can land outside the panel', () => {
  it('clips every mark of a whole streamed window, at every depth of a real run', () => {
    const world = createMvpWorld();
    for (let i = 0; i < 2400; i++) {
      world.update(STEP_MS, POINTER_UP);
      const m = world.snapshot().minimap;
      for (const mark of m.marks) {
        expect(Number.isFinite(mark.rect.x)).toBe(true);
        expect(Number.isFinite(mark.rect.w)).toBe(true);
        expect(mark.rect.x).toBeGreaterThanOrEqual(0);
        expect(mark.rect.y).toBeGreaterThanOrEqual(0);
        expect(mark.rect.x + mark.rect.w).toBeLessThanOrEqual(m.w + 1e-9);
        expect(mark.rect.y + mark.rect.h).toBeLessThanOrEqual(m.h + 1e-9);
        expect(mark.rect.w).toBeGreaterThan(0);
        expect(mark.rect.h).toBeGreaterThan(0);
      }
    }
  });

  it('drops an entity whose geometry is not a number instead of emitting a NaN mark', () => {
    // A mark with a NaN rect reaches the shell, which rounds it and asks Phaser to fill a NaN rect.
    // `camera/peek.ts` refuses non-finite input on the same data path (the finger); the model that
    // feeds that finger has to be just as total.
    const c = cam();
    const model = build([ceiling({ x: NaN, y: c.y, w: 40, h: 8 }), hazard({ x: 100, y: NaN, w: 6, h: 6 })], c);
    for (const mark of model.marks) {
      expect(Number.isFinite(mark.rect.x), `NaN x in a '${mark.kind}' mark`).toBe(true);
      expect(Number.isFinite(mark.rect.y), `NaN y in a '${mark.kind}' mark`).toBe(true);
      expect(Number.isFinite(mark.rect.w), `NaN w in a '${mark.kind}' mark`).toBe(true);
      expect(Number.isFinite(mark.rect.h), `NaN h in a '${mark.kind}' mark`).toBe(true);
    }
  });

  it('reports Bur as the TRUE centre, which routinely leaves the map (the shell must clamp her)', () => {
    // The model contract (D5) is "bur = Bur's centre scaled", NOT a clipped mark: the shell needs to
    // know she is off the map to say so. It follows that she really does leave it — the §4.3 ratchet
    // makes it routine, because the camera only comes back up by the recall band, so every long
    // bounce puts her more than MINIMAP_ABOVE_PX above it. This pins BOTH halves: the mapping stays
    // exact, and `ui/Minimap.ts` may not draw `m.bur` verbatim (it clamps the 2x2 into the panel).
    const world = createMvpWorld();
    const finger = new GuidedFinger();
    let snap = world.snapshot();
    let worst = 0;
    for (let i = 0; i < 3000; i++) {
      world.update(STEP_MS, finger.next(STEP_MS, snap));
      snap = world.snapshot();
      const m = snap.minimap;
      worst = Math.min(worst, m.bur.y);
      // Exact, every step: the scaling of Bur's centre and nothing else.
      expect(m.bur.x).toBeCloseTo(snap.bubble.pos.x * m.scale, 9);
      expect(m.bur.y).toBeCloseTo((snap.bubble.pos.y - m.worldTopY) * m.scale, 9);
      expect(Number.isFinite(m.bur.x)).toBe(true);
      expect(Number.isFinite(m.bur.y)).toBe(true);
    }
    // Not vacuous: she was above the panel during this run, which is what the shell has to survive.
    expect(worst).toBeLessThan(0);
  });
});

describe('the map and the peek band are the same thing seen twice', () => {
  it('every tap on the map asks for a peek the clamp accepts unchanged in y', () => {
    // If a tap can only be answered by clamping it, the view stops under the finger and the player
    // reads it as the map being broken. Sweep the whole panel at several depths and view heights.
    const rng = new SeededRNG(77);
    for (const viewH of [320, 400, 420]) {
      const c = cam(1200, { viewH });
      const bounds = peekBounds(c, c.y - 480, c.y + 960, T);
      const model = build([], c);
      for (let i = 0; i < 500; i++) {
        const p = { x: rng.next() * model.w, y: rng.next() * model.h };
        const world = minimapToWorld(p, model);
        const topLeft = peekTopLeft(world, c, bounds, T);
        expect(topLeft.y).toBeGreaterThanOrEqual(bounds.minY - 1e-9);
        expect(topLeft.y).toBeLessThanOrEqual(bounds.maxY + 1e-9);
      }
    }
  });

  it('the map can express the DEEPEST and the HIGHEST legal peek (nothing unreachable)', () => {
    const c = cam(1200);
    const bounds = peekBounds(c, c.y - 480, c.y + 960, T);
    const model = build([], c);
    const deepest = peekTopLeft(minimapToWorld({ x: model.w / 2, y: model.h }, model), c, bounds, T);
    const highest = peekTopLeft(minimapToWorld({ x: model.w / 2, y: 0 }, model), c, bounds, T);
    expect(deepest.y).toBeCloseTo(bounds.maxY, 6);
    expect(highest.y).toBeCloseTo(bounds.minY, 6);
    // …and the whole world column, left edge to right edge.
    expect(peekTopLeft(minimapToWorld({ x: 0, y: 0 }, model), c, bounds, T).x).toBe(0);
    expect(peekTopLeft(minimapToWorld({ x: model.w, y: 0 }, model), c, bounds, T).x).toBe(T.WORLD_W - c.viewW);
  });

  it('MINIMAP_WORLD_H is what the tuning comment claims: every legal peek TARGET fits on the map', () => {
    // tuning.ts: "120 above + 480 below: every legal peek TARGET fits; the frame itself may leave the
    // map". The deepest legal peek CENTRES the view on PEEK_DOWN_PX below the camera plus half a
    // view, and that point — the one a finger has to be able to tap — must be on the panel at every
    // supported view height. The FRAME around it deliberately may not be (the model documents that
    // it can stick out, and `ui/Minimap.ts` clips it), which is the part the old comment overstated.
    for (const viewH of [320, 400, 420]) {
      expect(T.MINIMAP_WORLD_H).toBeGreaterThanOrEqual(T.MINIMAP_ABOVE_PX + T.PEEK_DOWN_PX + viewH / 2);
    }
  });

  it('round-trips minimap → world → minimap exactly at the four corners', () => {
    const c = cam(1337.5);
    const model = build([], c);
    for (const p of [
      { x: 0, y: 0 },
      { x: model.w, y: 0 },
      { x: 0, y: model.h },
      { x: model.w, y: model.h },
    ]) {
      const w = minimapToWorld(p, model);
      expect(w.x * model.scale).toBeCloseTo(p.x, 9);
      expect((w.y - model.worldTopY) * model.scale).toBeCloseTo(p.y, 9);
    }
    expect(minimapToWorld({ x: 0, y: 0 }, model).y).toBe(c.y - T.MINIMAP_ABOVE_PX);
    expect(minimapToWorld({ x: model.w, y: model.h }, model).x).toBeCloseTo(T.WORLD_W, 9);
  });
});

describe('the model is a photograph of the live world, not of the world at boot', () => {
  it('follows a MOVING ceiling between two frames', () => {
    const c = cam(1000);
    const moving = ceiling({ x: 100, y: 1100, w: 60, h: 10 });
    moving.moving = { axis: 'x', speed: 40, range: 80 };
    const before = build([moving], c).marks[0];
    moving.rect = { ...moving.rect, x: 180 };
    const after = build([moving], c).marks[0];
    expect(before?.rect.x).toBeCloseTo(10, 9);
    expect(after?.rect.x).toBeCloseTo(18, 9);
  });

  it('does not keep a reference to the mark it handed out last frame', () => {
    const c = cam(1000);
    const e = [ceiling({ x: 100, y: 1100, w: 60, h: 10 })];
    const first = build(e, c);
    const second = build(e, c);
    expect(first.marks).not.toBe(second.marks);
    expect(first.marks[0]).not.toBe(second.marks[0]);
    expect(first.marks[0]).toEqual(second.marks[0]);
  });
});

describe('shapes at the edges of the map', () => {
  it('keeps a station band that starts above the map, clipped and still a station', () => {
    const c = cam(1000);
    // Band top 100 px above the map's top edge (worldTopY = cam.y - 120), 240 px tall.
    const model = build([station(c.y - 220)], c);
    const band = model.marks.find((m) => m.kind === 'station');
    expect(band).toBeDefined();
    expect(band?.rect.y).toBe(0);
    expect(band?.rect.h).toBeCloseTo(14, 9); // 240 - 100 = 140 world px → 14 minimap px
    expect(band?.rect.w).toBe(model.w);
  });

  it('drops a band that ends exactly ON the top edge (zero area is not a mark)', () => {
    const c = cam(1000);
    const model = build([station(c.y - 120 - T.CHUNK_H)], c);
    expect(model.marks.some((m) => m.kind === 'station')).toBe(false);
  });

  it('floors a hazard smaller than one minimap px, and clips the floored rect at the edge', () => {
    const c = cam(1000);
    const crown = build([hazard({ x: 100, y: c.y + 100, w: 6, h: 6 })], c).marks[0];
    expect(crown?.rect.w).toBe(1);
    expect(crown?.rect.h).toBe(1);
    // Straddling the top edge, the floor survives clipping only in part: the shell floors again when
    // it draws (`Math.max(1, Math.round(h))`), which is what keeps it visible.
    const straddling = build([hazard({ x: 100, y: c.y - T.MINIMAP_ABOVE_PX - 4, w: 6, h: 6 })], c).marks[0];
    expect(straddling?.rect.y).toBe(0);
    expect(straddling?.rect.h).toBeLessThan(1);
    expect(straddling?.rect.h).toBeGreaterThan(0);
  });

  it('lets the view frame leave the map while peeking, and says so exactly', () => {
    const c = cam(1000, { peekY: T.PEEK_DOWN_PX, peekX: 0 });
    c.renderX = c.x + c.peekX;
    c.renderY = c.y + c.lookaheadPx + c.peekY;
    const model = build([], c);
    expect(model.view.y).toBeCloseTo((T.MINIMAP_ABOVE_PX + T.PEEK_DOWN_PX) * T.MINIMAP_SCALE, 9);
    expect(model.view.y + model.view.h).toBeGreaterThan(model.h);
  });
});
