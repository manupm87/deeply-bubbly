/**
 * z1-boss — **Don Hinchón** (GDD §5 nº 5, §3.2): the pufferfish who plugs the gorge. He is not defeated,
 * he is made to laugh: he inflates every 3 s and pushes LATERALLY (never up — §5 "regla de dirección del
 * catálogo", §11.7.9), and the chunk is resolved by passing him during his 1.2 s deflated window.
 *
 * So the only `Hazard` entity of the whole zone lives here, alone in its chunk, which is exactly what the
 * didactic isolation rule asks for (§4.2.1, §11.5.5).
 */
import { Z1, airPocket, anchorIdOf, pearl, perch, sideRock } from './builders';
import type { Anchor, Ceiling, Chunk, Hazard } from '../../../types';

/** Four ledges around the gorge: the route swings past Don Hinchón twice, once on each side. */
const ledges: Array<[Ceiling, Anchor]> = [
  perch({ id: 'bs-p1', x: 141, y: 18, w: 36, anchorX: 150, material: 'coral' }),
  perch({ id: 'bs-p2', x: 3, y: 78, w: 36, anchorX: 30 }),
  perch({ id: 'bs-p3', x: 141, y: 133, w: 36, anchorX: 150, material: 'coral' }),
  perch({ id: 'bs-p4', x: 1, y: 188, w: 40, anchorX: 32, material: 'coral' }),
];

/**
 * §5 nº 5: "se infla cada 3 s y empuja radialmente 200 px/s", countered by charging in his 1.2 s deflated
 * window — an `activeFraction` of 0.6 over a 3 000 ms cycle leaves exactly that 1.2 s of safe passage.
 * He is a sensor, not a body: the descent line is never blocked, only timed.
 */
const donHinchon: Hazard = {
  type: 'hazard',
  id: 'bs-hinchon',
  catalogId: 5,
  shape: { x: 70, y: 100, w: 40, h: 40 },
  airCost: 1,
  periodMs: 3000,
  phaseMs: 0,
  tellMs: 600,
  activeFraction: 0.6,
  pushImpulse: 200,
  pushDir: 'lateral',
};

export const Z1_BOSS: Chunk = {
  id: 'z1-boss',
  zone: Z1,
  difficulty: 3,
  verbs: ['cargar', 'soltar', 'reposar'],
  entry: 'R',
  exit: 'L',
  entryAnchorId: anchorIdOf('bs-p1'),
  exitAnchorId: anchorIdOf('bs-p4'),
  airBudget: 2,
  targetTimeS: 12,
  tags: ['jefe', 'ritmo'],
  role: 'boss',
  entities: [
    ...ledges.flat(),
    donHinchon,
    sideRock('bs-rock-l', 0, 20, 8, 40),
    sideRock('bs-rock-r', 172, 200, 8, 36),
    airPocket('bs-air-1', 90, 62),
    airPocket('bs-air-2', 90, 176),
    pearl('bs-pearl-1', 60, 120),
    pearl('bs-pearl-2', 120, 120),
  ],
};
