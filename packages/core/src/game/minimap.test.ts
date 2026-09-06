/**
 * The minimap model (DECISIONS-v1.2 D5). It is the map AND the touch surface of the peek, so the two
 * things under test are the same two things twice: the scaling is exactly what `minimapToWorld`
 * inverts (a finger that lands on a mark asks to look at that mark), and the map is anchored on the
 * LIVE camera while only the frame moves with the peek.
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { createCamera } from '../camera/camera';
import { createBubble } from '../bubble/bubbleStep';
import { SeededRNG } from '../ports';
import { buildMinimap, minimapToWorld } from './minimap';
import { createTestWorld } from './testHarness';
import type { Rect, Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type {
  Anchor,
  Boya,
  Bubble,
  Camera,
  Ceiling,
  ForceField,
  Hazard,
  MinimapMark,
  MinimapMarkKind,
  MinimapModel,
  Pickup,
  RestStation,
  Wall,
  WorldEntity,
} from '../types';

const T: Tuning = createTuning();
const VIEW_H = 400;
/** Camera y that puts the top of the map at world y = 0, so every number below reads as `world / 10`. */
const CAM_Y = T.MINIMAP_ABOVE_PX;

interface CamOptions {
  y?: number;
  x?: number;
  peekX?: number;
  peekY?: number;
  lookaheadPx?: number;
}

/** A camera placed by hand: `stepCamera` is tested elsewhere, here only what the minimap reads matters. */
function camera(options: CamOptions = {}, t: Tuning = T): Camera {
  const cam = createCamera(0, VIEW_H, t);
  cam.y = options.y ?? CAM_Y;
  cam.maxY = cam.y;
  cam.x = options.x ?? 0;
  cam.lookaheadPx = options.lookaheadPx ?? 0;
  cam.peekX = options.peekX ?? 0;
  cam.peekY = options.peekY ?? 0;
  cam.renderX = cam.x + cam.peekX;
  cam.renderY = cam.y + cam.lookaheadPx + cam.peekY;
  return cam;
}

function bur(pos: Vec2 = { x: 270, y: 300 }): Bubble {
  return createBubble(pos, 0, T);
}

let ids = 0;
const nextId = (): string => `e${++ids}`;

function ceiling(rect: Rect, capturable = true): Ceiling {
  return {
    type: 'ceiling',
    id: nextId(),
    rect,
    kind: 'posadero',
    capturable,
    restitution: T.RESTITUTION_ROCK,
    material: 'rock',
  };
}

function wall(rect: Rect): Wall {
  return { type: 'wall', id: nextId(), rect, restitution: T.RESTITUTION_ROCK, material: 'reef' };
}

function anchor(pos: Vec2): Anchor {
  return { type: 'anchor', id: nextId(), ceilingId: 'c', pos };
}

function hazard(shape: Rect): Hazard {
  return { type: 'hazard', id: nextId(), catalogId: 6, shape, airCost: 1, pushDir: 'lateral' };
}

function field(rect: Rect): ForceField {
  return {
    type: 'forcefield',
    id: nextId(),
    rect,
    fieldType: 'corriente',
    vector: { x: 40, y: 0 },
    buoyancyMul: 1,
    impulseMul: 1,
    chargeMul: 1,
    opensAscenso: false,
  };
}

function pickup(pos: Vec2): Pickup {
  return { type: 'pickup', id: nextId(), pos, pickupType: 'aire', value: 1, radius: 6 };
}

function boya(worldY: number): Boya {
  return { type: 'boya', id: nextId(), worldY, immersionIndex: 0 };
}

function station(worldY: number): RestStation {
  return { type: 'station', id: nextId(), worldY, zoneFrom: 0, zoneTo: 1, isDelivery: false, immersionIndex: 0 };
}

/** The single mark of `kind`, or a readable failure. */
function only(model: MinimapModel, kind: MinimapMarkKind): MinimapMark {
  const found = model.marks.filter((m) => m.kind === kind);
  expect(found.length, `expected exactly one '${kind}' mark, got ${found.length}`).toBe(1);
  const mark = found[0];
  if (mark === undefined) throw new Error(`no '${kind}' mark`);
  return mark;
}

