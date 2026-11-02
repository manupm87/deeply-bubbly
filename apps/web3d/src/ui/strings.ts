/**
 * Every on-screen word of the shell. Same texts as `apps/web/src/ui/strings.ts` (WEB3D.md: no duplicated
 * product decisions), Spanish only for now: the design language of the project.
 */
export const S = {
  keepDiving: 'Seguir bajando',
  doublePearls: 'Perlas ×2',
  again: 'Otra vez',
  secondBreath: 'Segundo aliento',
  bottomReached: '¡Fondo alcanzado!',
  resume: 'Seguir',
  restartImmersion: 'Reiniciar Inmersión',
  sound: 'Sonido',
  quit: 'Salir',
  noShake: 'Sin temblor',
  assistedTrajectory: 'Guía',
  slowCharge: 'Goma larga',
  calmDive: 'Tranquilo',
  map: 'Mapa',
  worldAmberOcean: 'Océano de Ámbar',
  worldVolcano: 'Volcán',
  worldLochNess: 'Lago Ness',
  metres: 'm',
  rotate: 'Gira el móvil',
  noWebgl: 'Este dispositivo no puede mostrar el juego en 3D',
} as const;

const formatter = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });

/** Localised depth reading, e.g. "1284 m". */
export function formatMeters(m: number): string {
  const safe = Number.isFinite(m) ? Math.max(0, m) : 0;
  return `${formatter.format(Math.round(safe))} ${S.metres}`;
}
