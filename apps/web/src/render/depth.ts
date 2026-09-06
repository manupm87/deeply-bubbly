/**
 * Render order of the world layer, in one place (SHELL.md): background < force fields < ledges <
 * pickups < hazards < FX < Bur < charge ring.
 *
 * The §7 GOLDEN RULE decides the top of this table: "ningún efecto puede tapar la trayectoria punteada
 * ni los pips de Aire". So every particle layer — the launch tail, the impact burst and the ambient
 * marine snow of Z4+ — sits BELOW the dotted guide and below Bur, even though §7 also calls the snow
 * "delante de todo": it is in front of the whole world, and behind the two things the player aims with.
 * (The pips live in the HUD scene, on their own camera, so nothing here can reach them.)
 */
export const DEPTH = {
  water: -1000, parallaxFar: -900, parallaxMid: -880, parallaxNear: -860, godray: -840,
  station: -200, forcefield: -100, boya: -50, ledge: 0, pickup: 20, hazard: 40,
  particles: 45, snow: 48, chargeOrbit: 50, trajectory: 55, bur: 60, chargeRing: 70, debug: 500,
} as const;
