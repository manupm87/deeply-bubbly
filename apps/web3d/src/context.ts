/**
 * Shared context of the Three.js shell; the counterpart of `apps/web/src/context.ts` with the Phaser
 * bits gone. Every module reads this object, and it is the only cross-module channel besides the bus.
 */
import type { Campaign, GameWorld, PointerInput, SaveData, Tuning, WorldSnapshot } from '@deeply-bubbly/core';
import type { Bus } from './bus';

export interface ScaleState {
  /** Design px → css px. Fractional here: a 3D scene has no pixel grid to protect. */
  zoom: number;
  /** Visible design width (always 180) and height (320–420). */
  viewW: number;
  viewH: number;
  /** Offset of the game area inside the window, in css px. */
  offsetX: number;
  offsetY: number;
}

export interface Settings {
  sound: boolean;
  slowCharge: boolean;
  assistedTrajectory: boolean;
  noShake: boolean;
  calm: boolean;
}

export interface GameContext {
  world: GameWorld;
  campaign: Campaign;
  scale: ScaleState;
  settings: Settings;
  save: SaveData;
  /** Live tuning: `applyTuning` keeps it in sync. */
  tuning: Tuning;
  /** Latest snapshot read this frame by the shell. */
  snapshot: WorldSnapshot | null;
  /** Current pointer sample in design px of the viewport. Written by PointerAdapter. */
  pointer: PointerInput;
  bus: Bus;
  applyTuning(t: Tuning): void;
  persistSettings(): void;
}
