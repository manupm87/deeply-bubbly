/**
 * ADVERSARIAL review of the Corriente de Arrecife as a verb (GDD §3.2 "leer y usar las corrientes", §5
 * nº 8, BACKLOG C7, DECISIONS-v1.2 D6). A band used to move Bur about 25 px a shot: visible, and safely
 * ignored. A verb is something the player cannot ignore, so everything here is flown with the real
 * integrator and asks what the band changes.
 */
import { describe, expect, it } from 'vitest';
import { zoneRadius } from '../../../control/charge';
import { launchVelocity } from '../../../control/aim';
import { impulseMagnitude } from '../../../control/charge';
import { physicsStep } from '../../../physics/step';
import { createTuning } from '../../../tuning';
import { instantiateChunk } from '../../campaign';
import { findLandingLines, sideWalls } from '../../validator';
import { CURRENT_DRIFT, currentBand } from '../builders';
import { Z2, Z2_CHUNKS, Z2_TUTORIAL } from './index';
import type { Vec2 } from '../../../math/vec';
import type { Anchor, Chunk, ForceField, SolidEntity } from '../../../types';

const t = createTuning();
const radius = zoneRadius(Z2, t);

/** How far sideways a band moves a shot that spends its whole flight inside it. */
function driftOverFlight(fields: ForceField[], seconds: number): number {
  let pos: Vec2 = { x: 270, y: 100 };
  let vel: Vec2 = launchVelocity(0, impulseMagnitude({ power: 0.6, radius, stunned: false, externalMul: 1 }, t));
  const steps = Math.round(seconds / t.FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const stepped = physicsStep(
      { pos, vel, radius, state: 'IDLE' },
      { solids: [], fields },
      { dt: t.FIXED_DT, timeMs: i * t.FIXED_DT * 1000, lateralFriction: t.LATERAL_FRICTION, dampingMul: 1 },
      t,
    );
    pos = stepped.pos;
    vel = stepped.vel;
  }
  return pos.x - 270;
}

function geometryOf(chunk: Chunk): { solids: SolidEntity[]; fields: ForceField[]; anchors: Anchor[] } {
  const entities = instantiateChunk({ chunk, index: 0, worldY: 0, immersionIndex: 0 });
  return {
    solids: [
      ...entities.filter((e): e is SolidEntity => e.type === 'ceiling' || e.type === 'wall'),
      ...sideWalls(-t.CHUNK_H, t.CHUNK_H * 2, t),
    ],
    fields: entities.filter((e): e is ForceField => e.type === 'forcefield'),
    anchors: entities.filter((e): e is Anchor => e.type === 'anchor').sort((a, b) => a.pos.y - b.pos.y),
  };
}

const key = (l: { power: number; thetaDeg: number }): string => `${l.power}/${l.thetaDeg}`;

describe('ADVERSARIAL — the current is a verb, not weather (§5 nº 8, BACKLOG C7)', () => {
  it('carries a whole flight about as far as a hop travels', () => {
    const everywhere = [currentBand('b', -2000, -2000, 5000, 5000, 1)];
    expect(driftOverFlight([], 2)).toBeCloseTo(0, 6);
    const moved = driftOverFlight(everywhere, 2);
    expect(moved).toBeGreaterThanOrEqual(100);
    expect(moved).toBeLessThanOrEqual(120);
  });

  it('is symmetric: a band the other way moves the same flight the other way', () => {
    const right = driftOverFlight([currentBand('r', -2000, -2000, 5000, 5000, 1)], 2);
    const left = driftOverFlight([currentBand('l', -2000, -2000, 5000, 5000, -1)], 2);
    expect(left).toBeCloseTo(-right, 6);
  });

  it('never turns a flight into a river: one hop stays short of the terminal drift', () => {
    const moved = driftOverFlight([currentBand('b', -2000, -2000, 5000, 5000, 1)], 2);
    expect(moved / 2).toBeLessThan(CURRENT_DRIFT / 2);
  });

  it('makes a shot aimed as if the water were still miss, in every chunk with a band', () => {
    // The sentence that makes it a verb. On each banded chunk, take the shots that would land in still
    // water and fly them through the real band: on at least one hop, most of them must no longer land.
    const banded = Z2_CHUNKS.filter((c) => c.entities.some((e) => e.type === 'forcefield'));
    expect(banded.length).toBeGreaterThanOrEqual(8);
    for (const chunk of banded) {
      const geo = geometryOf(chunk);
      let bites = false;
      for (let i = 0; i < geo.anchors.length - 1; i++) {
        const a = geo.anchors[i]!;
        const b = geo.anchors[i + 1]!;
        const still = findLandingLines(a.pos, b.pos, Z2, geo.solids, t, b.ceilingId, []);
        const live = new Set(findLandingLines(a.pos, b.pos, Z2, geo.solids, t, b.ceilingId, geo.fields).map(key));
        const surviving = still.filter((l) => live.has(key(l))).length;
        if (still.length > 0 && surviving / still.length < 0.5) bites = true;
      }
      expect(bites, `${chunk.id}: the band changes nothing about the aim`).toBe(true);
    }
  });

  it('is never a wall: every hop of a banded chunk still has a shot with the band running', () => {
    for (const chunk of Z2_CHUNKS.filter((c) => c.entities.some((e) => e.type === 'forcefield'))) {
      const geo = geometryOf(chunk);
      for (let i = 0; i < geo.anchors.length - 1; i++) {
        const a = geo.anchors[i]!;
        const b = geo.anchors[i + 1]!;
        const live = findLandingLines(a.pos, b.pos, Z2, geo.solids, t, b.ceilingId, geo.fields);
        expect(live.length, `${chunk.id}: ${a.id} -> ${b.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('lets the tutorial require it: its rest point does not exist in still water', () => {
    const geo = geometryOf(Z2_TUTORIAL);
    const from = geo.anchors[0]!;
    const to = geo.anchors[1]!;
    expect(findLandingLines(from.pos, to.pos, Z2, geo.solids, t, to.ceilingId, [])).toEqual([]);
    expect(findLandingLines(from.pos, to.pos, Z2, geo.solids, t, to.ceilingId, geo.fields).length).toBeGreaterThan(0);
    // ...and the lesson still fits on screen: the requirement is not bought with a longer hop.
    expect(Math.abs(from.pos.x - to.pos.x)).toBeLessThanOrEqual(t.MAX_HOP_X_PX[Z2]!);
  });

  it('still never pushes anything but sideways (§11.7.9)', () => {
    for (const chunk of Z2_CHUNKS) {
      for (const e of chunk.entities) {
        if (e.type !== 'forcefield') continue;
        expect(e.vector.y, e.id).toBe(0);
      }
    }
  });
});
