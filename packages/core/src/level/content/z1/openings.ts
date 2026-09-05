/**
 * The three opening chunks of the campaign (GDD §4.1: "los tres primeros chunks de la partida" are
 * hand-made, never shuffled; §12.1). They teach the single verb of Zone 1 — charge, release, rest under
 * the ceiling — with no hazard in sight, and they are the first impression of the whole game.
 *
 * The descent is authored "ceiling to ceiling": consecutive anchors drop 55–90 px (MAX_HOP_PX is 200)
 * and alternate sides, so the shot that lands is a lazy one (p ≈ 0,10–0,25 of §11.4). A full charge is
 * never required anywhere in the zone; it would overshoot every landing by 200 px.
 */
import { Z1, airPocket, anchorIdOf, jellyfish, pearl, perch, restY } from './builders';
import type { Anchor, Ceiling, Chunk } from '../../../types';

/**
 * z1-open-1 — the tutorial. One foam raft just under the surface, nothing else: Bur begins resting under
 * it (§2.3 "el reposo es el comportamiento por defecto") and the only thing to learn is the gesture.
 * Both declared anchors hang from that same ceiling, so the chunk is crossed in a single shot.
 */
const [foam, foamEntry] = perch({ id: 'o1-foam', x: 20, y: 188, w: 140, anchorX: 40, material: 'foam' });
/** The far end of the same raft: entering and leaving the tutorial never asks for a second ceiling. */
const foamExit: Anchor = { type: 'anchor', id: 'o1-foam-exit', ceilingId: foam.id, pos: { x: 110, y: restY(188) }, lane: 'C' };

export const Z1_OPEN_1: Chunk = {
  id: 'z1-open-1',
  zone: Z1,
  difficulty: 1,
  verbs: ['cargar', 'soltar', 'reposar'],
  entry: 'L',
  exit: 'C',
  entryAnchorId: foamEntry.id,
  exitAnchorId: foamExit.id,
  airBudget: 1,
  targetTimeS: 6,
  tags: ['tutorial', 'espuma'],
  role: 'opening',
  entities: [foam, foamEntry, foamExit, airPocket('o1-air', 90, 226)],
};

/**
 * z1-open-2 — the first descent proper: four rock ledges in a wide zigzag, one air pocket on the way.
 * Still no hazard: the lesson is that a shot lands under the NEXT ceiling, not on top of it.
 */
const o2: Array<[Ceiling, Anchor]> = [
  perch({ id: 'o2-p1', x: 3, y: 18, w: 36, anchorX: 30 }),
  perch({ id: 'o2-p2', x: 141, y: 78, w: 36, anchorX: 150, material: 'coral' }),
  perch({ id: 'o2-p3', x: 5, y: 133, w: 40, anchorX: 36 }),
  perch({ id: 'o2-p4', x: 101, y: 188, w: 48, anchorX: 110, material: 'coral' }),
];

export const Z1_OPEN_2: Chunk = {
  id: 'z1-open-2',
  zone: Z1,
  difficulty: 1,
  verbs: ['cargar', 'soltar', 'reposar'],
  entry: 'L',
  exit: 'C',
  entryAnchorId: anchorIdOf('o2-p1'),
  exitAnchorId: anchorIdOf('o2-p4'),
  airBudget: 1,
  targetTimeS: 9,
  tags: ['zigzag', 'calma'],
  role: 'opening',
  entities: [...o2.flat(), airPocket('o2-air', 92, 118), pearl('o2-pearl', 168, 150)],
};

/**
 * z1-open-3 — the Medusa Farolillo (§5 nº 1) enters. She hangs at the depth of the SECOND landing, on
 * the near side of it and squarely on the line between the two anchors: a shot that falls short rises
 * into her belly and is fired back DOWN, a shot that carries passes to her right and lands. It is not a
 * `Hazard` — it costs no Air — and it is the first lesson of the game, pointing in the right direction.
 */
const o3: Array<[Ceiling, Anchor]> = [
  perch({ id: 'o3-p1', x: 3, y: 18, w: 36, anchorX: 30 }),
  perch({ id: 'o3-p2', x: 141, y: 108, w: 36, anchorX: 150, material: 'coral' }),
  perch({ id: 'o3-p3', x: 31, y: 188, w: 48, anchorX: 70 }),
];

export const Z1_OPEN_3: Chunk = {
  id: 'z1-open-3',
  zone: Z1,
  difficulty: 1,
  verbs: ['cargar', 'soltar', 'reposar'],
  entry: 'L',
  exit: 'C',
  entryAnchorId: anchorIdOf('o3-p1'),
  exitAnchorId: anchorIdOf('o3-p3'),
  airBudget: 1,
  targetTimeS: 9,
  tags: ['medusa', 'zigzag'],
  role: 'opening',
  entities: [
    ...o3.flat(),
    jellyfish('o3-medusa', 95, 108, 40),
    airPocket('o3-air', 96, 160),
    pearl('o3-pearl', 150, 176),
  ],
};
