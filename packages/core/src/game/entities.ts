/**
 * One pass over the streamer's output, split into the buckets the fixed step consumes (GDD §11.5.10).
 *
 * The streamer hands back a flat `WorldEntity[]` whose composition changes only when the window moves,
 * but every phase of the step (physics, hazards, pickups, checkpoints) wants a different slice of it.
 * Filtering four times per step, sixty times a second, on a phone, is the kind of waste §11.5.10 is
 * about; more importantly, the discriminated union is narrowed HERE and nowhere else, so no phase has
 * to restate "what counts as a solid".
 */
import type { Boya, ForceField, Hazard, Pickup, RestStation, SolidEntity, WorldEntity } from '../types';

export interface WorldBuckets {
  solids: SolidEntity[];
  fields: ForceField[];
  hazards: Hazard[];
  pickups: Pickup[];
  boyas: Boya[];
  stations: RestStation[];
}

/** Empty buckets, reused across steps by `fillBuckets` so a step allocates nothing. */
export function createBuckets(): WorldBuckets {
  return { solids: [], fields: [], hazards: [], pickups: [], boyas: [], stations: [] };
}

/**
 * Sorts `entities` into `out` (cleared first). `Anchor`s are dropped: they are authoring data for the
 * reach rule (§11.5.11) and the respawn chain (§2.4.2), never a body the step has to look at.
 */
export function fillBuckets(out: WorldBuckets, entities: readonly WorldEntity[]): WorldBuckets {
  out.solids.length = 0;
  out.fields.length = 0;
  out.hazards.length = 0;
  out.pickups.length = 0;
  out.boyas.length = 0;
  out.stations.length = 0;

  for (const e of entities) {
    switch (e.type) {
      case 'ceiling':
      case 'wall':
        out.solids.push(e);
        break;
      case 'forcefield':
        out.fields.push(e);
        break;
      case 'hazard':
        out.hazards.push(e);
        break;
      case 'pickup':
        out.pickups.push(e);
        break;
      case 'boya':
        out.boyas.push(e);
        break;
      case 'station':
        out.stations.push(e);
        break;
      case 'anchor':
        break;
    }
  }
  return out;
}
