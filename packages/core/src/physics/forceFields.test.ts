import { describe, expect, it } from 'vitest';
import { NEUTRAL_ENV, createNeutralEnv, sampleForceFields } from './forceFields';
import type { ForceField } from '../types';

function field(id: string, over: Partial<ForceField> = {}): ForceField {
  return {
    type: 'forcefield',
    id,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    fieldType: 'corriente',
    vector: { x: 0, y: 0 },
    buoyancyMul: 1,
    impulseMul: 1,
    chargeMul: 1,
    opensAscenso: false,
    ...over,
  };
}

describe('sampleForceFields (§11.4)', () => {
  it('returns a neutral environment when nothing overlaps', () => {
    const env = sampleForceFields({ x: 500, y: 500 }, 5, [field('a')]);
    expect(env).toEqual(createNeutralEnv());
  });

  it('returns a neutral environment for an empty field list', () => {
    expect(sampleForceFields({ x: 0, y: 0 }, 5, [])).toEqual(createNeutralEnv());
  });

  it('adds the vector and reports the field id while overlapping', () => {
    const f = field('corriente', { vector: { x: 40, y: -12 }, buoyancyMul: 1.5 });
    const env = sampleForceFields({ x: 50, y: 50 }, 5, [f]);
    expect(env.force).toEqual({ x: 40, y: -12 });
    expect(env.buoyancyMul).toBe(1.5);
    expect(env.fieldIds).toEqual(['corriente']);
  });

  it('sums vectors and multiplies multipliers across overlapping fields', () => {
    const a = field('a', { vector: { x: 10, y: 5 }, buoyancyMul: 2, impulseMul: 0.4, chargeMul: 0.75 });
    const b = field('b', { vector: { x: -4, y: 20 }, buoyancyMul: 0.5, impulseMul: 0.5, chargeMul: 0.5 });
    const env = sampleForceFields({ x: 50, y: 50 }, 5, [a, b]);
    expect(env.force).toEqual({ x: 6, y: 25 });
    expect(env.buoyancyMul).toBe(1);
    expect(env.impulseMul).toBeCloseTo(0.2, 12);
    expect(env.chargeMul).toBeCloseTo(0.375, 12);
    expect(env.fieldIds).toEqual(['a', 'b']);
  });

  it('opensAscenso is true when ANY overlapping field opens it', () => {
    const a = field('a');
    const b = field('b', { opensAscenso: true });
    expect(sampleForceFields({ x: 50, y: 50 }, 5, [a, b]).opensAscenso).toBe(true);
    expect(sampleForceFields({ x: 50, y: 50 }, 5, [a]).opensAscenso).toBe(false);
  });

  it('uses the circle, not the centre: a field is sampled while the radius touches it', () => {
    const f = field('edge', { rect: { x: 100, y: 0, w: 20, h: 20 }, vector: { x: 1, y: 0 } });
    // Centre 4 px to the left of the rect, radius 5 -> overlapping.
    expect(sampleForceFields({ x: 96, y: 10 }, 5, [f]).fieldIds).toEqual(['edge']);
    // Centre 6 px to the left, radius 5 -> not overlapping.
    expect(sampleForceFields({ x: 94, y: 10 }, 5, [f]).fieldIds).toEqual([]);
  });

  it('never returns or mutates the shared NEUTRAL_ENV', () => {
    const f = field('a', { vector: { x: 3, y: 3 } });
    const env = sampleForceFields({ x: 50, y: 50 }, 5, [f]);
    expect(env).not.toBe(NEUTRAL_ENV);
    expect(env.force).not.toBe(NEUTRAL_ENV.force);
    expect(NEUTRAL_ENV.force).toEqual({ x: 0, y: 0 });
    expect(NEUTRAL_ENV.fieldIds).toEqual([]);
    // Two consecutive samples are independent objects.
    const other = sampleForceFields({ x: 50, y: 50 }, 5, [f]);
    expect(other.force).toEqual({ x: 3, y: 3 });
  });
});
