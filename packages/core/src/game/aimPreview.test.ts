/**
 * §2.7: "la trayectoria es exacta hasta el primer rebote". That is a testable statement — the guide
 * must predict the position the release actually produces, step for step — and it only holds while the
 * guide's starting velocity is the impulse of §11.4 and the steps are the same `physicsStep` (§10.3).
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { createBubble, stepBubble } from '../bubble/bubbleStep';
import { createRunState } from '../run/runState';
import { launchVelocity } from '../control/aim';
import { predictTrajectory } from '../control/trajectory';
import { NEUTRAL_ENV } from '../physics/forceFields';
import { aimImpulse, collidableSolids, previewTrajectory, trajectoryDots } from './aimPreview';
import type { Tuning } from '../tuning';
import type { Bubble, Ceiling, SolidEntity } from '../types';

const T: Tuning = createTuning();

/** An aim one step away from release: a `power` pull straight down, from a frozen origin (D2). */
function aiming(power = 0.6): Bubble {
  const bubble = createBubble({ x: 90, y: 100 }, 0, T);
  bubble.state = 'AIMING';
  bubble.aimOrigin = { x: 90, y: 220 };
  bubble.pullDist = power * T.PULL_MAX_PX;
  bubble.pullTheta = 0;
  bubble.aimValid = true;
  bubble.cancelZone = false;
  return bubble;
}

const sticky: Ceiling = {
  type: 'ceiling',
  id: 'snow',
  rect: { x: 60, y: 80, w: 60, h: 10 },
  kind: 'pegajosa',
  capturable: true,
  restitution: T.RESTITUTION_SOFT,
  material: 'snow',
};

describe('aimImpulse (§11.4, D2)', () => {
  it('grows with the pull and is scaled by the force field multipliers', () => {
    const bubble = aiming();
    const plain = aimImpulse(bubble, [], NEUTRAL_ENV, 0, T);
    expect(plain).toBeGreaterThan(T.IMPULSE_MIN);
    expect(plain).toBeLessThan(T.IMPULSE_MAX);
    expect(aimImpulse(aiming(1), [], NEUTRAL_ENV, 0, T)).toBeGreaterThan(plain);

    const cold = aimImpulse(bubble, [], { ...NEUTRAL_ENV, chargeMul: 0.75 }, 0, T);
    expect(cold).toBeCloseTo(plain * 0.75, 9);
    const current = aimImpulse(bubble, [], { ...NEUTRAL_ENV, impulseMul: 0.4 }, 0, T);
    expect(current).toBeCloseTo(plain * 0.4, 9);
  });

  it('applies the sticky ledge penalty of §2.3 and the stun of §2.4.1', () => {
    const bubble = aiming();
    const free = aimImpulse(bubble, [sticky], NEUTRAL_ENV, 0, T);
    bubble.restingOnId = sticky.id;
    expect(aimImpulse(bubble, [sticky], NEUTRAL_ENV, 0, T)).toBeCloseTo(free * T.REST_STICKY_IMPULSE_MUL, 9);

    bubble.restingOnId = null;
    bubble.flags.stunUntil = 500;
    expect(aimImpulse(bubble, [sticky], NEUTRAL_ENV, 0, T)).toBeCloseTo(free * T.STUN_IMPULSE_MUL, 9);
    expect(aimImpulse(bubble, [sticky], NEUTRAL_ENV, 600, T)).toBeCloseTo(free, 9); // the stun expired
  });
});

describe('the guide is exact until the first bounce (§2.7)', () => {
  it('predicts the position the release actually produces, step for step', () => {
    const solids: SolidEntity[] = [];
    const bubble = aiming();
    const run = createRunState(1, 'expedicion');

    // What the player is being shown on the last CHARGING frame.
    const impulse = aimImpulse(bubble, solids, NEUTRAL_ENV, 0, T);
    const predicted = predictTrajectory(
      { start: bubble.pos, vel: launchVelocity(bubble.pullTheta, impulse), radius: bubble.radius, solids, fields: [], timeMs: 0 },
      T,
    );

    // What the release does. The launch happens on the step the pointer goes up, so step i of the
    // simulation lands on predicted[i] — the first entry being Bur's position at the release.
    let nowMs = 0;
    for (let i = 1; i < 40; i++) {
      stepBubble(
        bubble,
        run,
        { pointer: { down: false, x: 0, y: 0 }, solids, env: NEUTRAL_ENV, zone: 0, nowMs, dt: T.FIXED_DT, currentChunkId: 'c' },
        T,
      );
      nowMs += T.FIXED_DT * 1000;
      const point = predicted[i];
      expect(point).toBeDefined();
      expect(bubble.pos.x).toBeCloseTo(point?.x ?? Number.NaN, 9);
      expect(bubble.pos.y).toBeCloseTo(point?.y ?? Number.NaN, 9);
    }
  });
});

