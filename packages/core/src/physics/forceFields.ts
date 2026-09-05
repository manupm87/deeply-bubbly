/**
 * Force-field sampling (GDD §11.4). Fields are sensors: while Bur's circle overlaps their rect they
 * contribute an acceleration and a set of multipliers. Pure and allocation-light.
 */
import { circleRectOverlap } from '../math/vec';
import type { Vec2 } from '../math/vec';
import type { ForceField } from '../types';

/**
 * Read-only view of a sampled environment. Consumers that only READ the environment (the integrator,
 * the trajectory guide) take this, so the shared frozen `NEUTRAL_ENV` can be handed to them without
 * allocating a copy per step (§11.5.10: the guide is rebuilt every frame while CHARGING).
 */
export interface ReadonlyPhysicsEnv {
  /** Sum of field vectors (px/s²). Applied as vel += vector * dt AFTER buoyancy/damping. */
  readonly force: Readonly<Vec2>;
  /** Product of buoyancyMul of overlapping fields (1 when none). */
  readonly buoyancyMul: number;
  /** Product of impulseMul (salmuera: 0.4). */
  readonly impulseMul: number;
  /** Product of chargeMul (medusa fría: 0.75). */
  readonly chargeMul: number;
  /** True when any overlapping field has opensAscenso. */
  readonly opensAscenso: boolean;
  /** Ids of overlapping fields (for events / telemetry). */
  readonly fieldIds: readonly string[];
}

/** Aggregated environment sampled from all force fields overlapping Bur this tick (§11.4). */
export interface PhysicsEnv extends ReadonlyPhysicsEnv {
  force: Vec2;
  buoyancyMul: number;
  impulseMul: number;
  chargeMul: number;
  opensAscenso: boolean;
  fieldIds: string[];
}

/**
 * The shared "no fields overlap" environment. DEEPLY frozen: `Readonly<T>` and a single
 * `Object.freeze` are both shallow, and `NEUTRAL_ENV.force.x = 1` on a module-global would corrupt
 * every later reader of a package whose whole premise is determinism (§11.6, ARCHITECTURE "regla de
 * oro"). It is safe to hand out to readers; anything that needs to WRITE calls `createNeutralEnv()`.
 */
export const NEUTRAL_ENV: ReadonlyPhysicsEnv = Object.freeze({
  force: Object.freeze({ x: 0, y: 0 }),
  buoyancyMul: 1,
  impulseMul: 1,
  chargeMul: 1,
  opensAscenso: false,
  fieldIds: Object.freeze([]) as readonly string[],
});

/** A fresh, mutable neutral environment. */
export function createNeutralEnv(): PhysicsEnv {
  return { force: { x: 0, y: 0 }, buoyancyMul: 1, impulseMul: 1, chargeMul: 1, opensAscenso: false, fieldIds: [] };
}

/**
 * Sample every field whose rect overlaps the circle (pos, radius). Pure.
 * With no fields there is nothing to sample: callers that only read the result should use
 * `NEUTRAL_ENV` instead of paying for the allocation (see `physicsStep`).
 */
export function sampleForceFields(pos: Vec2, radius: number, fields: readonly ForceField[]): PhysicsEnv {
  const env = createNeutralEnv();
  for (const field of fields) {
    if (!circleRectOverlap(pos, radius, field.rect)) continue;
    env.force.x += field.vector.x;
    env.force.y += field.vector.y;
    env.buoyancyMul *= field.buoyancyMul;
    env.impulseMul *= field.impulseMul;
    env.chargeMul *= field.chargeMul;
    if (field.opensAscenso) env.opensAscenso = true;
    env.fieldIds.push(field.id);
  }
  return env;
}
