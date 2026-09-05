import type { ZoneIndex } from '../types';

export interface ZoneSpec {
  index: ZoneIndex;
  name: string;
  startM: number;
  endM: number;
  startPx: number;
  endPx: number;
  metersPerPx: number;
  immersions: number;
}

/** Normative table (§11.1). endPx of the last zone = 25 920 = 108 chunks * 240. */
export const ZONES: readonly ZoneSpec[] = Object.freeze([
  { index: 0, name: 'Superficie', startM: 0, endM: 200, startPx: 0, endPx: 2880, metersPerPx: 200 / 2880, immersions: 2 },
  { index: 1, name: 'Arrecife', startM: 200, endM: 600, startPx: 2880, endPx: 7200, metersPerPx: 400 / 4320, immersions: 3 },
  { index: 2, name: 'Crepuscular', startM: 600, endM: 1800, startPx: 7200, endPx: 11520, metersPerPx: 1200 / 4320, immersions: 3 },
  { index: 3, name: 'Medianoche', startM: 1800, endM: 4000, startPx: 11520, endPx: 15840, metersPerPx: 2200 / 4320, immersions: 3 },
  { index: 4, name: 'Abisal', startM: 4000, endM: 6500, startPx: 15840, endPx: 20160, metersPerPx: 2500 / 4320, immersions: 3 },
  { index: 5, name: 'Fosa hadal', startM: 6500, endM: 10935, startPx: 20160, endPx: 25920, metersPerPx: 4435 / 5760, immersions: 4 },
] as ZoneSpec[]);

export const WORLD_BOTTOM_PX = 25920;
export const WORLD_BOTTOM_M = 10935;

/** Zone containing worldY (clamped to the first/last zone outside the world). */
export function zoneAt(worldY: number): ZoneSpec {
  void worldY;
  throw new Error('not implemented');
}

/** Piecewise-linear, strictly increasing and continuous at zone borders (§11.7.10). */
export function pxToMeters(worldY: number): number {
  void worldY;
  throw new Error('not implemented');
}

/** Inverse of pxToMeters. */
export function metersToPx(m: number): number {
  void m;
  throw new Error('not implemented');
}