describe('previewTrajectory', () => {
  it('draws the number of dots the zone allows and starts at Bur (§2.6 table)', () => {
    const bubble = aiming();
    for (const zone of [0, 2, 5] as const) {
      const dots = previewTrajectory(bubble, [], NEUTRAL_ENV, zone, 0, T);
      expect(dots).toHaveLength(trajectoryDots(zone, T));
      expect(dots[0]).toEqual({ x: bubble.pos.x, y: bubble.pos.y });
    }
    expect(trajectoryDots(0, T)).toBe(6);
    expect(trajectoryDots(5, T)).toBe(2);
  });

  it('draws NOTHING inside the cancel zone: "aquí no hay tiro" (D2)', () => {
    const bubble = aiming(0.05);
    bubble.cancelZone = true;
    expect(previewTrajectory(bubble, [], NEUTRAL_ENV, 0, 0, T)).toEqual([]);
    // The very same pull, out of the cancel radius, is drawn as usual.
    bubble.cancelZone = false;
    expect(previewTrajectory(bubble, [], NEUTRAL_ENV, 0, 0, T)).toHaveLength(trajectoryDots(0, T));
  });

  it('stops at the first solid it meets', () => {
    const bubble = aiming();
    const floor: Ceiling = { ...sticky, id: 'floor', rect: { x: 0, y: 160, w: 180, h: 10 } };
    const dots = previewTrajectory(bubble, [floor], NEUTRAL_ENV, 0, 0, T);
    const last = dots[dots.length - 1];
    expect(last?.y).toBeLessThanOrEqual(floor.rect.y);
  });
});

describe('collidableSolids (§2.7, §2.2 trampoline cooldown, §11.3)', () => {
  const medusa: Ceiling = { ...sticky, id: 'medusa', kind: 'posadero', capturable: false };

  it('drops exactly the bodies the physics is passing through, and keeps the array otherwise', () => {
    const bubble = aiming();
    const solids: SolidEntity[] = [sticky, medusa];

    // Nothing to pass through: the very same array comes back, so a charging step allocates nothing.
    expect(collidableSolids(bubble, solids, 0)).toBe(solids);

    bubble.passThrough = [{ id: 'medusa', until: 600 }];
    expect(collidableSolids(bubble, solids, 0).map((s) => s.id)).toEqual(['snow']);

    // The expiry test is `bubbleStep`'s (`until > nowMs`), so the two agree on the world right now.
    expect(collidableSolids(bubble, solids, 600)).toBe(solids);
  });

  it('makes the guide agree with the step about a body it is passing through', () => {
    // A ceiling straight below the shot: with it live the arc stops on its face, and with it on the
    // pass-through list the arc must go through, because that is what `stepBubble` is about to do.
    const floor: Ceiling = { ...sticky, id: 'medusa', rect: { x: 30, y: 200, w: 120, h: 10 } };
    const bubble = aiming(1);

    const bouncing = previewTrajectory(bubble, [floor], NEUTRAL_ENV, 0, 0, T);
    bubble.passThrough = [{ id: 'medusa', until: 600 }];
    const through = previewTrajectory(bubble, [floor], NEUTRAL_ENV, 0, 0, T);

    const below = floor.rect.y + floor.rect.h + bubble.radius;
    expect(bouncing[bouncing.length - 1]?.y ?? 0).toBeLessThan(below);
    expect(through[through.length - 1]?.y ?? 0).toBeGreaterThan(below);
  });
});

// ---------------------------------------------------------------------------------------------
// §2.7 — the dot count is a RAMP, not a shorter way of giving the same answer
// ---------------------------------------------------------------------------------------------

describe('the TRAJECTORY_DOTS ramp (§2.6, §2.7)', () => {
  /**
   * §2.6/§2.7 sell the 6 → 2 table as "cómo sube la dificultad sin tocar la física", and that only
   * means anything if fewer dots is less INFORMATION. Sampling `n` points evenly across the whole
   * polyline always keeps its last point, which is the landing spot — so two dots would answer the
   * question exactly as well as six and the scaffold would never be retired. The dots are therefore
   * spaced at the richest zone's spacing and a deeper zone sees a PREFIX of the arc.
   */
  const arcFor = (zone: 0 | 5): ReturnType<typeof previewTrajectory> =>
    previewTrajectory(aiming(1), [], NEUTRAL_ENV, zone, 0, T);

  it('shows the whole arc, landing point included, in the shallowest zone', () => {
    const dots = arcFor(0);
    expect(dots).toHaveLength(trajectoryDots(0, T));
    const full = predictTrajectory(
      { start: { x: 90, y: 100 }, vel: launchVelocity(0, aimImpulse(aiming(1), [], NEUTRAL_ENV, 0, T)), radius: aiming(1).radius, solids: [], fields: [], timeMs: 0 },
      T,
    );
    const end = full[full.length - 1];
    const lastDot = dots[dots.length - 1];
    expect(end).toBeDefined();
    expect(lastDot).toBeDefined();
    expect(Math.hypot((lastDot?.x ?? 0) - (end?.x ?? 0), (lastDot?.y ?? 0) - (end?.y ?? 0))).toBeLessThan(2);
  });

  it('stops short of the landing point where the table thins the guide out', () => {
    const shallow = arcFor(0);
    const deep = arcFor(5);
    expect(deep.length).toBeLessThan(shallow.length);
    const deepEnd = deep[deep.length - 1];
    const shallowEnd = shallow[shallow.length - 1];
    expect(deepEnd).toBeDefined();
    expect(shallowEnd).toBeDefined();
    // Same shot, same first dots: the deep guide is the shallow one cut short, not a rescaled copy.
    expect(deep[0]).toEqual(shallow[0]);
    expect(deep[1]).toEqual(shallow[1]);
    expect((deepEnd?.y ?? 0)).toBeLessThan((shallowEnd?.y ?? 0) - 20);
  });
});
