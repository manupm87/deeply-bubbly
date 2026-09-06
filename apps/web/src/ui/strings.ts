/**
 * Every on-screen word of the shell lives here (GDD pillar 5: < 40 words in total on screen).
 * Spanish is the design language; English is the fallback for any other locale.
 */

export interface StringTable {
  /** Station: giant button under the thumb. */
  keepDiving: string;
  /** Station: greyed rewarded-video slot. */
  doublePearls: string;
  /** Dead: giant button. */
  again: string;
  /** Dead: greyed rewarded-video slot (only from AD_OFFER_MIN_FAILS on). */
  secondBreath: string;
  /** Campaign complete headline. */
  bottomReached: string;
  /** Pause menu. */
  resume: string;
  restartImmersion: string;
  sound: string;
  quit: string;
  /** Accessibility toggles of §8, shown as one short word plus a tick inside the pause overlay. */
  noShake: string;
  assistedTrajectory: string;
  slowCharge: string;
  calmDive: string;
  /** Title overlay after "quit". */
  dive: string;
  /** Depth unit appended to the metres counter. */
  metres: string;
  /** DOM curtain shown on a landscape phone (web cannot lock the orientation). */
  rotate: string;
}

const ES: StringTable = {
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
  slowCharge: 'Carga lenta',
  calmDive: 'Tranquilo',
  dive: 'Bajar',
  metres: 'm',
  rotate: 'Gira el móvil',
};

const EN: StringTable = {
  keepDiving: 'Keep diving',
  doublePearls: 'Pearls ×2',
  again: 'Again',
  secondBreath: 'Second breath',
  bottomReached: 'Bottom reached!',
  resume: 'Resume',
  restartImmersion: 'Restart dive',
  sound: 'Sound',
  quit: 'Quit',
  noShake: 'No shake',
  assistedTrajectory: 'Guide',
  slowCharge: 'Slow charge',
  calmDive: 'Calm',
  dive: 'Dive',
  metres: 'm',
  rotate: 'Rotate your phone',
};

export type Lang = 'es' | 'en';

/** Spanish for any es-* locale, English otherwise. */
export function pickLang(locale: string): Lang {
  return locale.toLowerCase().startsWith('es') ? 'es' : 'en';
}

let table: StringTable | null = null;

/** Memoised string table for the active navigator locale. */
export function strings(): StringTable {
  if (table === null) {
    const locale = typeof navigator === 'undefined' ? 'es' : navigator.language;
    table = pickLang(locale) === 'es' ? ES : EN;
  }
  return table;
}
