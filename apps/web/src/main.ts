/**
 * Bootstrap of the web shell: build the persistence ports, build the `GameWorld`, build the
 * `GameContext` every scene reads, and hand all of it to Phaser.
 *
 * This file owns NO game rule and NO drawing. It is the composition root: ports in, world out,
 * context in the registry, scenes started. Everything else lives in its own module.
 */
import * as Phaser from 'phaser';
import { DEFAULT_TUNING, GameWorld, buildMvpCampaign, loadSave, noopAds, pickShot, writeSave } from '@deeply-bubbly/core';
import type { Campaign, KeyValueStore, SaveData, Telemetry, Tuning } from '@deeply-bubbly/core';
import { CTX_KEY } from './context';
import type { GameContext, Settings } from './context';
import { debugButtons, debugEnabled } from './debug';
import { ZONE_PALETTES, css } from './palette';
import { attachResize, computeScale } from './scale';
import { attachOrientationOverlay } from './orientation';
import { BootScene, SCENE_KEYS } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { MapScene } from './scenes/MapScene';
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
 * the player's own unlocked one — and, being a request for a RUN, it also skips the world map the
 * boot would otherwise open on. It is how a QA pass or a screenshot bot reaches Zone 2 without
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

/**
 * The one recipe for "the game", shared with `createMvpWorld` in core: MVP campaign + real ports.
 *
 * `startStationIndex` is a PARAMETER, never a lookup: where a run begins is a choice the player makes
 * on the start screen (GDD §3.1, "se puede empezar la partida desde ahí"), and reading the save here
 * is exactly what made every run start at the deepest checkpoint with no way back to the surface.
 */