/** Build the model for `entities` with the map's top edge at world y = 0. */
function mapOf(entities: readonly WorldEntity[], options: CamOptions = {}): MinimapModel {
  return buildMinimap(entities, camera(options), bur(), T);
}

describe('the minimap model (D5)', () => {
  it('is WORLD_W × MINIMAP_WORLD_H at MINIMAP_SCALE, read from tuning and nowhere else', () => {
    const model = mapOf([]);
    expect(model.scale).toBe(T.MINIMAP_SCALE);
    expect(model.w).toBe(T.WORLD_W * T.MINIMAP_SCALE);
    expect(model.h).toBe(T.MINIMAP_WORLD_H * T.MINIMAP_SCALE);
    expect([model.w, model.h]).toEqual([54, 60]); // the defaults, spelled out once

    const t2 = createTuning({ MINIMAP_SCALE: 0.2, MINIMAP_WORLD_H: 500, MINIMAP_ABOVE_PX: 60 });
    const tuned = buildMinimap([], camera({ y: 1000 }, t2), bur(), t2);
    expect([tuned.w, tuned.h, tuned.scale]).toEqual([540 * 0.2, 100, 0.2]);
    expect(tuned.worldTopY).toBe(1000 - 60);
  });

  it('anchors the map on the LIVE camera, never on the peeked view', () => {
    const still = mapOf([], { y: 1000 });
    const peeked = mapOf([], { y: 1000, peekX: 200, peekY: -110, lookaheadPx: 20 });
    expect(still.worldTopY).toBe(1000 - T.MINIMAP_ABOVE_PX);
    // The map does not move a pixel while the player looks around: only the frame does.
    expect(peeked.worldTopY).toBe(still.worldTopY);
    expect(peeked.w).toBe(still.w);
    expect(peeked.h).toBe(still.h);
  });

  it('draws the frame where the view is DRAWN, and lets it stick out of the map', () => {
    const scale = T.MINIMAP_SCALE;
    const inView = mapOf([], { x: 120, lookaheadPx: 20 });
    expect(inView.view).toEqual({
      x: 120 * scale,
      y: (CAM_Y + 20 - (CAM_Y - T.MINIMAP_ABOVE_PX)) * scale,
      w: T.VIEW_W * scale,
      h: VIEW_H * scale,
    });

    // Peeked all the way down: the frame runs off the bottom edge and is NOT clipped — the shell
    // needs the true rectangle to show how far out of the map the player is looking.
    const down = mapOf([], { peekY: T.PEEK_DOWN_PX });
    expect(down.view.y + down.view.h).toBeGreaterThan(down.h);
    expect(down.view.h).toBe(VIEW_H * scale);
    expect(down.view.y).toBe((T.MINIMAP_ABOVE_PX + T.PEEK_DOWN_PX) * scale);

    // Peeked all the way right: the frame slides across the map without changing size.
    const right = mapOf([], { peekX: T.WORLD_W - T.VIEW_W });
    expect(right.view.x).toBe((T.WORLD_W - T.VIEW_W) * scale);
    expect(right.view.x + right.view.w).toBeCloseTo(right.w, 9);
  });

  it('puts Bur on the map at her world position', () => {
    const model = buildMinimap([], camera({ y: 1000 }), bur({ x: 400, y: 1100 }), T);
    expect(model.bur).toEqual({ x: 400 * T.MINIMAP_SCALE, y: (1100 - (1000 - T.MINIMAP_ABOVE_PX)) * T.MINIMAP_SCALE });
  });
});

