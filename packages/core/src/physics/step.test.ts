import { describe, expect, it } from 'vitest';
import { launchLockSteps, physicsStep } from './step';
import { NEUTRAL_ENV } from './forceFields';
import { createTuning } from '../tuning';
import type { Vec2 } from '../math/vec';
import type { Ceiling, Contact, ForceField, SolidEntity } from '../types';

const t = createTuning();

function ceiling(over: Partial<Ceiling> = {}): Ceiling {
  return {
    type: 'ceiling',
    id: 'c1',
    rect: { x: 0, y: 200, w: 180, h: 20 },
    kind: 'posadero',
    capturable: true,
    restitution: t.RESTITUTION_ROCK,
    material: 'rock',
    ...over,
  };
}

const current: ForceField = {
  type: 'forcefield',
  id: 'corriente',
  rect: { x: 0, y: 0, w: 180, h: 400 },
  fieldType: 'corriente',
  vector: { x: 240, y: 0 },
  buoyancyMul: 1,
  impulseMul: 0.4,
  chargeMul: 1,
  opensAscenso: true,
};

const START: Vec2 = { x: 90, y: 100 };
const base = { lateralFriction: t.LATERAL_FRICTION, dt: t.FIXED_DT, timeMs: 0 };

describe('launchLockSteps (§11.3, §11.6)', () => {
  it('is exactly 15 whole steps: LAUNCH_LOCK_MS 250 ms at FIXED_DT 1/60 s', () => {
    expect(launchLockSteps(t)).toBe(15);
    // The naive accumulator lands below 250 after 15 additions, which is the whole point of this helper.
    let acc = 0;
    for (let i = 0; i < 15; i++) acc += t.FIXED_DT * 1000;
    expect(acc).toBeLessThan(t.LAUNCH_LOCK_MS);
    expect(launchLockSteps(t) * t.FIXED_DT * 1000).toBeCloseTo(t.LAUNCH_LOCK_MS, 9);
  });

  it('counts the steps that START inside the window for other tunings', () => {
    expect(launchLockSteps({ LAUNCH_LOCK_MS: 250, FIXED_DT: 1 / 120 })).toBe(30);
    expect(launchLockSteps({ LAUNCH_LOCK_MS: 100, FIXED_DT: 1 / 60 })).toBe(6); // 100 / 16.67 = 6.0 -> 6
    expect(launchLockSteps({ LAUNCH_LOCK_MS: 260, FIXED_DT: 1 / 60 })).toBe(16); // 15.6 -> the 16th starts inside
  });

  it('degenerates to zero instead of throwing', () => {
    expect(launchLockSteps({ LAUNCH_LOCK_MS: 0, FIXED_DT: 1 / 60 })).toBe(0);
    expect(launchLockSteps({ LAUNCH_LOCK_MS: 250, FIXED_DT: 0 })).toBe(0);
  });
});