function buildWorld(
  tuning: Tuning,
  startStationIndex: number,
  viewH: number,
  ports: Ports,
): { world: GameWorld; campaign: Campaign } {
  const campaign = buildMvpCampaign(tuning);
  const world = new GameWorld({
    campaign,
    tuning,
    telemetry: ports.telemetry,
    ads: noopAds,
    store: ports.store,
    viewH,
    seed: SEED,
    startStationIndex,
  });
  return { world, campaign };
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
  const debugStart = debugStartStation();
  // A returning player's world is built at their unlocked station: the map may well be answered with
  // "the level I was on", and that world is then already the one the node promises.
  const built = buildWorld(tuning, debugStart ?? save.unlockedStation, scale.viewH, ports);

  const ctx: GameContext = {
    world: built.world,
    campaign: built.campaign,
    scale,
    settings,
    save,
    tuning,
    snapshot: null,
    // §8: the first-ever run opens on the wordless tutorial, never on a menu. The map is only owed to
    // someone who already has a checkpoint — and never to `?start=`, which asks for a run by name.
    mapPending: debugStart === null && save.unlockedStation >= 0,
    // A single mutable sample, written in place by PointerAdapter and read by GameScene every frame.
    pointer: { down: false, x: scale.viewW / 2, y: scale.viewH * 0.8 },
    // Published by GameScene's PointerAdapter while it is attached (see `ui/swallow.ts`).
    pointerOwner: null,
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
    // D5: one finger holds the minimap (peek) while the other pulls the sling, so the input manager
    // has to track two contacts. `PointerAdapter` owns exactly one of them; the HUD zone owns the other.
    input: { activePointers: 2 },
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

/** Payload of the 'newRun' channel: where the new run begins. -1 is the surface. */
interface NewRun {
  startStationIndex: number;
}

/**
 * The ONE way to start another run: throw the world away and build one at the requested station.
 * Core has no API for it (`restart()` returns early outside dead/gameOver, and a live run cannot be
 * re-based on another checkpoint), so this is the shell's only move — and since v1.3 it has exactly
 * one caller: a node tapped on the world map (`MapScene`), which is where every choice of where to
 * dive is now made. Everything scene-side is rebuilt by Boot, so no listener survives the swap.
 *
 * The save is NOT touched: `save.unlockedStation` is permanent meta-progression (§6.1) and core's
 * `persist` only ever raises it, so a run from the surface that dives past a station still banks it.
 */
function attachRunRouting(game: Phaser.Game, ctx: GameContext, ports: Ports): void {
  ctx.bus.on('newRun', ({ startStationIndex }: NewRun) => {
    // The run being thrown away may have banked a station: core writes that straight to the store, so
    // the shell's copy of the save is refreshed here rather than drifting for the rest of the session.
    Object.assign(ctx.save, loadSave(ports.store));
    const built = buildWorld(ctx.tuning, startStationIndex, ctx.scale.viewH, ports);
    ctx.world = built.world;
    ctx.campaign = built.campaign;
    ctx.snapshot = null;
    // The player has just chosen; the boot map would be the same question asked twice.
    ctx.mapPending = false;
    game.scene.stop(SCENE_KEYS.map);
    game.scene.stop(SCENE_KEYS.hud);
    game.scene.stop(SCENE_KEYS.game);
    game.scene.start(SCENE_KEYS.boot);
  });
  /**
   * The way OUT of a run (WORLD-MAP.md §3): the station screen's small "Mapa", the pause menu's
   * "Salir" and the campaign-complete screen all land here. The world is left exactly as it stands —
   * the next 'newRun' throws it away anyway — and the save is re-read first, because core banks a
   * station straight into the store and the map paints the node the player has just finished.
   */
  ctx.bus.on('toMap', () => {
    Object.assign(ctx.save, loadSave(ports.store));
    ctx.mapPending = false;
    game.scene.stop(SCENE_KEYS.hud);
    game.scene.stop(SCENE_KEYS.game);
    game.scene.start(SCENE_KEYS.map);
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
  if (!debugEnabled()) return;
  Object.defineProperty(globalThis, '__db', {
    configurable: true,
    value: {
      ctx,
      game,
      get world(): GameWorld {
        return ctx.world;
      },
      /** Live HUD buttons as CSS-px rects, so a test can press the real thing (see `debug.ts`). */
      buttons: () => debugButtons(ctx.scale),
      /** Keys of the running scenes: how a test tells the world map from a live run. */
      scenes: (): string[] => game.scene.getScenes(true).map((scene) => scene.scene.key),
      /**
       * The shot core would take from where Bur is standing (`game/autoPlayer.pickShot`), for the
       * screenshot bot of `e2e/tools/bot.mjs`. It is a READ of a core rule, not a rule: since
       * DECISIONS-v1.2 D1 the game rewards calculating the shot, so a bot that presses at a fixed
       * cadence never lands one and photographs nothing but the first ledge.
       */
      nextShot: () => pickShot(ctx.world.snapshot(), ctx.tuning),
      /**
       * The LIVE tuning the simulation is running — the tuning panel and the accessibility toggles
       * both replace it. Published so the test layer can read the gesture constants it drives the
       * game with instead of re-typing them: a `PULL_MAX_PX` that moved would otherwise turn every
       * drag in the suite into a wrong-power gesture that still passes.
       */
      get tuning(): Tuning {
        return ctx.tuning;
      },
      /**
       * D5: the streamed chunk window, so the peek e2e can assert what the spec actually promises —
       * a peek DOWN never shows water that is not streamed (`renderY + viewH <= bottomY`). Core keeps
       * the streamer private and publishes no accessor, so this reads it through a narrow cast; it
       * lives behind the same `?debug=1` gate as everything else here and nothing in the game uses it.
       */
      streamWindow: (): { topY: number; bottomY: number } =>
        (ctx.world as unknown as { streamer: { windowBounds(): { topY: number; bottomY: number } } }).streamer.windowBounds(),
    },
  });
}

function start(): Phaser.Game {
  const store = createStore();
  const ports: Ports = { store, telemetry: createTelemetry(store) };
  const ctx = buildContext(ports);

  const game = new Phaser.Game(gameConfig([BootScene, GameScene, HudScene, MapScene]));
  // Must be set before any scene's `create()` runs; the first scene step is a frame away.
  game.registry.set(CTX_KEY, ctx);

  attachResize(game, ctx);
  // The landscape curtain hides the game, so the game must stop: air kept draining and hazards kept
  // hitting behind it (SHELL.md, §8 "pausa automática al perder el foco").
  attachOrientationOverlay(strings().rotate, (landscape) => {
    if (landscape) ctx.bus.emit('autoPause');
  });
  attachRunRouting(game, ctx, ports);
  attachTelemetryFlush(ports);
  exposeDebugHandle(game, ctx);
  return game;
}

start();
