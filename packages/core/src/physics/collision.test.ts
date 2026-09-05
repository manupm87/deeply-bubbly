import { describe, expect, it } from 'vitest';
import { CONTACT_EPSILON, moveCircle, solidRectAt, sweepCircleAabb } from './collision';
import { DEFAULT_TUNING, createTuning } from '../tuning';
import { SeededRNG } from '../ports';
import type { Rect } from '../math/vec';
import type { Ceiling, MovingSpec, SolidEntity, Wall } from '../types';

const BOX: Rect = { x: 40, y: 60, w: 40, h: 10 }; // x 40..80, y 60..70

function ceiling(over: Partial<Ceiling> = {}): Ceiling {
  return {
    type: 'ceiling',
    id: 'c1',
    rect: { ...BOX },
    kind: 'posadero',
    capturable: true,
    restitution: DEFAULT_TUNING.RESTITUTION_ROCK,
    material: 'rock',
    ...over,
  };
}

function wall(over: Partial<Wall> = {}): Wall {
  return {
    type: 'wall',
    id: 'w1',
    rect: { x: 0, y: 0, w: 10, h: 400 },
    restitution: DEFAULT_TUNING.RESTITUTION_ROCK,
    material: 'rock',
    ...over,
  };
}

/** Distance from a point to the rect (0 when inside). Used to assert we never end up inside a body. */
function distanceToRect(p: { x: number; y: number }, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

describe('sweepCircleAabb — face hits (§11.4)', () => {
  it('returns null when the sweep does not reach the rect', () => {
    expect(sweepCircleAabb({ x: 60, y: 0 }, 5, { x: 0, y: 10 }, BOX)).toBeNull();
  });

  it('returns null when moving away from the rect', () => {
    expect(sweepCircleAabb({ x: 60, y: 100 }, 5, { x: 0, y: 100 }, BOX)).toBeNull();
  });

  it('returns null for a zero displacement with no overlap', () => {
    expect(sweepCircleAabb({ x: 60, y: 100 }, 5, { x: 0, y: 0 }, BOX)).toBeNull();
  });

  it('hits the BOTTOM face exactly when arriving from below (normal points +y, toward Bur)', () => {
    // Contact when the centre reaches y = maxY + r = 75; from y = 100 that is 25 of the 40 px sweep.
    const hit = sweepCircleAabb({ x: 60, y: 100 }, 5, { x: 0, y: -40 }, BOX);
    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(0.625, 12);
    expect(hit?.face).toBe('bottom');
    expect(hit?.normal).toEqual({ x: 0, y: 1 });
    expect(hit?.point).toEqual({ x: 60, y: 70 });
  });

  it('hits the TOP face exactly when arriving from above', () => {
    // Contact when the centre reaches y = minY - r = 55; from y = 20 that is 35 of the 40 px sweep.
    const hit = sweepCircleAabb({ x: 60, y: 20 }, 5, { x: 0, y: 40 }, BOX);
    expect(hit?.t).toBeCloseTo(0.875, 12);
    expect(hit?.face).toBe('top');
    expect(hit?.normal).toEqual({ x: 0, y: -1 });
    expect(hit?.point).toEqual({ x: 60, y: 60 });
  });

  it('hits the LEFT face exactly when arriving from the left', () => {
    // Contact when the centre reaches x = minX - r = 35; from x = 15 that is 20 of the 40 px sweep.
    const hit = sweepCircleAabb({ x: 15, y: 65 }, 5, { x: 40, y: 0 }, BOX);
    expect(hit?.t).toBeCloseTo(0.5, 12);
    expect(hit?.face).toBe('left');
    expect(hit?.normal).toEqual({ x: -1, y: 0 });
    expect(hit?.point).toEqual({ x: 40, y: 65 });
  });

  it('hits the RIGHT face exactly when arriving from the right', () => {
    // Contact when the centre reaches x = maxX + r = 85; from x = 105 that is 20 of the 40 px sweep.
    const hit = sweepCircleAabb({ x: 105, y: 65 }, 5, { x: -40, y: 0 }, BOX);
    expect(hit?.t).toBeCloseTo(0.5, 12);
    expect(hit?.face).toBe('right');
    expect(hit?.normal).toEqual({ x: 1, y: 0 });
    expect(hit?.point).toEqual({ x: 80, y: 65 });
  });

  it('t = 1 is inclusive (contact exactly at the end of the sweep)', () => {
    const hit = sweepCircleAabb({ x: 60, y: 100 }, 5, { x: 0, y: -25 }, BOX);
    expect(hit?.t).toBeCloseTo(1, 12);
    expect(hit?.face).toBe('bottom');
  });

  it('grazing past the side of a face is not a face hit', () => {
    // Passing 20 px to the right of the rect: never within r of it.
    expect(sweepCircleAabb({ x: 100, y: 100 }, 5, { x: 0, y: -80 }, BOX)).toBeNull();
  });
});

describe('sweepCircleAabb — corner hits (Minkowski rounded corners)', () => {
  const unit: Rect = { x: 0, y: 0, w: 10, h: 10 };

  it('uses the corner circle, not the expanded box, on a diagonal approach', () => {
    // Straight at the (0,0) corner along the diagonal: touch when |p| = r = 1 => p = (-1/√2, -1/√2).
    const hit = sweepCircleAabb({ x: -5, y: -5 }, 1, { x: 10, y: 10 }, unit);
    expect(hit).not.toBeNull();
    const expectedT = (5 - Math.SQRT1_2) / 10;
    expect(hit?.t).toBeCloseTo(expectedT, 12);
    expect(hit?.point).toEqual({ x: 0, y: 0 });
    expect(hit?.normal.x).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(hit?.normal.y).toBeCloseTo(-Math.SQRT1_2, 12);
  });

  it('a square-box (non-Minkowski) test would report contact too early', () => {
    const hit = sweepCircleAabb({ x: -5, y: -5 }, 1, { x: 10, y: 10 }, unit);
    // The naive "expand the rect by r on both axes" answer would be t = 4/10.
    expect(hit?.t).toBeGreaterThan(0.4);
  });

  it('a corner hit reports the face whose axis dominates the normal', () => {
    // Mostly vertical approach that clips the top-left corner: normal leans toward 'top'.
    const hit = sweepCircleAabb({ x: -2, y: -10 }, 4, { x: 0, y: 20 }, unit);
    expect(hit).not.toBeNull();
    expect(hit?.point).toEqual({ x: 0, y: 0 });
    expect(hit?.face).toBe('top');
    expect(hit?.normal.x).toBeCloseTo(-0.5, 12);
    expect(Math.hypot(hit?.normal.x ?? 0, hit?.normal.y ?? 0)).toBeCloseTo(1, 12);
  });

  it('misses when the path passes outside the corner radius', () => {
    // Centre travels down 3.1 px to the left of the corner with r = 3: never touches.
    expect(sweepCircleAabb({ x: -3.1, y: -10 }, 3, { x: 0, y: 20 }, unit)).toBeNull();
  });
});

describe('sweepCircleAabb — already overlapping at t = 0', () => {
  it('returns t = 0 with the least-penetration normal when the centre is inside', () => {
    // Centre at (60, 68): 2 px above the bottom face, 8 below the top face -> exits downwards.
    const hit = sweepCircleAabb({ x: 60, y: 68 }, 5, { x: 0, y: 0 }, BOX);
    expect(hit?.t).toBe(0);
    expect(hit?.face).toBe('bottom');
    expect(hit?.normal).toEqual({ x: 0, y: 1 });
  });

  it('picks the horizontal face when that is the shallowest way out', () => {
    // Centre at (42, 65): 2 px from the left face, 5 from top/bottom.
    const hit = sweepCircleAabb({ x: 42, y: 65 }, 5, { x: 0, y: 0 }, BOX);
    expect(hit?.face).toBe('left');
    expect(hit?.normal).toEqual({ x: -1, y: 0 });
  });

  it('pushes straight out of the nearest surface point when the centre is outside but the circle overlaps', () => {
    const hit = sweepCircleAabb({ x: 60, y: 73 }, 5, { x: 0, y: 0 }, BOX);
    expect(hit?.t).toBe(0);
    expect(hit?.face).toBe('bottom');
    expect(hit?.normal).toEqual({ x: 0, y: 1 });
    expect(hit?.point).toEqual({ x: 60, y: 70 });
  });

  it('a circle exactly touching the surface is NOT overlapping', () => {
    // Centre at maxY + r with zero motion: touching, not penetrating.
    expect(sweepCircleAabb({ x: 60, y: 75 }, 5, { x: 0, y: 0 }, BOX)).toBeNull();
  });
});

describe('moveCircle — resolution (§11.4)', () => {
  const t = createTuning();
  const opts = { lateralFriction: t.LATERAL_FRICTION, timeMs: 1000 };

  it('moves freely when nothing is in the way', () => {
    const r = moveCircle({ x: 10, y: 10 }, { x: 60, y: 120 }, 5, 0.5, [], opts);
    expect(r.pos).toEqual({ x: 40, y: 70 });
    expect(r.vel).toEqual({ x: 60, y: 120 });
    expect(r.contacts).toEqual([]);
  });

  it('reflects the normal component by the body restitution and shaves the tangential one', () => {
    const body = ceiling({ restitution: 0.5 });
    // Falling onto the top face from above with some horizontal drift.
    const r = moveCircle({ x: 60, y: 20 }, { x: 100, y: 400 }, 5, 0.5, [body], opts);
    expect(r.contacts).toHaveLength(1);
    expect(r.contacts[0]?.face).toBe('top');
    expect(r.contacts[0]?.bodyId).toBe('c1');
    expect(r.contacts[0]?.approachSpeed).toBeCloseTo(400, 9);
    // Normal component reflected: +400 -> -200. Tangential: 100 * (1 - 0.08).
    expect(r.vel.y).toBeCloseTo(-200, 9);
    expect(r.vel.x).toBeCloseTo(100 * (1 - t.LATERAL_FRICTION), 9);
  });

  it('places the circle at the impact backed off by CONTACT_EPSILON along the normal', () => {
    const body = ceiling();
    const r = moveCircle({ x: 60, y: 20 }, { x: 0, y: 400 }, 5, 0.5, [body], { ...opts, maxIterations: 1 });
    // Contact at centre y = 60 - 5 = 55, pushed out along the 'top' normal (0,-1).
    expect(r.pos.y).toBeCloseTo(55 - CONTACT_EPSILON, 9);
    expect(distanceToRect(r.pos, body.rect)).toBeGreaterThan(5);
  });

  it("names the body's BOTTOM face when Bur arrives from below (rest capture candidate, §2.3)", () => {
    const body = ceiling();
    const r = moveCircle({ x: 60, y: 100 }, { x: 0, y: -120 }, 5, 0.5, [body], opts);
    expect(r.contacts).toHaveLength(1);
    expect(r.contacts[0]?.face).toBe('bottom');
    expect(r.contacts[0]?.normal).toEqual({ x: 0, y: 1 });
    expect(r.contacts[0]?.approachSpeed).toBeCloseTo(120, 9);
    expect(r.vel.y).toBeGreaterThan(0); // bounced back downwards
  });

  it('reports the contact time inside the tick', () => {
    const body = ceiling();
    // 40 px of travel in 1 s; contact after 25 px -> 625 ms into the tick.
    const r = moveCircle({ x: 60, y: 100 }, { x: 0, y: -40 }, 5, 1, [body], opts);
    expect(r.contacts[0]?.timeMs).toBeCloseTo(1000 + 625, 6);
  });

  it('continues the remaining time fraction after a bounce', () => {
    const body = ceiling({ restitution: 1 });
    // Contact at t = 0.5 of a 1 s tick, then 0.5 s of travel back at the same speed.
    const r = moveCircle({ x: 60, y: 125 }, { x: 0, y: -100 }, 5, 1, [body], { ...opts, maxIterations: 4 });
    expect(r.contacts).toHaveLength(1);
    expect(r.vel.y).toBeCloseTo(100, 9);
    expect(r.pos.y).toBeCloseTo(75 + 50 + CONTACT_EPSILON, 6);
  });

  it('resolves successive contacts in one tick (floor then wall)', () => {
    const floor = wall({ id: 'floor', rect: { x: 0, y: 100, w: 200, h: 20 }, restitution: 1 });
    const side = wall({ id: 'side', rect: { x: 0, y: 0, w: 20, h: 200 }, restitution: 1 });
    const r = moveCircle({ x: 60, y: 60 }, { x: -100, y: 100 }, 5, 1, [floor, side], { ...opts, maxIterations: 4 });
    expect(r.contacts.map((c) => c.bodyId)).toEqual(['floor', 'side']);
    expect(distanceToRect(r.pos, floor.rect)).toBeGreaterThan(5 - 1e-6);
    expect(distanceToRect(r.pos, side.rect)).toBeGreaterThan(5 - 1e-6);
  });

  it('honours maxIterations (default 4) and never leaves the circle inside a body', () => {
    const floor = wall({ id: 'floor', rect: { x: 0, y: 100, w: 200, h: 20 }, restitution: 1 });
    const roof = wall({ id: 'roof', rect: { x: 0, y: 0, w: 200, h: 20 }, restitution: 1 });
    const r = moveCircle({ x: 60, y: 60 }, { x: 0, y: 1000 }, 5, 1, [floor, roof], opts);
    expect(r.contacts.length).toBeLessThanOrEqual(4);
    expect(distanceToRect(r.pos, floor.rect)).toBeGreaterThan(5 - 1e-6);
    expect(distanceToRect(r.pos, roof.rect)).toBeGreaterThan(5 - 1e-6);
  });

  it('stops after maxIterations = 1 with the position at the impact', () => {
    const body = ceiling({ restitution: 1 });
    const r = moveCircle({ x: 60, y: 125 }, { x: 0, y: -100 }, 5, 1, [body], { ...opts, maxIterations: 1 });
    expect(r.contacts).toHaveLength(1);
    expect(r.pos.y).toBeCloseTo(75 + CONTACT_EPSILON, 9);
  });

  it('skips bodies listed in ignoreIds (trampoline cooldown, dissolved snow)', () => {
    const body = ceiling();
    const r = moveCircle({ x: 60, y: 20 }, { x: 0, y: 400 }, 5, 0.5, [body], {
      ...opts,
      ignoreIds: new Set(['c1']),
    });
    expect(r.contacts).toEqual([]);
    expect(r.pos.y).toBe(220);
  });

  it('accepts a per-body restitution override', () => {
    const body = ceiling({ restitution: 0.1 });
    const r = moveCircle({ x: 60, y: 20 }, { x: 0, y: 400 }, 5, 0.5, [body], {
      ...opts,
      restitutionById: new Map([['c1', 0.92]]),
    });
    expect(r.vel.y).toBeCloseTo(-400 * 0.92, 9);
  });

  it('fully depenetrates an initial overlap instead of getting stuck', () => {
    const body = ceiling();
    // Centre 2 px above the bottom face: least penetration is downwards, so it is pushed to y = 75.
    const r = moveCircle({ x: 60, y: 68 }, { x: 30, y: 0 }, 5, 1, [body], opts);
    expect(r.contacts).toHaveLength(1);
    expect(r.contacts[0]?.face).toBe('bottom');
    expect(r.contacts[0]?.timeMs).toBe(opts.timeMs);
    expect(distanceToRect(r.pos, body.rect)).toBeGreaterThan(5);
    // The remaining time is still spent: the overlap costs one iteration, not the whole tick.
    expect(r.pos.x).toBeCloseTo(90, 6);
  });

  it('returns the input untouched for a non-positive dt', () => {
    const r = moveCircle({ x: 1, y: 2 }, { x: 3, y: 4 }, 5, 0, [ceiling()], opts);
    expect(r.pos).toEqual({ x: 1, y: 2 });
    expect(r.vel).toEqual({ x: 3, y: 4 });
    expect(r.contacts).toEqual([]);
  });

  it('does not mutate the caller’s pos/vel', () => {
    const pos = { x: 60, y: 20 };
    const vel = { x: 0, y: 400 };
    moveCircle(pos, vel, 5, 0.5, [ceiling()], opts);
    expect(pos).toEqual({ x: 60, y: 20 });
    expect(vel).toEqual({ x: 0, y: 400 });
  });
});

describe('moveCircle — no tunneling (§11.4)', () => {
  const t = createTuning();
  const opts = { lateralFriction: t.LATERAL_FRICTION, timeMs: 0 };

  it('r = 4 at MAX_FALL_SPEED against an 8 px slab in one 1/60 s step makes contact', () => {
    const slab = ceiling({ rect: { x: 0, y: 40, w: 180, h: 8 } });
    const r = moveCircle({ x: 90, y: 30 }, { x: 0, y: t.MAX_FALL_SPEED }, 4, t.FIXED_DT, [slab], opts);
    expect(r.contacts).toHaveLength(1);
    expect(r.contacts[0]?.face).toBe('top');
    expect(r.pos.y).toBeLessThan(40 - 4);
  });

  it('cannot tunnel even at an absurd speed (displacement 10x the slab thickness)', () => {
    const slab = ceiling({ rect: { x: 0, y: 100, w: 180, h: 8 } });
    const r = moveCircle({ x: 90, y: 20 }, { x: 0, y: 6000 }, 4, t.FIXED_DT, [slab], opts);
    expect(r.contacts.length).toBeGreaterThan(0);
    expect(r.pos.y).toBeLessThan(100);
  });

  it('never ends inside a slab over a long fast descent', () => {
    const slab = ceiling({ rect: { x: 0, y: 300, w: 180, h: 8 }, restitution: 0.55 });
    let pos = { x: 90, y: 0 };
    let vel = { x: 37, y: t.MAX_FALL_SPEED };
    for (let i = 0; i < 240; i++) {
      const r = moveCircle(pos, vel, 4, t.FIXED_DT, [slab], { ...opts, timeMs: i * 16.6667 });
      pos = r.pos;
      vel = r.vel;
      const dx = Math.max(slab.rect.x - pos.x, 0, pos.x - (slab.rect.x + slab.rect.w));
      const dy = Math.max(slab.rect.y - pos.y, 0, pos.y - (slab.rect.y + slab.rect.h));
      expect(Math.hypot(dx, dy)).toBeGreaterThan(4 - 1e-6);
    }
  });
});

describe('solidRectAt — kinematic oscillation', () => {
  it('returns a copy of the base rect for a static solid', () => {
    const body = ceiling();
    const r = solidRectAt(body, 12345);
    expect(r).toEqual(body.rect);
    expect(r).not.toBe(body.rect);
  });

  it('is a triangle wave centred on the base rect', () => {
    const moving: MovingSpec = { axis: 'x', speed: 40, range: 20 }; // period = 2*20/40 = 1 s
    const body = ceiling({ moving });
    expect(solidRectAt(body, 0).x).toBeCloseTo(BOX.x, 9);
    expect(solidRectAt(body, 250).x).toBeCloseTo(BOX.x + 10, 9);
    expect(solidRectAt(body, 500).x).toBeCloseTo(BOX.x, 9);
    expect(solidRectAt(body, 750).x).toBeCloseTo(BOX.x - 10, 9);
    expect(solidRectAt(body, 1000).x).toBeCloseTo(BOX.x, 9);
  });

  it('stays within ±range/2 and moves at the declared speed', () => {
    const body = ceiling({ moving: { axis: 'y', speed: 30, range: 24 } });
    let prev = solidRectAt(body, 0).y;
    for (let ms = 0; ms <= 5000; ms += 5) {
      const y = solidRectAt(body, ms).y;
      expect(Math.abs(y - BOX.y)).toBeLessThanOrEqual(12 + 1e-9);
      // 5 ms at 30 px/s = 0.15 px per sample (except at the two turning points).
      expect(Math.abs(y - prev)).toBeLessThanOrEqual(0.15 + 1e-9);
      prev = y;
    }
    // Average speed over a quarter cycle (0 -> +12 px in 400 ms) is exactly `speed`.
    expect(solidRectAt(body, 400).y - solidRectAt(body, 0).y).toBeCloseTo(12, 9);
  });

  it('only offsets the declared axis', () => {
    const body = ceiling({ moving: { axis: 'y', speed: 40, range: 20 } });
    const r = solidRectAt(body, 250);
    expect(r.x).toBe(BOX.x);
    expect(r.y).toBeCloseTo(BOX.y + 10, 9);
    expect(r.w).toBe(BOX.w);
    expect(r.h).toBe(BOX.h);
  });

  it('applies the initial phase', () => {
    const body = ceiling({ moving: { axis: 'x', speed: 40, range: 20, phase: 0.25 } });
    expect(solidRectAt(body, 0).x).toBeCloseTo(BOX.x + 10, 9);
    expect(solidRectAt(body, 250).x).toBeCloseTo(BOX.x, 9);
  });

  it('ignores degenerate movement specs', () => {
    expect(solidRectAt(ceiling({ moving: { axis: 'x', speed: 0, range: 20 } }), 500).x).toBe(BOX.x);
    expect(solidRectAt(ceiling({ moving: { axis: 'x', speed: 40, range: 0 } }), 500).x).toBe(BOX.x);
  });

  it('walls never move (only ceilings declare a MovingSpec)', () => {
    const w: SolidEntity = wall();
    expect(solidRectAt(w, 999)).toEqual(w.rect);
  });

  it('moveCircle collides against the CURRENT rect of a moving solid', () => {
    const t = createTuning();
    const body = ceiling({ rect: { x: 40, y: 60, w: 40, h: 10 }, moving: { axis: 'y', speed: 40, range: 20 } });
    // At 250 ms the ceiling sits 10 px lower (y 70..80): a sweep that would miss the base rect now hits.
    const away = moveCircle({ x: 60, y: 100 }, { x: 0, y: -40 }, 5, 0.5, [body], {
      lateralFriction: t.LATERAL_FRICTION,
      timeMs: 0,
    });
    expect(away.contacts).toEqual([]);
    const near = moveCircle({ x: 60, y: 100 }, { x: 0, y: -40 }, 5, 0.5, [body], {
      lateralFriction: t.LATERAL_FRICTION,
      timeMs: 250,
    });
    expect(near.contacts).toHaveLength(1);
    expect(near.contacts[0]?.face).toBe('bottom');
  });
});

describe('moveCircle — stopAtContact capture hook (§2.3)', () => {
  const t = createTuning();
  const opts = { lateralFriction: t.LATERAL_FRICTION, timeMs: 0 };

  it('stops at the requested contact with the velocity untouched (rest capture, "un solo evento")', () => {
    const roof = ceiling({ rect: { x: 0, y: 40, w: 180, h: 20 } });
    const seen: string[] = [];
    const r = moveCircle({ x: 60, y: 120 }, { x: 40, y: -200 }, 5, 1, [roof], {
      ...opts,
      stopAtContact: (c) => {
        seen.push(c.face);
        return c.face === 'bottom';
      },
    });
    expect(seen).toEqual(['bottom']);
    expect(r.contacts).toHaveLength(1);
    expect(r.contacts[0]?.approachSpeed).toBeCloseTo(200, 9);
    // Neither reflected nor shaved: bubbleStep decides between RESTING and a bounce.
    expect(r.vel).toEqual({ x: 40, y: -200 });
    // Parked exactly at the capture point (bottom face at y = 60, centre one radius below).
    expect(r.pos.y).toBeCloseTo(65 + CONTACT_EPSILON, 9);
  });

  it('bounces normally for the contacts the hook declines', () => {
    const floor = wall({ id: 'floor', rect: { x: 0, y: 100, w: 200, h: 20 }, restitution: 1 });
    const r = moveCircle({ x: 60, y: 60 }, { x: 0, y: 100 }, 5, 1, [floor], {
      ...opts,
      stopAtContact: (c) => c.face === 'bottom',
    });
    expect(r.contacts.map((c) => c.face)).toEqual(['top']);
    expect(r.vel.y).toBeCloseTo(-100, 9);
  });

  it('applies to a contact produced by the initial depenetration too', () => {
    const body = ceiling();
    const r = moveCircle({ x: 60, y: 68 }, { x: 30, y: 0 }, 5, 1, [body], {
      ...opts,
      stopAtContact: () => true,
    });
    expect(r.contacts).toHaveLength(1);
    // Separated (the circle is never left inside), but the tick's travel is not spent.
    expect(distanceToRect(r.pos, body.rect)).toBeGreaterThan(5);
    expect(r.pos.x).toBe(60);
    expect(r.vel).toEqual({ x: 30, y: 0 });
  });
});

describe('moveCircle — randomized regression: a feasible pocket is always left clear (§11.4)', () => {
  const t = createTuning();
  const opts = { lateralFriction: t.LATERAL_FRICTION, timeMs: 0 };

  /** Deepest overlap of the circle into a rect; <= 0 means the circle is outside it. */
  function penetration(p: { x: number; y: number }, r: number, rect: Rect): number {
    return r - distanceToRect(p, rect);
  }

  it('one body, any start (including deep inside it) and any speed: never ends inside', () => {
    const rng = new SeededRNG(0x5eed);
    for (let i = 0; i < 1500; i++) {
      const rect: Rect = {
        x: 20 + rng.next() * 60,
        y: 20 + rng.next() * 60,
        w: 8 + rng.next() * 80,
        h: 8 + rng.next() * 40,
      };
      const r = 3 + rng.next() * 5;
      const start = { x: rng.next() * 180, y: rng.next() * 180 };
      const speed = rng.next() * 900;
      const angle = rng.next() * Math.PI * 2;
      const vel = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
      const body: SolidEntity = ceiling({ rect });
      const res = moveCircle(start, vel, r, t.FIXED_DT, [body], opts);
      expect(penetration(res.pos, r, rect)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('a corridor wider than the diameter is always fully resolved, from any start inside it', () => {
    const rng = new SeededRNG(0xc0ffee);
    for (let i = 0; i < 1500; i++) {
      const r = 3 + rng.next() * 4;
      const gap = 2 * r + 0.5 + rng.next() * 20; // feasible by construction
      const roofBottom = 40 + rng.next() * 60;
      const roof: Rect = { x: 0, y: roofBottom - 20, w: 180, h: 20 };
      const floor: Rect = { x: 0, y: roofBottom + gap, w: 180, h: 20 };
      const bodies: SolidEntity[] = [ceiling({ id: 'roof', rect: roof }), ceiling({ id: 'floor', rect: floor })];
      // Start anywhere in the band, overlaps included.
      const start = { x: rng.next() * 180, y: roofBottom - r + rng.next() * (gap + 2 * r) };
      const speed = rng.next() * 700;
      const angle = rng.next() * Math.PI * 2;
      const res = moveCircle(start, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, r, t.FIXED_DT, bodies, opts);
      expect(penetration(res.pos, r, roof)).toBeLessThanOrEqual(1e-6);
      expect(penetration(res.pos, r, floor)).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('moveCircle — jammed in a gap narrower than the diameter (§2.6, §2.3)', () => {
  const t = createTuning();
  const opts = { lateralFriction: t.LATERAL_FRICTION, timeMs: 0 };
  // A Z6-style slit: 8 px of clearance (y 80..88) for a Bur reinflated to r = 5.
  const roof = ceiling({ id: 'roof', rect: { x: 0, y: 60, w: 180, h: 20 } });
  const floor = ceiling({ id: 'floor', rect: { x: 0, y: 88, w: 180, h: 20 } });
  const bodies: SolidEntity[] = [roof, floor];

  it('cancels the velocity that pushes further in instead of reflecting it (no rattle, §2.3)', () => {
    const r = moveCircle({ x: 90, y: 84 }, { x: 60, y: -120 }, 5, t.FIXED_DT, bodies, opts);
    // Pinned: the upward push is dropped, not bounced back downwards at 0.55 restitution.
    expect(r.vel.y).toBe(0);
    // Lateral friction is a bounce cost (§2.2); being stuck is not a bounce, so the slide survives.
    expect(r.vel.x).toBe(60);
  });

  it('lets Bur slide out of the slit instead of grinding her horizontal speed to zero', () => {
    let pos = { x: 20, y: 84 };
    let vel = { x: 60, y: 0 };
    for (let i = 0; i < 60; i++) {
      vel = { x: vel.x, y: vel.y - t.BUOYANCY * t.FIXED_DT }; // buoyancy keeps pressing her up
      const r = moveCircle(pos, vel, 5, t.FIXED_DT, bodies, { ...opts, timeMs: (i * 1000) / 60 });
      pos = r.pos;
      vel = r.vel;
    }
    expect(vel.x).toBeCloseTo(60, 9);
    expect(pos.x).toBeCloseTo(20 + 60, 6);
    expect(pos.y).toBeCloseTo(84, 6);
  });

  it('randomised wedges never end deeper than the geometry forces, over 120 ticks each', () => {
    const rng = new SeededRNG(0xbadbed);
    for (let k = 0; k < 200; k++) {
      const r = 3 + rng.next() * 3;
      const gap = 2 * r * (0.25 + rng.next() * 0.7); // strictly narrower than the diameter
      const top: Rect = { x: 0, y: 30, w: 180, h: 20 };
      const bottom: Rect = { x: 0, y: 50 + gap, w: 180, h: 20 };
      const pocket: SolidEntity[] = [ceiling({ id: 'top', rect: top }), ceiling({ id: 'bottom', rect: bottom })];
      const forced = r - gap / 2; // unavoidable overlap in the middle of the corridor
      let pos = { x: 90, y: 50 + gap * rng.next() };
      let vel = { x: (rng.next() - 0.5) * 400, y: (rng.next() - 0.5) * 400 };
      for (let i = 0; i < 120; i++) {
        vel = { x: vel.x, y: vel.y - t.BUOYANCY * t.FIXED_DT };
        const res = moveCircle(pos, vel, r, t.FIXED_DT, pocket, { ...opts, timeMs: (i * 1000) / 60 });
        pos = res.pos;
        vel = res.vel;
        if (pos.x < r || pos.x > 180 - r) break; // slid out past the end of the slabs: no longer wedged
        const deepest = Math.max(r - distanceToRect(pos, top), r - distanceToRect(pos, bottom));
        expect(deepest).toBeLessThanOrEqual(forced + 1e-6);
        expect(pos.y).toBeGreaterThanOrEqual(50);
        expect(pos.y).toBeLessThanOrEqual(50 + gap);
      }
    }
  });
});
