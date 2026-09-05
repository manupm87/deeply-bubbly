import type { Vec2 } from '../math/vec';
import type { ForceField } from '../types';

/** Aggregated environment sampled from all force fields overlapping Bur this tick (§11.4). */
export interface PhysicsEnv {
  /** Sum of field vectors (px/s²). Applied as vel += vector * dt AFTER buoyancy/damping. */
  force: Vec2;
  /** Product of buoyancyMul of overlapping fields (1 when none). */
  buoyancyMul: number;
  /** Product of impulseMul (salmuera: 0.4). */
  impulseMul: number;
  /** Product of chargeMul (medusa fría: 0.75). */
  chargeMul: number;
  /** True when any overlapping field has opensAscenso. */
  opensAscenso: boolean;
  /** Ids of overlapping fields (for events / telemetry). */
  fieldIds: string[];
}

export const NEUTRAL_ENV: Readonly<PhysicsEnv> = Object.freeze({
  force: { x: 0, y: 0 },
  buoyancyMul: 1,
  impulseMul: 1,
  chargeMul: 1,
  opensAscenso: false,
  fieldIds: [],
});

/** Sample every field whose rect overlaps the circle (pos, radius). Pure. */
export function sampleForceFields(pos: Vec2, radius: number, fields: readonly ForceField[]): PhysicsEnv {
  void pos; void radius; void fields;
  throw new Error('not implemented');
}
