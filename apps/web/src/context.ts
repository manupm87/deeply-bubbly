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
   * True while the world map — the main menu since v1.3 (WORLD-MAP.md §3) — is still owed to a
   * returning player. `BootScene` consumes it on the first `create()`, so the scene restart a new run
   * goes through drops straight into the game instead of asking the same question again.
   */
  mapPending: boolean;
  /** Current pointer sample in design px of the viewport. Written by PointerAdapter. */
  pointer: PointerInput;
  /**
   * Who the shared `pointer` sample belongs to right now (D5, two active pointers): `PointerAdapter`
   * publishes itself here while it is attached, and HUD surfaces ask before clearing the sample, so a
   * finger landing on the minimap or on a button cannot end the OTHER finger's pull (`ui/swallow.ts`).
   */
  pointerOwner: PointerOwner | null;
  /**
   * Cross-scene bus. Two channels are wired to something: 'newRun' — `{ startStationIndex }`, -1 =
   * surface — the one channel that throws the world away and builds another one, and 'toMap', which
   * leaves the run for the world map (both in `main.ts`). 'pause', 'resume', 'settingsChanged' and
   * 'tuningChanged' are read by the HUD and the scenes.
   *
   * 'restart' and 'continue' are announcements with NO subscriber today: the screens that emit them
   * (the fail screen, the pause menu, the station) do the real work themselves on `ctx.world` and only
   * say so on the bus, for whoever wants to listen (analytics, a future sound cue).
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
