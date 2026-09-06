/**
 * The three opening chunks of the campaign (GDD §4.1: "los tres primeros chunks de la partida" are
 * hand-made, never shuffled; §12.1). They teach the single verb of Zone 1 — draw the slingshot, let go,
 * come to rest under a ceiling — with no hazard in sight, and they are the first impression of the game.
 *
 * They are also the first impression of the 540 px world (DECISIONS-v1.2 D3): every hop crosses between
 * a third and a whole screen of water, so the camera moves sideways from the second shot on and the
 * player learns that the column is three screens wide before anything is asked of them. `../ladder.ts`
 * owns the geometry; what these files choose is where the ladder goes and what lives beside it.
 *
 * Power stays low on purpose. D4 cut the impulse range to 90–280 px/s, which buys ≈195 px of descent at
 * a full pull; a 62 px drop across 90–170 px of water is a lazy half pull, and the top fifth of the
 * slingshot is never needed anywhere in the zone (`zoneReport.cappedImpulse`).
 */
import {
  ENTRY_X_LEFT,
  ENTRY_X_RIGHT,
  RUNG_Y_4,
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
 * only thing to learn is the gesture. Two easy rungs follow, then the cornice every chunk exits on.
 */
const open1 = ladder('o1', [
  rung(ENTRY_X_LEFT, RUNG_Y_4[0] ?? 18, { w: 120, inset: 60, material: 'foam' }),
  rung(300, RUNG_Y_4[1] ?? 80),
  rung(ENTRY_X_RIGHT, RUNG_Y_4[2] ?? 142, { material: 'coral' }),
  exitRung(),
]);

export const Z1_OPEN_1: Chunk = {
  id: 'z1-open-1',
  zone: 0,
  difficulty: 1,
  verbs: VERBS,
  entryAnchorId: open1.entryAnchorId,
  exitAnchorId: open1.exitAnchorId,
  airBudget: 2,
  targetTimeS: 10,
  tags: ['tutorial', 'espuma'],
  role: 'opening',
  entities: [
    ...open1.entities,
    ...reefIn('o1', { left: [30, 190], right: [110, 120] }),
    airPocket('o1-air-1', 250, 60),
    airPocket('o1-air-2', 350, 175),
    pearl('o1-pearl', 480, 120),
  ],
};

/**
 * z1-open-2 — the first descent proper: a wide zigzag that sweeps the whole column, with an air pocket
 * on the way. Still no hazard: the lesson is that a shot lands UNDER the next ceiling, never on top of
 * it, and that the ceiling is often a screen away.
 */
const open2 = ladder('o2', [
  rung(ENTRY_X_RIGHT, RUNG_Y_4[0] ?? 18),
  rung(230, RUNG_Y_4[1] ?? 80, { material: 'coral' }),
  rung(390, RUNG_Y_4[2] ?? 142),
  exitRung(),
]);

export const Z1_OPEN_2: Chunk = {
  id: 'z1-open-2',
  zone: 0,
  difficulty: 1,
  verbs: VERBS,
  entryAnchorId: open2.entryAnchorId,
  exitAnchorId: open2.exitAnchorId,
  airBudget: 2,
  targetTimeS: 11,
  tags: ['zigzag', 'calma'],
  role: 'opening',
  entities: [
    ...open2.entities,
    ...reefIn('o2', { left: [60, 150], right: [40, 160] }),
    airPocket('o2-air-1', 300, 50),
    airPocket('o2-air-2', 300, 175),
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
const open3 = ladder('o3', [
  rung(ENTRY_X_LEFT, RUNG_Y_4[0] ?? 18),
  rung(330, RUNG_Y_4[1] ?? 80, { material: 'coral' }),
  rung(420, RUNG_Y_4[2] ?? 142),
  exitRung(),
]);

export const Z1_OPEN_3: Chunk = {
  id: 'z1-open-3',
  zone: 0,
  difficulty: 1,
  verbs: VERBS,
  entryAnchorId: open3.entryAnchorId,
  exitAnchorId: open3.exitAnchorId,
  airBudget: 2,
  targetTimeS: 11,
  tags: ['medusa', 'zigzag'],
  role: 'opening',
  entities: [
    ...open3.entities,
    ...reefIn('o3', { left: [80, 140], right: [150, 90] }),
    jellyfish('o3-medusa', 238, 60, 40),
    airPocket('o3-air-1', 220, 118),
    airPocket('o3-air-2', 470, 190),
    pearl('o3-pearl', 90, 60),
    shell('o3-concha', 100, 200),
  ],
};
