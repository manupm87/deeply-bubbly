/**
 * Bootstrap of the web shell: build the persistence ports, build the `GameWorld`, build the
 * `GameContext` every scene reads, and hand all of it to Phaser.
 *
 * This file owns NO game rule and NO drawing. It is the composition root: ports in, world out,
 * context in the registry, scenes started. Everything else lives in its own module.
 */
import * as Phaser from 'phaser';
import { DEFAULT_TUNING, GameWorld, buildMvpCampaign, loadSave, noopAds, writeSave } from '@deeply-bubbly/core';
import type { KeyValueStore, SaveData, Telemetry, Tuning } from '@deeply-bubbly/core';
import { CTX_KEY } from './context';
import type { GameContext, Settings } from './context';
import { ZONE_PALETTES, css } from './palette';
import { attachResize, computeScale } from './scale';
import { attachOrientationOverlay } from './orientation';
import { BootScene, SCENE_KEYS } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { createStore } from './platform/LocalStorageStore';
import { createTelemetry } from './platform/Telemetry';
import { applySettingsToTuning, settingsFromSave, settingsToSave } from './platform/settings';
import { strings } from './ui/strings';

/** Fixed simulation seed: the campaign is authored, not generated, so one seed is enough (§11.7.14). */
const SEED = 1;

interface Ports {
  store: KeyValueStore;
  telemetry: Telemetry;
}

/**
 * Debug entry point: `?start=<stationIndex>` boots the run at that station's checkpoint instead of at
 * the player's own unlocked one. It is how a QA pass or a screenshot bot reaches Zone 2 without
 * replaying Zone 1, and it is gated behind the same flag as `__db` (a dev build, or `?debug=1`), so a
 * plain production load can never be talked into skipping the campaign. Never persisted: the save is
 * only ever written by core, at a checkpoint actually reached.
 */
function debugStartStation(): number | null {
  const params = new URLSearchParams(globalThis.location.search);
  if (!import.meta.env.DEV && !params.has('debug')) return null;
  const raw = params.get('start');
  if (raw === null) return null;
  const index = Number.parseInt(raw, 10);
  return Number.isFinite(index) && index >= 0 ? index : null;
}

/** The one recipe for "the game", shared with `createMvpWorld` in core: MVP campaign + real ports. */
function buildWorld(tuning: Tuning, save: SaveData, viewH: number, ports: Ports): GameWorld {
  return new GameWorld({
    campaign: buildMvpCampaign(tuning),
    tuning,
    telemetry: ports.telemetry,
    ads: noopAds,
    store: ports.store,
    viewH,
    seed: SEED,
    startStationIndex: debugStartStation() ?? save.unlockedStation,
  });
}

/**
 * Builds the context and owns the ONE place where a tuning is composed: `base` is the last tuning
 * anybody asked for (the defaults, or the tuning panel's overrides) and the accessibility transforms
 * are re-applied on top of it. Keeping the base apart is what stops the two tools from cancelling each
 * other — the panel used to silently restore the 550 ms charge for a player on "carga lenta", and a
 * settings change used to throw every panel override away.
 */
function buildContext(ports: Ports): GameContext {
  const save = loadSave(ports.store);
  const settings: Settings = settingsFromSave(save);
  const scale = computeScale(globalThis.innerWidth, globalThis.innerHeight);
  let base: Tuning = DEFAULT_TUNING;
  const tuning = applySettingsToTuning(base, settings);
  const world = buildWorld(tuning, save, scale.viewH, ports);

  const ctx: GameContext = {
    world,
    scale,
    settings,
    save,
    tuning,
    snapshot: null,
    // A single mutable sample, written in place by PointerAdapter and read by GameScene every frame.
    pointer: { down: false, x: scale.viewW / 2, y: scale.viewH * 0.8 },
    bus: new Phaser.Events.EventEmitter(),
    applyTuning(t: Tuning): void {
      base = t;
      retune();
    },
    persistSettings(): void {
      // Re-read first: core writes the save on every checkpoint, and the settings must not clobber it.
      const current = loadSave(ports.store);
      const merged: SaveData = { ...settingsToSave(current, ctx.settings), tutorialDone: ctx.save.tutorialDone };
      writeSave(ports.store, merged);
      Object.assign(ctx.save, merged);
    },
  };

  const retune = (): void => {
    ctx.tuning = applySettingsToTuning(base, ctx.settings);
    ctx.world.setTuning(ctx.tuning);
    ctx.bus.emit('tuningChanged', ctx.tuning);
  };
  // Settings only ever change tuning through `applySettingsToTuning`; the shell invents no transform.
  ctx.bus.on('settingsChanged', () => {
    retune();
    ctx.persistSettings();
  });
  return ctx;
}

