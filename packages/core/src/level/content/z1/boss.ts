/**
 * z1-boss — **Don Hinchón** (GDD §5 nº 5, §3.2): the pufferfish who plugs the gorge. He is not defeated,
 * he is made to laugh: he inflates every 3 s and pushes LATERALLY (never up — §5 "regla de dirección del
 * catálogo", §11.7.9), and the chunk is resolved by passing him during his 1,2 s deflated window.
 *
 * He sits in the middle of the world, between the two approach ledges D3 asks for — one on the left of
 * the gorge, one on the right — so the descent has to cross his radius twice, once on each side, and
 * both crossings are timed rather than blocked: he is a sensor, not a body.
 *
 * So the only `Hazard` entity of the whole zone lives here, alone in its chunk, which is exactly what
 * the didactic isolation rule asks for (§4.2.1, §11.5.5).
 */
import { ENTRY_X_RIGHT, RUNG_Y_4, airPocket, exitRung, ladder, pearl, reefIn, rung, shell } from './builders';
import type { Chunk, Hazard } from '../../../types';

const y4 = (i: number): number => RUNG_Y_4[i] ?? 18;

/** Four rungs around the gorge: in on the right, across to the left approach, back over him, out. */
const gorge = ladder('bs', [
  rung(ENTRY_X_RIGHT, y4(0), { material: 'coral' }),
  rung(220, y4(1)),
  rung(390, y4(2), { material: 'coral' }),
  exitRung(),
]);

/**
 * §5 nº 5: "se infla cada 3 s y empuja radialmente 200 px/s", countered by drawing the sling in his
 * 1,2 s deflated window — an `activeFraction` of 0,6 over a 3 000 ms cycle leaves exactly that window.
 * His box straddles the centre of the world just under the LEFT approach ledge, which is deliberate and
 * is the difference between a rhythm gate and a coin flip: the arc meets him within half a second of the
 * release, so a shot let go at the top of the deflated window is still inside it when it crosses. Park
 * him at the far end of a hop instead and the 1,2 s window is shorter than the flight — there is then no
 * moment at which the shot can be taken, which is not a gate, it is a wall. He is a sensor, not a body:
 * the descent is never blocked, only timed.
 */
const donHinchon: Hazard = {
  type: 'hazard',
  id: 'bs-hinchon',
  catalogId: 5,
  shape: { x: 300, y: 58, w: 60, h: 52 },
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
  zone: 0,
  difficulty: 3,
  verbs: ['apuntar', 'soltar', 'reposar'],
  entryAnchorId: gorge.entryAnchorId,
  exitAnchorId: gorge.exitAnchorId,
  airBudget: 2,
  targetTimeS: 12,
  tags: ['jefe', 'ritmo'],
  role: 'boss',
  entities: [
    ...gorge.entities,
    donHinchon,
    ...reefIn('bs', { left: [20, 200], right: [20, 200] }),
    airPocket('bs-air-1', 330, 45),
    airPocket('bs-air-2', 300, 190),
    pearl('bs-pearl-1', 120, 60),
    pearl('bs-pearl-2', 470, 150),
    shell('bs-concha', 90, 150),
  ],
};
