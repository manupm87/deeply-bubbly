import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { ForceField, SolidEntity } from '../types';

export interface TrajectoryInput {
  start: Vec2;
  vel: Vec2;
  radius: number;
  solids: readonly SolidEntity[];
  /** Force fields are NOT drawn (§2.7): pass [] for the player's guide; the validator may pass real fields. */
  fields: readonly ForceField[];
  timeMs: number;
  /** Max simulated seconds (default 2.5). */
  maxSeconds?: number;
}

/**
 * Simulates the launch with the SAME integrator and collision code the player uses (§2.7, §10.3), sampling
 * one point per fixed step, stopping at the first contact (inclusive) or when maxSeconds elapse.
 * Returns the raw dense polyline in world coordinates.
 */
export function predictTrajectory(input: TrajectoryInput, t: Tuning): Vec2[] {
  void input; void t;
  throw new Error('not implemented');
}

/** Picks `n` evenly spaced points (by index) from a dense polyline, always including the first point. */
export function sampleDots(points: readonly Vec2[], n: number): Vec2[] {
  void points; void n;
  throw new Error('not implemented');
}
