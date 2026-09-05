/**
 * ADVERSARIAL tests for physics/collision.ts.
 *
 * The swept test itself survived a 3.000-case differential fuzz against a bisection ground truth
 * (t, normal, contact point and "no false positives" all exact), and `moveCircle` never leaves the
 * circle inside a body for any FEASIBLE configuration. What follows is the case it did not survive.
 */
import { describe, expect, it } from 'vitest';
import { moveCircle } from './collision';
import { integrateVelocity } from './integrator';
import { createNeutralEnv } from './forceFields';
import { createTuning } from '../tuning';
import type { Vec2 } from '../math/vec';
import type { Ceiling, SolidEntity } from '../types';

const t = createTuning();

function ceiling(id: string, x: number, y: number, w: number, h: number): Ceiling {
  return {
    type: 'ceiling',
    id,
    rect: { x, y, w, h },
    kind: 'posadero',
    capturable: true,
    restitution: t.RESTITUTION_ROCK,
    material: 'rock',
  };
}

/** Penetration depth of the circle into a body (positive = overlapping). */
function penetration(p: Vec2, r: number, body: SolidEntity): number {
  const { x, y, w, h } = body.rect;
  const nx = Math.min(Math.max(p.x, x), x + w);
  const ny = Math.min(Math.max(p.y, y), y + h);
  return r - Math.hypot(p.x - nx, p.y - ny);
}

/**
 * §2.6 makes a radius increase inside a narrow corridor a FIRST-CLASS game situation, not a corner case:
 * "Bolsa de Aire Grande" (§5 nº 15) reinflates Bur one size step for REINFLATE_MS = 12 s, and "en Z6 eso
 * se invierte: reinflar te impide pasar por las rendijas" — Z6 is explicitly "un laberinto de rendijas".
 * A Z6 slit is 8–10 px; a reinflated Bur is ~5 px of radius. The same shape appears with the moving
 * ceilings of §5 (nº 3 Tortuga Paseante, nº 24 Tenaza) sweeping into a Bur that is already against a wall.
 *
 * The defect: `moveCircle` depenetrated from body A, which pushed the circle into body B, then
 * depenetrated from B, which pushed it back into A — and because the resolved body was banned for the
 * rest of the tick, the loop ended with the circle 2 px INSIDE one slab and clear of the other. It was
 * not a transient: the configuration is a stable fixed point, so Bur stayed sunk in the rock forever.
 *
 * CONTRACT CORRECTION (GDD §2.6 + §11.4). The review asked for `penetration <= 0` against BOTH slabs
 * in this same fixture, and that is geometrically impossible: the slit is 8 px, the diameter is 10 px,
 * and the slabs span the full 180 px of the world (§11.1), so no position exists that is outside both
 * — pen_roof(y) = 5 - (y - 80) and pen_floor(y) = 5 - (88 - y) are both <= 0 only for y >= 85 AND
 * y <= 83. The only way to satisfy it literally is to teleport Bur through a slab and out of the level,
 * which §11.4 (swept collision, "sin tunneling") forbids outright. So these tests assert the strongest
 * statement that IS satisfiable, and the one the reviewer's own prose asks for ("clamp to the least
 * penetrating side"): the wedge is resolved to the point of LEAST MAXIMUM penetration — the middle of
 * the corridor, r - gap/2 into each side, symmetric — and it stays there tick after tick instead of
 * sinking into one slab. Getting Bur out of an impossible slit is a game-rule decision that belongs to
 * the caller (refuse the reinflate, vent it early); the physics' job is not to bury her asymmetrically.
 */
