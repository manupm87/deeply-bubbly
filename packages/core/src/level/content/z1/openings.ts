/**
 * The three opening chunks of the campaign (GDD §4.1: "los tres primeros chunks de la partida" are
 * hand-made, never shuffled; §12.1). They teach the single verb of Zone 1 — draw the slingshot, let go,
 * come to rest under a ceiling — with no hazard in sight, and they are the first impression of the game.
 *
 * Every hop here reverses the last one, so the next rest point is in the view from the first shot on and
 * nobody has to find a target before learning the gesture. `../ladder.ts` owns the geometry and explains
 * the zigzag; what these files choose is what lives beside it.
 *
 * Power stays low on purpose. D4 cut the impulse range to 90–280 px/s, which buys ≈195 px of descent at
 * a full pull; an 80 px drop across 70–115 px of water never needs the top fifth of the slingshot
 * (`zoneReport.cappedImpulse`).
 */
import {
  ENTRY_LEDGE_Y,
  EXIT_X_EAST,
  EXIT_X_WEST,
  MID_Y,
  airPocket,
  exitRung,
  jellyfish,
  ladder,
  pearl,
  reefIn,
  rung,
  shell,
} from './builders';
import type { Chunk } from '../../../types';

const VERBS = ['apuntar', 'soltar', 'reposar'];

/**
 * z1-open-1 — the tutorial. A foam raft just under the surface, wide enough to read as a raft and not as
 * a ledge: Bur is born under it (§2.3 "el reposo es el comportamiento por defecto", §8 step 1) and the
 * only thing to learn is the gesture. One easy rung follows, then the cornice. Her x is chosen so the next rung
 * is already in the view on the very first screen.
 */
const open1 = ladder(
  'o1',
  [
    rung(290, ENTRY_LEDGE_Y, { w: 120, inset: 60, material: 'foam' }),
    rung(220, MID_Y, { material: 'coral' }),
    exitRung(EXIT_X_EAST),
  ],
  EXIT_X_WEST,
);

export const Z1_OPEN_1: Chunk = {
  id: 'z1-open-1',
  zone: 0,
  difficulty: 1,
  verbs: VERBS,
  entryAnchorId: open1.entryAnchorId,
  exitAnchorId: open1.exitAnchorId,
  airBudget: 2,
  targetTimeS: 8,
  tags: ['tutorial', 'espuma'],
  role: 'opening',
  entities: [
    ...open1.entities,
    ...reefIn('o1', { left: [30, 190], right: [110, 120] }),
    airPocket('o1-air-1', 275, 70),
    airPocket('o1-air-2', 245, 150),
    pearl('o1-pearl', 480, 120),
  ],
};

/**
 * z1-open-2 — the first descent proper: back across the world with an air pocket on the way. Still no
 * hazard: the lesson is that a shot lands UNDER the next ceiling, never on top of it.
 */
const open2 = ladder(
  'o2',
  [rung(215, ENTRY_LEDGE_Y), rung(330, MID_Y, { material: 'coral' }), exitRung(EXIT_X_WEST)],
  EXIT_X_EAST,
);

export const Z1_OPEN_2: Chunk = {
  id: 'z1-open-2',
  zone: 0,
  difficulty: 1,
  verbs: VERBS,
  entryAnchorId: open2.entryAnchorId,
  exitAnchorId: open2.exitAnchorId,
  airBudget: 2,
  targetTimeS: 8,
  tags: ['zigzag', 'calma'],
  role: 'opening',
  entities: [
    ...open2.entities,
    ...reefIn('o2', { left: [60, 150], right: [40, 160] }),
    airPocket('o2-air-1', 270, 70),
    airPocket('o2-air-2', 290, 150),
    // The first lateral detour of the game: a pearl tucked against the left reef, off every line.
    pearl('o2-pearl', 70, 118),
    shell('o2-concha', 470, 60),
  ],
};

/**
 * z1-open-3 — the Medusa Farolillo (§5 nº 1) enters. She hangs on the straight line between the first
 * two rest points, at the depth Bur rises back through: a shot that falls short meets her belly and is
 * fired back DOWN, a shot that carries passes beside her and lands. She is not a `Hazard` — she costs no
 * Air — and she is the first lesson of the game, pointing in the right direction.
 */
const open3 = ladder(
  'o3',
  [rung(325, ENTRY_LEDGE_Y), rung(210, MID_Y, { material: 'coral' }), exitRung(EXIT_X_EAST)],
  EXIT_X_WEST,
);

export const Z1_OPEN_3: Chunk = {
  id: 'z1-open-3',
  zone: 0,
  difficulty: 1,
  verbs: VERBS,
  entryAnchorId: open3.entryAnchorId,
  exitAnchorId: open3.exitAnchorId,
  airBudget: 2,
  targetTimeS: 9,
  tags: ['medusa', 'zigzag'],
  role: 'opening',
  entities: [
    ...open3.entities,
    ...reefIn('o3', { left: [80, 140], right: [150, 90] }),
    jellyfish('o3-medusa', 244, 60, 40),
    airPocket('o3-air-1', 255, 128),
    airPocket('o3-air-2', 240, 165),
    pearl('o3-pearl', 90, 60),
    shell('o3-concha', 100, 200),
  ],
};
