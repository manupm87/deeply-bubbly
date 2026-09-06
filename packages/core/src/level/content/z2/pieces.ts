/**
 * The rungs a Zone 2 chunk is built from, on top of the shared ladder of `../ladder.ts`.
 *
 * Zone 1 only ever needed a ledge. Zone 2 needs three more shapes, and each of them exists because of a
 * rule the zone is judged by:
 *
 *  - **`guardedRung`** — a rung whose rest point sits `CROWN_CLEARANCE_INSET` px past its lip instead of
 *    the usual 12. That gap is the room a crown needs: §5 nº 6 and nº 7 grow on a ledge, and a crown on
 *    the LIP hangs half into the corridor the arc dips through, so on a rung with no room it would catch
 *    a perfect landing too. `z2.test.ts` refuses any crown that covers its own ledge's rest pose.
 *  - **`pulpoRung`** — catalogue nº 9: a rung that IS the creature, indistinguishable from rock until
 *    his half-second of patience runs out (§5 nº 9).
 *  - **`currentRung`** — a rung whose rest point sits so far under its shelf that no shot in the cone
 *    reaches it in still water; only the drift of a `corriente` carries Bur the last stretch. It is the
 *    honest form of "the band changes which shot lands": here it changes whether there IS one.
 *
 * **Where a hazard lives**, and the rule a review had to teach this zone. Bur lands by dipping past the
 * INNER lip of a ledge and floating up under it (§2.3): a successful arc never crosses a ledge's top
 * face. So a crown on the SHOULDER of a ledge is only ever met by a shot that had already failed — of
 * ~900 certified landing lines in the first version of this zone, exactly 0 touched a hazard — and the
 * zone played as Zone 1 with decorations. Both seats are used now, and they mean different things:
 *
 *   `'shoulder'`  punishes the OVERSHOOT: the shot that sails over the shelf pays. Introductions and the
 *                 gentler chunks use it.
 *   `'lip'`       hangs under the shelf's mouth, in the dip corridor, and contests the LANDING itself.
 *                 It rides a `guardedRung`, whose extra inset keeps the rest point clear at the back.
 *
 * A trap may only ever grow on a lip, and that is a rule, not a taste: the escape §2.4.5 sells is a
 * DOWNWARD launch, so an anemone with rock underneath hands Bur straight back to itself until the bar is
 * empty. `validator.trapEscapes` flies the escape and refuses the chunk otherwise.
 */
import { PULPO_REST_MS, rung } from './builders';
import { DEFAULT_TUNING } from '../../../tuning';
import type { Ladder, Rung, RungSpec } from './builders';
import type { Chunk, WorldEntity } from '../../../types';

const T = DEFAULT_TUNING;

export { Z2, Z2_MAX_HOP, Z2_MAX_HOP_X, Z2_RADIUS, ladder, rung } from './builders';

/**
 * Verbs of Zone 2 (§4.2: "la dificultad entre zonas sube por verbos acumulados"). Z1's three plus the
 * one the zone is named for (§3.2: "leer y usar las corrientes").
 */
export const Z2_VERBS: string[] = ['apuntar', 'soltar', 'reposar', 'corriente'];

/**
 * Inset of a guarded rung. A crown is 14–16 px wide and is centred ON the lip, so half of it — 7 or
 * 8 px — hangs inside the ledge; the rest point has to clear that plus a whole Bur (6,44 px), and 24 px
 * is the first round number that does. Every hop onto a guarded rung is correspondingly longer.
 */
export const CROWN_CLEARANCE_INSET = 24;

/** A rung a crown can be grown on: the same ledge, with its rest point pushed to the back. */
export const guardedRung = (x: number, y: number, extra: Partial<RungSpec> = {}): RungSpec =>
  rung(x, y, { w: 56, inset: CROWN_CLEARANCE_INSET, ...extra });

/**
 * Catalogue nº 9, **Pulpo Camuflado** (§5): "parece repisa; a los 0,5 s de reposo te desplaza suave".
 * He is a real, capturable rung — that is the whole trick — with rock restitution and the silhouette of
 * a ledge; only his `maxRestMs` gives him away, and only after you have already landed.
 */
export const pulpoRung = (x: number, y: number, extra: Partial<RungSpec> = {}): RungSpec =>
  rung(x, y, {
    kind: 'impaciente',
    material: 'creature',
    restitution: T.RESTITUTION_ROCK,
    maxRestMs: PULPO_REST_MS,
    catalogId: 9,
    ...extra,
  });

/**
 * How far under its own shelf a `currentRung`'s rest point hides. Measured against the real integrator:
 * at this inset and a 102 px drop, NO shot in the ±90° cone lands there in still water, and two do once
 * the band is running. `tutorial.ts` is the chunk that teaches it and `z2.test.ts` flies both sets.
 */
export const CURRENT_RUNG_INSET = 88;

/** A rung only the drift reaches. Always paired with a band that covers the hop (see the header). */
export const currentRung = (x: number, y: number, extra: Partial<RungSpec> = {}): RungSpec =>
  rung(x, y, { w: CURRENT_RUNG_INSET + 32, inset: CURRENT_RUNG_INSET, material: 'coral', ...extra });

/** Where a crown grown on the LIP of `r` sits: centred on the edge the arriving arc dips past. */
export const lipOf = (r: Rung): number => r.nearEdge;

/** Where a crown grown on the SHOULDER of `r` sits: over the back of the ledge, off the rest point. */
export const shoulderOf = (r: Rung): number => r.anchor.pos.x;

/** Top edge of the ledge of `r`, which is what `erizo`/`anemona` seat their box against. */
export const topOf = (r: Rung): number => r.ceiling.rect.y;

/** Convenience for a chunk file: the i-th rung of a ladder (they are authored in descent order). */
export const rungOf = (lad: Ladder, i: number): Rung => {
  const found = lad.rungs[i];
  if (found === undefined) throw new Error(`ladder has no rung ${i}`);
  return found;
};

/** Everything a playable Zone 2 chunk declares beyond its ladder and the things standing beside it. */
export interface Z2ChunkSpec {
  id: string;
  difficulty: Chunk['difficulty'];
  targetTimeS: number;
  tags: string[];
  /** Air pips the chunk's pockets add up to (§11.5.7 checks it against the pickups actually placed). */
  airBudget: number;
  ladder: Ladder;
  /** Reef, hazards, bands and pickups: the chunk's idea, on top of its ladder. */
  entities: WorldEntity[];
}

/** A playable Zone 2 chunk. Role, zone and verbs are the same for all fourteen; nothing restates them. */
export function z2Chunk(spec: Z2ChunkSpec): Chunk {
  return {
    id: spec.id,
    zone: 1,
    difficulty: spec.difficulty,
    verbs: Z2_VERBS,
    entryAnchorId: spec.ladder.entryAnchorId,
    exitAnchorId: spec.ladder.exitAnchorId,
    airBudget: spec.airBudget,
    targetTimeS: spec.targetTimeS,
    tags: spec.tags,
    role: 'playable',
    entities: [...spec.ladder.entities, ...spec.entities],
  };
}