describe('physicsStep (§11.4, §10.3 "no hay dos físicas")', () => {
  it('applies the §11.4 formulas and then the displacement, in that order', () => {
    const res = physicsStep({ pos: START, vel: { x: 100, y: 200 }, radius: 7, state: 'IDLE' }, { solids: [], fields: [] }, base, t);
    const vx = 100 * Math.exp(-t.DAMPING_X * t.FIXED_DT);
    const vy = (200 - t.BUOYANCY * t.FIXED_DT) * Math.exp(-t.DAMPING_Y * t.FIXED_DT);
    expect(res.vel.x).toBeCloseTo(vx, 9);
    expect(res.vel.y).toBeCloseTo(vy, 9);
    // The move uses the NEW velocity (semi-implicit), never the old one.
    expect(res.pos.x).toBeCloseTo(START.x + vx * t.FIXED_DT, 9);
    expect(res.pos.y).toBeCloseTo(START.y + vy * t.FIXED_DT, 9);
  });

  it('reuses the shared frozen environment when there are no fields (§11.5.10 allocation budget)', () => {
    const res = physicsStep({ pos: START, vel: { x: 0, y: 0 }, radius: 7, state: 'IDLE' }, { solids: [], fields: [] }, base, t);
    expect(res.env).toBe(NEUTRAL_ENV);
  });

  it('samples the fields at the PRE-move position and reports their multipliers', () => {
    const res = physicsStep(
      { pos: START, vel: { x: 0, y: 0 }, radius: 7, state: 'IDLE' },
      { solids: [], fields: [current] },
      base,
      t,
    );
    expect(res.env).not.toBe(NEUTRAL_ENV);
    expect(res.env.fieldIds).toEqual(['corriente']);
    expect(res.env.impulseMul).toBe(0.4);
    expect(res.env.opensAscenso).toBe(true);
    // force is applied AFTER damping: vel.x = 0 * exp(...) + 240 * dt.
    expect(res.vel.x).toBeCloseTo(240 * t.FIXED_DT, 9);
  });

  it('does not integrate while RESTING or DEAD (§11.3)', () => {
    for (const state of ['RESTING', 'DEAD'] as const) {
      const res = physicsStep({ pos: START, vel: { x: 0, y: 0 }, radius: 7, state }, { solids: [], fields: [] }, base, t);
      expect(res.vel).toEqual({ x: 0, y: 0 });
      expect(res.pos).toEqual(START);
    }
  });

  it('anchors the charge: buoyancy at CHARGING_BUOYANCY_MUL (§2.1)', () => {
    const idle = physicsStep({ pos: START, vel: { x: 0, y: 0 }, radius: 7, state: 'IDLE' }, { solids: [], fields: [] }, base, t);
    const charging = physicsStep(
      { pos: START, vel: { x: 0, y: 0 }, radius: 7, state: 'CHARGING' },
      { solids: [], fields: [] },
      base,
      t,
    );
    expect(charging.vel.y / idle.vel.y).toBeCloseTo(t.CHARGING_BUOYANCY_MUL, 9);
  });

  it('resolves collisions and reports contacts', () => {
    const solids: readonly SolidEntity[] = [ceiling()];
    const res = physicsStep(
      { pos: { x: 90, y: 188 }, vel: { x: 0, y: 500 }, radius: 7, state: 'LAUNCHED' },
      { solids, fields: [] },
      base,
      t,
    );
    expect(res.contacts).toHaveLength(1);
    expect(res.contacts[0]?.face).toBe('top');
    expect(res.vel.y).toBeLessThan(0);
  });

  it('passes the capture hook through to moveCircle (§2.3)', () => {
    const solids: readonly SolidEntity[] = [ceiling({ rect: { x: 0, y: 40, w: 180, h: 20 } })];
    const seen: Contact[] = [];
    const res = physicsStep(
      { pos: { x: 90, y: 69 }, vel: { x: 30, y: -200 }, radius: 7, state: 'IDLE' },
      { solids, fields: [] },
      { ...base, stopAtContact: (c) => (seen.push(c), c.face === 'bottom') },
      t,
    );
    expect(seen).toHaveLength(1);
    expect(res.contacts).toHaveLength(1);
    // Velocity is untouched: the caller decides whether this becomes RESTING or a bounce.
    expect(res.vel.y).toBeLessThan(0);
    expect(res.pos.y).toBeCloseTo(60 + 7, 2);
  });

  it('never mutates the body it is given', () => {
    const body = { pos: { x: 90, y: 100 }, vel: { x: 10, y: 20 }, radius: 7, state: 'IDLE' as const };
    physicsStep(body, { solids: [ceiling()], fields: [current] }, base, t);
    expect(body.pos).toEqual({ x: 90, y: 100 });
    expect(body.vel).toEqual({ x: 10, y: 20 });
  });

  it('is deterministic', () => {
    const call = (): unknown =>
      physicsStep(
        { pos: START, vel: { x: 37, y: 411 }, radius: 6.4, state: 'LAUNCHED' },
        { solids: [ceiling()], fields: [current] },
        { ...base, timeMs: 1234, dampingMul: 0.5 },
        t,
      );
    expect(call()).toEqual(call());
  });
});
