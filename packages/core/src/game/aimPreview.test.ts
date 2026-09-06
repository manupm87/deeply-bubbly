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
import { collidableSolids, holdImpulse, previewTrajectory, trajectoryDots } from './aimPreview';
import type { Tuning } from '../tuning';
import type { Bubble, Ceiling, SolidEntity } from '../types';

const T: Tuning = createTuning();

/** A hold that is one step away from being released: 400 ms of charge, aimed straight down. */
function charging(): Bubble {
  const bubble = createBubble({ x: 90, y: 100 }, 0, T);
  bubble.state = 'CHARGING';
  bubble.aimOrigin = { x: 90, y: 100 };
  bubble.chargeMs = 400;
  bubble.aimTheta = 0;
  bubble.dragDist = T.DRAG_NEUTRAL_PX;
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

describe('holdImpulse (§11.4)', () => {
  it('grows with the charge and is scaled by the force field multipliers', () => {
    const bubble = charging();
    const plain = holdImpulse(bubble, [], NEUTRAL_ENV, 0, T);
    expect(plain).toBeGreaterThan(T.IMPULSE_MIN);
    expect(plain).toBeLessThan(T.IMPULSE_MAX * (1 + T.DRAG_FINE_TUNE));

    const cold = holdImpulse(bubble, [], { ...NEUTRAL_ENV, chargeMul: 0.75 }, 0, T);
    expect(cold).toBeCloseTo(plain * 0.75, 9);
    const current = holdImpulse(bubble, [], { ...NEUTRAL_ENV, impulseMul: 0.4 }, 0, T);
    expect(current).toBeCloseTo(plain * 0.4, 9);
  });

  it('applies the sticky ledge penalty of §2.3 and the stun of §2.4.1', () => {
    const bubble = charging();
    const free = holdImpulse(bubble, [sticky], NEUTRAL_ENV, 0, T);
    bubble.restingOnId = sticky.id;
    expect(holdImpulse(bubble, [sticky], NEUTRAL_ENV, 0, T)).toBeCloseTo(free * T.REST_STICKY_IMPULSE_MUL, 9);

    bubble.restingOnId = null;
    bubble.flags.stunUntil = 500;
    expect(holdImpulse(bubble, [sticky], NEUTRAL_ENV, 0, T)).toBeCloseTo(free * T.STUN_IMPULSE_MUL, 9);
    expect(holdImpulse(bubble, [sticky], NEUTRAL_ENV, 600, T)).toBeCloseTo(free, 9); // the stun expired
  });
});

describe('the guide is exact until the first bounce (§2.7)', () => {
  it('predicts the position the release actually produces, step for step', () => {
    const solids: SolidEntity[] = [];
    const bubble = charging();
    const run = createRunState(1, 'expedicion');

    // What the player is being shown on the last CHARGING frame.
    const impulse = holdImpulse(bubble, solids, NEUTRAL_ENV, 0, T);
    const predicted = predictTrajectory(
      { start: bubble.pos, vel: launchVelocity(bubble.aimTheta, impulse), radius: bubble.radius, solids, fields: [], timeMs: 0 },
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
    const bubble = charging();
    for (const zone of [0, 2, 5] as const) {
      const dots = previewTrajectory(bubble, [], NEUTRAL_ENV, zone, 0, T);
      expect(dots).toHaveLength(trajectoryDots(zone, T));
      expect(dots[0]).toEqual({ x: bubble.pos.x, y: bubble.pos.y });
    }
    expect(trajectoryDots(0, T)).toBe(6);
    expect(trajectoryDots(5, T)).toBe(2);
  });

  it('stops at the first solid it meets', () => {
    const bubble = charging();
    const floor: Ceiling = { ...sticky, id: 'floor', rect: { x: 0, y: 160, w: 180, h: 10 } };
    const dots = previewTrajectory(bubble, [floor], NEUTRAL_ENV, 0, 0, T);
    const last = dots[dots.length - 1];
    expect(last?.y).toBeLessThanOrEqual(floor.rect.y);
  });
});

describe('collidableSolids (§2.7, §2.2 trampoline cooldown, §11.3)', () => {
  const medusa: Ceiling = { ...sticky, id: 'medusa', kind: 'posadero', capturable: false };

  it('drops exactly the bodies the physics is passing through, and keeps the array otherwise', () => {
    const bubble = charging();
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
    const bubble = charging();
    bubble.chargeMs = T.CHARGE_FULL_MS;

    const bouncing = previewTrajectory(bubble, [floor], NEUTRAL_ENV, 0, 0, T);
    bubble.passThrough = [{ id: 'medusa', until: 600 }];
    const through = previewTrajectory(bubble, [floor], NEUTRAL_ENV, 0, 0, T);

    const below = floor.rect.y + floor.rect.h + bubble.radius;
    expect(bouncing[bouncing.length - 1]?.y ?? 0).toBeLessThan(below);
    expect(through[through.length - 1]?.y ?? 0).toBeGreaterThan(below);
  });
});
