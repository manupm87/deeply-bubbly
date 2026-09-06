/**
 * The mercy rule (GDD §4.2.3, §11.5.8): silent, invisible help for a player who is stuck.
 *
 * "Si el jugador falla la misma Inmersión 2 veces, el generador baja silenciosamente la densidad de
 * peligros un 20% y añade una bolsa de aire. Al cuarto fallo, la reducción sube al 35% y se añade una
 * segunda bolsa. Nunca se le dice al jugador. Se revierte al superarla." §12.1 calls it "el sistema
 * anti-churn más importante del documento".
 *
 * `run/runState.ts` owns WHEN it fires (`registerFailure` → `mercyLevel`, `mercyDensityMul`); this file
 * owns WHAT it does to a chunk, and `level/streaming.ts` is the one caller: mercy is applied at
 * instantiation, so the same authored chunk yields a thinner world without the library ever changing.
 *
 * Three properties the rule needs and the tests check:
 *  - **Deterministic.** No RNG: a low-discrepancy sequence over the hazard's ordinal decides. The same
 *    failure count always removes the same hazards, so a retry is a fair retry and a replay is a replay.
 *  - **Monotone.** Level 2 removes a superset of level 1 (the same score against a smaller threshold):
 *    failing more never puts a hazard back.
 *  - **Invisible.** Nothing here emits an event, touches telemetry or marks an entity. The extra bag is
 *    an ordinary `Pickup` sitting where the author already put one, which is water they certified.
 */
import { mercyDensityMul } from '../run/runState';
import type { Tuning } from '../tuning';
import type { RunState, WorldEntity } from '../types';

/**
 * Fractional part of `n · φ⁻¹`: the classic low-discrepancy sequence. Spreading the removals evenly over
 * the campaign is the point — a modulo would always take the same slot of every chunk, and a hash would
 * clump, leaving whole chunks untouched and others empty.
 */
const GOLDEN = 0.6180339887498949;

const score = (ordinal: number): number => (ordinal * GOLDEN) % 1;

/** Which chunk of its immersion gets the level-1 bag, and which gets the level-2 one. */
const MERCY_BAG_POSITIONS: readonly number[] = [0, 2];

export interface MercyContext {
  /** Placed index of the chunk, so two chunks never remove "the same" hazard. */
  chunkIndex: number;
  /** Position of the chunk inside its immersion: the bags land in the first chunks Bur will meet. */
  positionInImmersion: number;
}

/**
 * The entities of one instantiated chunk, thinned for the current mercy level. Returns the input array
 * unchanged when mercy is off (`mercyLevel === 0`, which includes every 'abismo' run, §4.2.3).
 */
export function applyMercy(
  entities: readonly WorldEntity[],
  run: RunState,
  context: MercyContext,
  t: Tuning,
): WorldEntity[] {
  const level = run.mercyLevel;
  if (level === 0) return [...entities];

  const mul = mercyDensityMul(run, t);
  const out: WorldEntity[] = [];
  let ordinal = 0;
  for (const e of entities) {
    if (e.type === 'hazard') {
      const keep = score(context.chunkIndex * 7 + ordinal) < mul;
      ordinal += 1;
      if (!keep) continue;
    }
    out.push(e);
  }

  const bags = MERCY_BAG_POSITIONS.slice(0, level).filter((p) => p === context.positionInImmersion).length;
  for (let i = 0; i < bags; i++) out.push(...mercyBag(out, context, i));
  return out;
}

/**
 * The extra bolsa de aire. It is placed on top of a pickup the author already declared — a pearl first,
 * an air pocket second — because that is a point in this chunk that is known to be free water on a line
 * Bur actually flies. Inventing a coordinate here could bury the gift inside the reef.
 */
function mercyBag(entities: readonly WorldEntity[], context: MercyContext, index: number): WorldEntity[] {
  const pickups = entities.filter((e) => e.type === 'pickup');
  const host =
    pickups.find((p) => p.type === 'pickup' && p.pickupType === 'perla') ??
    pickups.find((p) => p.type === 'pickup' && p.pickupType === 'aire');
  if (host === undefined || host.type !== 'pickup') return [];
  return [
    {
      type: 'pickup',
      id: `${context.chunkIndex}:mercy-air-${index}`,
      pos: { x: host.pos.x, y: host.pos.y },
      pickupType: 'aire',
      value: 1,
      radius: 6,
    },
  ];
}
