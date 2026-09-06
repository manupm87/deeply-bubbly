/**
 * The one narrowing of `WorldEntity` in the game layer (§11.2, §11.5.10).
 */
import { describe, expect, it } from 'vitest';
import { createBuckets, fillBuckets } from './entities';
import type { WorldEntity } from '../types';

const ENTITIES: WorldEntity[] = [
  { type: 'ceiling', id: 'c', rect: { x: 0, y: 0, w: 40, h: 10 }, kind: 'posadero', capturable: true, restitution: 0.55, material: 'rock' },
  { type: 'wall', id: 'w', rect: { x: 0, y: 0, w: 10, h: 200 }, restitution: 0.55, material: 'rock' },
  { type: 'anchor', id: 'a', ceilingId: 'c', pos: { x: 20, y: 17 }, lane: 'C' },
  { type: 'hazard', id: 'h', catalogId: 6, shape: { x: 0, y: 0, w: 8, h: 8 }, airCost: 1, pushDir: 'lateral' },
  { type: 'forcefield', id: 'f', rect: { x: 0, y: 0, w: 20, h: 20 }, fieldType: 'corriente', vector: { x: 90, y: 0 }, buoyancyMul: 1, impulseMul: 1, chargeMul: 1, opensAscenso: false },
  { type: 'pickup', id: 'p', pos: { x: 5, y: 5 }, pickupType: 'aire', value: 1, radius: 6 },
  { type: 'boya', id: 'boya:0', worldY: 720, immersionIndex: 0 },
  { type: 'station', id: 'station:0', worldY: 1200, zoneFrom: 0, zoneTo: 0, isDelivery: false, immersionIndex: 0 },
];

describe('fillBuckets', () => {
  it('sorts every entity kind into its bucket and drops anchors', () => {
    const buckets = fillBuckets(createBuckets(), ENTITIES);
    expect(buckets.solids.map((e) => e.id)).toEqual(['c', 'w']);
    expect(buckets.fields.map((e) => e.id)).toEqual(['f']);
    expect(buckets.hazards.map((e) => e.id)).toEqual(['h']);
    expect(buckets.pickups.map((e) => e.id)).toEqual(['p']);
    expect(buckets.boyas.map((e) => e.id)).toEqual(['boya:0']);
    expect(buckets.stations.map((e) => e.id)).toEqual(['station:0']);
  });

  it('is reusable: the previous step never leaks into the next one', () => {
    const buckets = fillBuckets(createBuckets(), ENTITIES);
    fillBuckets(buckets, []);
    expect(buckets.solids).toHaveLength(0);
    expect(buckets.fields).toHaveLength(0);
    expect(buckets.hazards).toHaveLength(0);
    expect(buckets.pickups).toHaveLength(0);
    expect(buckets.boyas).toHaveLength(0);
    expect(buckets.stations).toHaveLength(0);
  });
});