describe('moveCircle — wedged between two solids closer than the diameter (§2.6, §5 nº 15)', () => {
  // A Z6-style slit: 8 px of clearance between the two slabs (y 80..88), Bur reinflated to r = 5.
  const roof = ceiling('roof', 0, 60, 180, 20);
  const floor = ceiling('floor', 0, 88, 180, 20);
  const bodies: readonly SolidEntity[] = [roof, floor];
  const R = 5;
  const GAP = 8;
  /** Unavoidable overlap when the circle sits in the middle of a corridor narrower than 2r. */
  const FORCED = R - GAP / 2; // 1 px
  const MIDDLE = 84; // centre of the slit

  it('one tick leaves the circle no deeper than the geometry forces, on both sides equally', () => {
    const res = moveCircle({ x: 90, y: 84 }, { x: 60, y: 0 }, R, t.FIXED_DT, bodies, {
      lateralFriction: t.LATERAL_FRICTION,
      timeMs: 0,
    });
    const inRoof = penetration(res.pos, R, roof);
    const inFloor = penetration(res.pos, R, floor);
    expect(inRoof).toBeLessThanOrEqual(FORCED + 1e-6);
    expect(inFloor).toBeLessThanOrEqual(FORCED + 1e-6);
    // Neither slab "wins": the old behaviour ended 2.00 px inside the roof and clear of the floor.
    expect(Math.abs(inRoof - inFloor)).toBeLessThan(1e-6);
    // It also travelled: the wedge costs no time, it only relocates the circle.
    expect(res.pos.x).toBeCloseTo(90 + 60 * t.FIXED_DT, 9);
  });

  it('the same wedge starting off-centre is pulled back to the middle, not deeper in', () => {
    for (const startY of [80.5, 82, 83.5, 84.5, 86, 87.5]) {
      const res = moveCircle({ x: 90, y: startY }, { x: 0, y: 0 }, R, t.FIXED_DT, bodies, {
        lateralFriction: t.LATERAL_FRICTION,
        timeMs: 0,
      });
      expect(res.pos.y).toBeCloseTo(MIDDLE, 6);
    }
  });

  it('four seconds of simulation do not leave Bur permanently sunk in the rock', () => {
    let pos: Vec2 = { x: 90, y: 84 };
    let vel: Vec2 = { x: 60, y: 0 };
    let slidOut = false;
    let ticks = 0;
    for (let i = 0; i < 240 && !slidOut; i++) {
      ticks++;
      vel = integrateVelocity(vel, t.FIXED_DT, { state: 'IDLE', env: createNeutralEnv(), dampingMul: 1 }, t);
      const res = moveCircle(pos, vel, R, t.FIXED_DT, bodies, {
        lateralFriction: t.LATERAL_FRICTION,
        timeMs: (i * 1000) / 60,
      });
      pos = res.pos;
      vel = res.vel;
      // While she is under the slabs she never drifts INTO one, and never escapes through one either.
      expect(Math.max(penetration(pos, R, roof), penetration(pos, R, floor))).toBeLessThanOrEqual(FORCED + 1e-6);
      expect(pos.y).toBeCloseTo(MIDDLE, 6);
      slidOut = pos.x > roof.rect.x + roof.rect.w - R;
    }
    // And she is not stuck: the horizontal speed survives (§2.2 charges friction to BOUNCES, and
    // being pinned is not a bounce), so the slit is cleared inside the 4 s and Bur slides free.
    // The only thing that slowed her down is the water itself (DAMPING_X), never a phantom bounce;
    // the old behaviour shaved LATERAL_FRICTION twice per tick and left her at 7.5e-17 px/s.
    expect(slidOut).toBe(true);
    expect(vel.x).toBeCloseTo(60 * Math.exp(-t.DAMPING_X * ticks * t.FIXED_DT), 9);
  });

  it('a FEASIBLE narrow corridor is still separated completely (the fallback must not leak into it)', () => {
    // 12 px of clearance, r = 5: there is room, so the answer must be zero penetration, not "the middle".
    const low = ceiling('low', 0, 92, 180, 20);
    const feasible: readonly SolidEntity[] = [roof, low];
    for (const startY of [81, 84, 86, 88, 91]) {
      const res = moveCircle({ x: 90, y: startY }, { x: 40, y: 0 }, R, t.FIXED_DT, feasible, {
        lateralFriction: t.LATERAL_FRICTION,
        timeMs: 0,
      });
      expect(penetration(res.pos, R, roof)).toBeLessThanOrEqual(0);
      expect(penetration(res.pos, R, low)).toBeLessThanOrEqual(0);
    }
  });
});