function gameConfig(scenes: Phaser.Types.Scenes.SceneType[]): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game',
    // The canvas fills the screen; `scale.ts` letterboxes the 180 px design column inside it.
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    autoRound: true,
    // Every sound in the game is synthesised by `fx/Audio` on the first pointerdown. Without this
    // Phaser opens its own AudioContext at boot — before any gesture, never used, never closed.
    audio: { noAudio: true },
    backgroundColor: css(ZONE_PALETTES[0].waterBottom),
    fps: { target: 60, forceSetTimeOut: false },
    banner: false,
    scene: scenes,
  };
}

/**
 * "Campaña completa" has no core API to start a new campaign (`restart()` returns early outside
 * dead/gameOver), so the shell does the only thing it may: throws the finished world away and boots a
 * brand new one. Everything scene-side is rebuilt by Boot, so no listener survives the swap.
 */
function attachCampaignRestart(game: Phaser.Game, ctx: GameContext, ports: Ports): void {
  ctx.bus.on('restart', () => {
    if (ctx.snapshot?.phase !== 'campaignComplete') return;
    ctx.world = buildWorld(ctx.tuning, ctx.save, ctx.scale.viewH, ports);
    ctx.snapshot = null;
    game.scene.stop(SCENE_KEYS.hud);
    game.scene.stop(SCENE_KEYS.game);
    game.scene.start(SCENE_KEYS.boot);
  });
}

/** Telemetry is a ring buffer in memory; the tail would be lost on a phone kill without this. */
function attachTelemetryFlush(ports: Ports): void {
  const flush = (): void => {
    const t = ports.telemetry as { flush?: () => void };
    t.flush?.();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') flush();
  });
  globalThis.addEventListener('pagehide', flush);
}

/** Test/debug handle. Only with `?debug=1` or in a dev build; never present in a plain production load. */
function exposeDebugHandle(game: Phaser.Game, ctx: GameContext): void {
  const wanted = import.meta.env.DEV || new URLSearchParams(globalThis.location.search).has('debug');
  if (!wanted) return;
  Object.defineProperty(globalThis, '__db', {
    configurable: true,
    value: {
      ctx,
      game,
      get world(): GameWorld {
        return ctx.world;
      },
    },
  });
}

function start(): Phaser.Game {
  const store = createStore();
  const ports: Ports = { store, telemetry: createTelemetry(store) };
  const ctx = buildContext(ports);

  const game = new Phaser.Game(gameConfig([BootScene, GameScene, HudScene]));
  // Must be set before any scene's `create()` runs; the first scene step is a frame away.
  game.registry.set(CTX_KEY, ctx);

  attachResize(game, ctx);
  // The landscape curtain hides the game, so the game must stop: air kept draining and hazards kept
  // hitting behind it (SHELL.md, §8 "pausa automática al perder el foco").
  attachOrientationOverlay(strings().rotate, (landscape) => {
    if (landscape) ctx.bus.emit('autoPause');
  });
  attachCampaignRestart(game, ctx, ports);
  attachTelemetryFlush(ports);
  exposeDebugHandle(game, ctx);
  return game;
}

start();