describe('what counts as a mark', () => {
  it('maps every entity kind of the table to its mark and rect', () => {
    const model = mapOf([
      ceiling({ x: 100, y: 200, w: 40, h: 10 }),
      ceiling({ x: 200, y: 300, w: 60, h: 20 }, false),
      hazard({ x: 300, y: 100, w: 40, h: 30 }),
      pickup({ x: 400, y: 500 }),
      field({ x: 0, y: 450, w: 540, h: 60 }),
      boya(250),
      station(300),
    ]);

    expect(only(model, 'ledge').rect).toEqual({ x: 10, y: 20, w: 4, h: 1 });
    expect(only(model, 'ledgeNoRest').rect).toEqual({ x: 20, y: 30, w: 6, h: 2 });
    expect(only(model, 'hazard').rect).toEqual({ x: 30, y: 10, w: 4, h: 3 });
    // A point mark is 1×1 px, at the point.
    expect(only(model, 'pickup').rect).toEqual({ x: 40, y: 50, w: 1, h: 1 });
    expect(only(model, 'field').rect).toEqual({ x: 0, y: 45, w: 54, h: 6 });
    // The boya is a full-width 1 px line, the station a full-width CHUNK_H band.
    expect(only(model, 'boya').rect).toEqual({ x: 0, y: 25, w: model.w, h: 1 });
    expect(only(model, 'station').rect).toEqual({ x: 0, y: 30, w: model.w, h: T.CHUNK_H * T.MINIMAP_SCALE });
    expect(model.marks.length).toBe(7);
  });

  it('never lets a hazard shrink below 1×1 px (a crown is 6 world px across)', () => {
    const model = mapOf([hazard({ x: 300, y: 400, w: 6, h: 6 })]);
    expect(only(model, 'hazard').rect).toEqual({ x: 30, y: 40, w: 1, h: 1 });
  });

  it('draws no wall and no anchor, even when they sit in the middle of the map', () => {
    const model = mapOf([
      wall({ x: 0, y: 100, w: 20, h: 300 }),
      wall({ x: 520, y: 100, w: 20, h: 300 }),
      anchor({ x: 270, y: 250 }),
      ceiling({ x: 100, y: 200, w: 40, h: 10 }),
    ]);
    expect(model.marks.map((m) => m.kind)).toEqual(['ledge']);
  });

  it('keeps the marks in entity order, so two frames of the same world draw the same map', () => {
    const entities = [pickup({ x: 100, y: 100 }), hazard({ x: 200, y: 200, w: 20, h: 20 }), boya(300)];
    expect(mapOf(entities).marks).toEqual(mapOf(entities).marks);
    expect(mapOf(entities).marks.map((m) => m.kind)).toEqual(['pickup', 'hazard', 'boya']);
  });
});

describe('clipping', () => {
  it('clips a mark that only half fits and keeps the part that does', () => {
    const above = mapOf([ceiling({ x: 100, y: -40, w: 40, h: 60 })]); // world y -40..20, map top is 0
    expect(only(above, 'ledge').rect).toEqual({ x: 10, y: 0, w: 4, h: 2 });

    const below = mapOf([field({ x: 0, y: 550, w: 540, h: 200 })]); // runs past the bottom edge (600)
    expect(only(below, 'field').rect).toEqual({ x: 0, y: 55, w: 54, h: 5 });

    const side = mapOf([hazard({ x: 520, y: 100, w: 40, h: 20 })]); // runs past the right edge (540)
    expect(only(side, 'hazard').rect).toEqual({ x: 52, y: 10, w: 2, h: 2 });
  });

  it('drops what is entirely off the map, above, below or at the edge', () => {
    expect(mapOf([ceiling({ x: 100, y: -100, w: 40, h: 20 })]).marks).toEqual([]); // fully above
    expect(mapOf([ceiling({ x: 100, y: 700, w: 40, h: 20 })]).marks).toEqual([]); // fully below
    // The boya's line is 1 minimap px = 10 world px tall, so "above the map" starts 10 px above it.
    expect(mapOf([boya(-0.1)]).marks.length).toBe(1); // still 0,9 px of line on the map
    expect(mapOf([boya(-10)]).marks).toEqual([]);
    expect(mapOf([boya(T.MINIMAP_WORLD_H)]).marks).toEqual([]);
    expect(mapOf([pickup({ x: T.WORLD_W, y: 300 })]).marks).toEqual([]); // 1×1 starting on the edge
    expect(mapOf([pickup({ x: 300, y: T.MINIMAP_WORLD_H })]).marks).toEqual([]);
  });

  it('never returns a mark outside the map or with zero area', () => {
    const model = mapOf([
      ceiling({ x: -30, y: -10, w: 100, h: 40 }),
      station(560),
      boya(0),
      hazard({ x: 535, y: 595, w: 20, h: 20 }),
      pickup({ x: 0, y: 0 }),
    ]);
    expect(model.marks.length).toBeGreaterThan(0);
    for (const mark of model.marks) {
      expect(mark.rect.w).toBeGreaterThan(0);
      expect(mark.rect.h).toBeGreaterThan(0);
      expect(mark.rect.x).toBeGreaterThanOrEqual(0);
      expect(mark.rect.y).toBeGreaterThanOrEqual(0);
      expect(mark.rect.x + mark.rect.w).toBeLessThanOrEqual(model.w);
      expect(mark.rect.y + mark.rect.h).toBeLessThanOrEqual(model.h);
    }
  });
});

