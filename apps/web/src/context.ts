/**
 * Shared context between scenes. Stored in the Phaser registry under CTX_KEY by main.ts;
 * every scene reads it with `getContext(this)`. This is the ONLY cross-scene channel besides
 * Phaser's own scene events.
 */
import type Phaser from 'phaser';
import type { Campaign, GameWorld, PointerInput, Tuning, WorldSnapshot } from '@deeply-bubbly/core';
import type { SaveData } from '@deeply-bubbly/core';
import type { PointerOwner } from './ui/swallow';

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
  /**
   * The campaign `world` is playing. Read-only for the shell, and the only place it may look up a
   * structural fact of the level — the start screen needs the unlocked station's `stationY` to say how
   * deep "Seguir" goes. Replaced together with `world` on a new run.
   */
  campaign: Campaign;
  scale: ScaleState;
  settings: Settings;
  save: SaveData;
  /** Live tuning: `applyTuning` keeps it in sync, so a scene created later reads the current numbers. */
  tuning: Tuning;
  /** Latest snapshot read this frame by GameScene; HudScene reads it after (scene order guarantees it). */
  snapshot: WorldSnapshot | null;
  /**
   * True while the boot title screen is still owed to a returning player (GDD §3.1). `HudScene`
   * consumes it on the first `create()`, so the scene restart a new run goes through drops straight
   * into the game instead of asking the same question again.
   */
  titlePending: boolean;
  /** Current pointer sample in design px of the viewport. Written by PointerAdapter. */
  pointer: PointerInput;
  /**
   * Who the shared `pointer` sample belongs to right now (D5, two active pointers): `PointerAdapter`
   * publishes itself here while it is attached, and HUD surfaces ask before clearing the sample, so a
   * finger landing on the minimap or on a button cannot end the OTHER finger's pull (`ui/swallow.ts`).
   */
  pointerOwner: PointerOwner | null;
  /**
   * Cross-scene bus: 'pause', 'resume', 'restart', 'continue', 'settingsChanged', 'tuningChanged',
   * and 'newRun' — `{ startStationIndex }`, -1 = surface — the one channel that throws the world away
   * and builds another one (`main.ts`).
   */
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
