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
  /** World map: the small button that leaves a station, the pause menu or the last screen for it. */
  map: string;
  /**
   * World map: the name of each world (WORLD-MAP.md §2). Only the first is playable; the other two are
   * locked silhouettes, and their names are all the design they get for now.
   */
  worldAmberOcean: string;
  worldVolcano: string;
  worldLochNess: string;
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
  // §8/D2 call the option "tirachinas largo". The settings strip gives each toggle half of
  // viewW * 0.9 — 80 design px — and the label is centred and never clipped or shrunk (`Button` only
  // has 8 / 10 / 12 px text), so the full phrase plus its ✕ measures 87 px and spills into the plate
  // beside it. This names the same thing by the part of it the player can see getting longer.
  slowCharge: 'Goma larga',
  calmDive: 'Tranquilo',
  map: 'Mapa',
  worldAmberOcean: 'Océano de Ámbar',
  worldVolcano: 'Volcán',
  worldLochNess: 'Lago Ness',
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
  slowCharge: 'Long slingshot',
  calmDive: 'Calm',
  map: 'Map',
  worldAmberOcean: 'Amber Ocean',
  worldVolcano: 'Volcano',
  worldLochNess: 'Loch Ness',
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