describe('minimapToWorld', () => {
  /** The forward mapping of `buildMinimap`, written out so the round trip is tested against the spec. */
  function toMinimap(p: Vec2, model: MinimapModel): Vec2 {
    return { x: p.x * model.scale, y: (p.y - model.worldTopY) * model.scale };
  }

  it('is the exact inverse of the mapping, for every point of the map (seeded property test)', () => {
    const rng = new SeededRNG(20260906);
    for (let camY = 0; camY < 3000; camY += 617) {
      const model = mapOf([], { y: camY });
      for (let i = 0; i < 200; i++) {
        const point = { x: rng.next() * model.w, y: rng.next() * model.h };
        const world = minimapToWorld(point, model);
        const back = toMinimap(world, model);
        expect(back.x).toBeCloseTo(point.x, 9);
        expect(back.y).toBeCloseTo(point.y, 9);
        // ...and the world point is inside the world column and the map's world band.
        expect(world.x).toBeGreaterThanOrEqual(0);
        expect(world.x).toBeLessThanOrEqual(T.WORLD_W);
        expect(world.y).toBeGreaterThanOrEqual(model.worldTopY);
        expect(world.y).toBeLessThanOrEqual(model.worldTopY + T.MINIMAP_WORLD_H);
      }
    }
  });

  it('sends the corners and the centre of the map where they belong', () => {
    const model = mapOf([], { y: 1000 });
    const topLeft = minimapToWorld({ x: 0, y: 0 }, model);
    expect(topLeft.x).toBeCloseTo(0, 9);
    expect(topLeft.y).toBeCloseTo(1000 - T.MINIMAP_ABOVE_PX, 9);

    const bottomRight = minimapToWorld({ x: model.w, y: model.h }, model);
    expect(bottomRight.x).toBeCloseTo(T.WORLD_W, 9);
    expect(bottomRight.y).toBeCloseTo(1000 - T.MINIMAP_ABOVE_PX + T.MINIMAP_WORLD_H, 9);

    // The camera's own top edge sits MINIMAP_ABOVE_PX below the top of the map.
    const camTop = minimapToWorld({ x: model.w / 2, y: T.MINIMAP_ABOVE_PX * T.MINIMAP_SCALE }, model);
    expect(camTop.x).toBeCloseTo(T.WORLD_W / 2, 9);
    expect(camTop.y).toBeCloseTo(1000, 9);
  });

  it('takes the finger back to the mark it landed on', () => {
    const model = mapOf([ceiling({ x: 300, y: 400, w: 40, h: 10 })]);
    const mark = only(model, 'ledge');
    const world = minimapToWorld({ x: mark.rect.x, y: mark.rect.y }, model);
    expect(world.x).toBeCloseTo(300, 9);
    expect(world.y).toBeCloseTo(400, 9);
  });
});

