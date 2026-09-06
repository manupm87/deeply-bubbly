/**
 * Shared context between scenes. Stored in the Phaser registry under CTX_KEY by main.ts;
 * every scene reads it with `getContext(this)`. This is the ONLY cross-scene channel besides
 * Phaser's own scene events.
 */
import type Phaser from 'phaser';
import type { GameWorld, PointerInput, Tuning, WorldSnapshot } from '@deeply-bubbly/core';
import type { SaveData } from '@deeply-bubbly/core';

export interface ScaleState {
  /** Integer zoom: design px → device css px. */
  zoom: number;
  /** Visible design width (always 180) and height (320–420). */
  viewW: number;
  viewH: number;
  /** Offset of the game area inside the canvas, in css px (letterboxing on wide screens). */
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
  scale: ScaleState;
  settings: Settings;
  save: SaveData;
  /** Live tuning: `applyTuning` keeps it in sync, so a scene created later reads the current numbers. */
  tuning: Tuning;
  /** Latest snapshot read this frame by GameScene; HudScene reads it after (scene order guarantees it). */
  snapshot: WorldSnapshot | null;
  /** Current pointer sample in design px of the viewport. Written by PointerAdapter. */
  pointer: PointerInput;
  /** Cross-scene bus: 'pause', 'resume', 'restart', 'continue', 'settingsChanged', 'tuningChanged'. */
  bus: Phaser.Events.EventEmitter;
  /** Replace tuning at runtime (tuning panel, settings). Updates `tuning` and emits 'tuningChanged'. */
  applyTuning(t: Tuning): void;
  persistSettings(): void;
}

export const CTX_KEY = 'ctx';

export function getContext(scene: Phaser.Scene): GameContext {
  const ctx = scene.registry.get(CTX_KEY) as GameContext | undefined;
  if (!ctx) throw new Error('GameContext not initialised; main.ts must set it before starting scenes');
  return ctx;
}