describe('cost', () => {
  it('walks the entity list exactly once and allocates only the marks', () => {
    const entities: WorldEntity[] = [];
    for (let i = 0; i < 200; i++) entities.push(pickup({ x: (i * 7) % 500, y: (i * 13) % 500 }));
    const reads = new Map<number, number>();
    const watched = new Proxy(entities, {
      get(target, key, receiver) {
        if (typeof key === 'string' && Number.isInteger(Number(key))) {
          reads.set(Number(key), (reads.get(Number(key)) ?? 0) + 1);
        }
        return Reflect.get(target, key, receiver);
      },
    }) as readonly WorldEntity[];

    const model = buildMinimap(watched, camera(), bur(), T);
    expect(model.marks.length).toBe(entities.length);
    expect(reads.size).toBe(entities.length); // one pass: O(entities), no second sweep
    for (let i = 0; i < entities.length; i++) expect(reads.get(i)).toBe(1);
  });

  it('never touches the entities it reads, and hands out a fresh marks array every frame', () => {
    const entities = [ceiling({ x: 100, y: 200, w: 40, h: 10 }), pickup({ x: 300, y: 300 })];
    const before = JSON.stringify(entities);
    const a = mapOf(entities);
    const b = mapOf(entities);
    expect(JSON.stringify(entities)).toBe(before);
    expect(a.marks).not.toBe(b.marks);
    expect(a.marks[0]).not.toBe(b.marks[0]);
    expect(a.marks).toEqual(b.marks);
  });
});

describe('on a real streamed window', () => {
  it('maps the world the streamer is showing, clipped to the map', () => {
    const world = createTestWorld();
    const snap = world.snapshot();
    const model = snap.minimap;

    expect(model.worldTopY).toBe(snap.camera.y - T.MINIMAP_ABOVE_PX);
    expect(model.bur.x).toBeCloseTo(snap.bubble.pos.x * T.MINIMAP_SCALE, 9);
    expect(model.marks.some((m) => m.kind === 'ledge')).toBe(true);
    // Walls and anchors are the two kinds the streamed window always has and the map never draws.
    expect(snap.entities.some((e) => e.type === 'wall' || e.type === 'anchor')).toBe(true);
    expect(model.marks.length).toBeLessThanOrEqual(snap.entities.length);
    for (const mark of model.marks) {
      expect(mark.rect.x).toBeGreaterThanOrEqual(0);
      expect(mark.rect.y).toBeGreaterThanOrEqual(0);
      expect(mark.rect.x + mark.rect.w).toBeLessThanOrEqual(model.w + 1e-9);
      expect(mark.rect.y + mark.rect.h).toBeLessThanOrEqual(model.h + 1e-9);
    }

    // Every ceiling that fits entirely inside the map is on the map, at its own world position.
    const inside = snap.entities.filter(
      (e): e is Ceiling =>
        e.type === 'ceiling' &&
        e.rect.x >= 0 &&
        e.rect.x + e.rect.w <= T.WORLD_W &&
        e.rect.y >= model.worldTopY &&
        e.rect.y + e.rect.h <= model.worldTopY + T.MINIMAP_WORLD_H,
    );
    expect(inside.length).toBeGreaterThan(0);
    for (const c of inside) {
      const expected = {
        kind: c.capturable ? 'ledge' : 'ledgeNoRest',
        rect: {
          x: c.rect.x * T.MINIMAP_SCALE,
          y: (c.rect.y - model.worldTopY) * T.MINIMAP_SCALE,
          w: c.rect.w * T.MINIMAP_SCALE,
          h: c.rect.h * T.MINIMAP_SCALE,
        },
      };
      expect(model.marks).toContainEqual(expected);
      // ...and the finger that lands on that mark asks to look at that ceiling.
      const back = minimapToWorld({ x: expected.rect.x, y: expected.rect.y }, model);
      expect(back.x).toBeCloseTo(c.rect.x, 6);
      expect(back.y).toBeCloseTo(c.rect.y, 6);
    }
  });
});
