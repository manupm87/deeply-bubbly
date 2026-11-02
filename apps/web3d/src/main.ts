/**
 * Composition root of the Three.js shell: persistence ports, the `GameWorld`, the `GameContext`, the
 * stage and the routes. It owns no game rule and no drawing, like `apps/web/src/main.ts`.
 */
import './ui/style.css';
import { DEFAULT_TUNING, GameWorld, buildMvpCampaign, loadSave, noopAds, pickShot, writeSave } from '@deeply-bubbly/core';
import type { Campaign, KeyValueStore, SaveData, Telemetry, Tuning } from '@deeply-bubbly/core';
import { Bus } from './bus';
import type { GameContext, Settings } from './context';
import { debugButtons, debugEnabled } from './debug';
import { Shell } from './game/Shell';
import { attachOrientationOverlay } from './orientation';
import { createStore } from './platform/LocalStorageStore';
import { applySettingsToTuning, settingsFromSave, settingsToSave } from './platform/settings';
import { createTelemetry } from './platform/Telemetry';
import { ModelRegistry } from './render/ModelRegistry';
import { Stage } from './render/Stage';
import { computeScale } from './scale';
import { setSafeAreaInsetTopCss } from './ui/layout';
import { S } from './ui/strings';

/** Fixed simulation seed: the campaign is authored, not generated, so one seed is enough (§11.7.14). */
const SEED = 1;
const TUTORIAL_REST_MS = 600_000;

interface Ports {
  store: KeyValueStore;
  telemetry: Telemetry;
}

/** `?start=N` boots a run at that station and skips the map; gated like `__db`. Never persisted. */
function debugStartStation(): number | null {
  if (!debugEnabled()) return null;
  const raw = new URLSearchParams(globalThis.location.search).get('start');
  if (raw === null) return null;
  const index = Number.parseInt(raw, 10);
  return Number.isFinite(index) && index >= 0 ? index : null;
}

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
 * Until the first real hop, a resting ledge is patient: its anti-camping clock would otherwise kick Bur
 * off while a newcomer is still watching the ghost hand.
 */
function withTutorial(t: Tuning, tutorialDone: boolean): Tuning {
  return tutorialDone ? t : { ...t, REST_MAX_MS: { ...t.REST_MAX_MS, posadero: TUTORIAL_REST_MS } };
}

function buildContext(ports: Ports, startStation: number): GameContext {
  const save = loadSave(ports.store);
  const settings: Settings = settingsFromSave(save);
  const scale = computeScale(globalThis.innerWidth, globalThis.innerHeight);
  let base: Tuning = DEFAULT_TUNING;
  const tuning = withTutorial(applySettingsToTuning(base, settings), save.tutorialDone);
  const built = buildWorld(tuning, startStation === -2 ? save.unlockedStation : startStation, scale.viewH, ports);
  const bus = new Bus();
  const ctx: GameContext = {
    world: built.world,
    campaign: built.campaign,
    scale,
    settings,
    save,
    tuning,
    snapshot: null,
    pointer: { down: false, x: scale.viewW / 2, y: scale.viewH * 0.8 },
    bus,
    applyTuning(t) {
      base = t;
      retune();
    },
    persistSettings() {
      // Re-read first: core writes the save on every checkpoint, and settings must not clobber it.
      const current = loadSave(ports.store);
      const merged: SaveData = { ...settingsToSave(current, ctx.settings), tutorialDone: ctx.save.tutorialDone };
      writeSave(ports.store, merged);
      Object.assign(ctx.save, merged);
    },
  };
  const retune = (): void => {
    ctx.tuning = withTutorial(applySettingsToTuning(base, ctx.settings), ctx.save.tutorialDone);
    ctx.world.setTuning(ctx.tuning);
    bus.emit('tuningChanged', ctx.tuning);
  };
  bus.on('settingsChanged', () => {
    retune();
    ctx.persistSettings();
  });
  // Core keeps the save it loaded when the world was built and writes all of it back at a station, so
  // a tutorial finished or a setting changed since then would be undone. Written again right after.
  bus.on('gameEvent', (event) => {
    if (event.type === 'immersionComplete') ctx.persistSettings();
  });
  return ctx;
}

function applyScale(ctx: GameContext, ui: HTMLElement): void {
  const s = ctx.scale;
  ui.style.width = `${s.viewW}px`;
  ui.style.height = `${s.viewH}px`;
  ui.style.transform = `translate(${s.offsetX}px, ${s.offsetY}px) scale(${s.zoom})`;
  // CSS px per design px: touch targets are "44 / zoom" in this scaled tree.
  ui.style.setProperty('--zoom', String(s.zoom));
  // For `--inset-top` in the stylesheet: a letterboxed column may already start below the notch.
  ui.style.setProperty('--offset-y', `${s.offsetY}px`);
}

function attachResize(ctx: GameContext, ui: HTMLElement): void {
  globalThis.addEventListener('resize', () => {
    // Rotation moves the notch: forget it on every route, or the next run's HUD reads a stale one.
    setSafeAreaInsetTopCss(null);
    Object.assign(ctx.scale, computeScale(globalThis.innerWidth, globalThis.innerHeight));
    ctx.world.setViewHeight(ctx.scale.viewH);
    ctx.world.setViewWidth(ctx.scale.viewW);
    applyScale(ctx, ui);
    ctx.bus.emit('scaleChanged');
  });
}

/** The one way to start another run: throw the world away and build one at the requested station. */
function attachRunRouting(ctx: GameContext, shell: Shell, ports: Ports): void {
  ctx.bus.on('newRun', ({ startStationIndex }) => {
    Object.assign(ctx.save, loadSave(ports.store));
    const built = buildWorld(ctx.tuning, startStationIndex, ctx.scale.viewH, ports);
    ctx.world = built.world;
    ctx.campaign = built.campaign;
    ctx.snapshot = null;
    shell.enterRun();
  });
  // The world is left as it stands: the next 'newRun' throws it away. The save is re-read because core
  // banks a station straight into the store, and the map paints the node just finished.
  ctx.bus.on('toMap', () => {
    // The end of the campaign banks with no event to answer: this is the first chance to repair it.
    ctx.persistSettings();
    Object.assign(ctx.save, loadSave(ports.store));
    shell.enterMap();
  });
}

function attachTelemetryFlush(ports: Ports): void {
  const flush = (): void => (ports.telemetry as { flush?: () => void }).flush?.();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') flush();
  });
  globalThis.addEventListener('pagehide', flush);
}

function exposeDebugHandle(ctx: GameContext, shell: Shell, stage: Stage, models: ModelRegistry): void {
  if (!debugEnabled()) return;
  Object.defineProperty(globalThis, '__db', {
    configurable: true,
    value: {
      ctx,
      shell,
      stage,
      get world(): GameWorld {
        return ctx.world;
      },
      get tuning(): Tuning {
        return ctx.tuning;
      },
      buttons: debugButtons,
      scenes: (): string[] => shell.scenes(),
      nextShot: () => pickShot(ctx.world.snapshot(), ctx.tuning),
      /** What the landing marker promises for the pull being held. */
      landing: () => {
        const f = shell.aim.forecast;
        return f && { ceilingId: f.ceiling?.id ?? null, progress: f.progress, hazard: f.hazardAt !== null };
      },
      /** Core keeps the streamer private; a narrow read behind the same gate as everything here. */
      streamWindow: (): { topY: number; bottomY: number } =>
        (ctx.world as unknown as { streamer: { windowBounds(): { topY: number; bottomY: number } } }).streamer.windowBounds(),
      /** Draw calls and memory of the last frame (WEB3D.md budget: under 150 draw calls). */
      renderInfo: () => stage.info(),
      perf: () => shell.perf(),
      /** The presentation's own numbers, which no screenshot can show one frame at a time. */
      feel: () => ({
        particles: shell.fx.particles.liveCount,
        camera: { x: shell.fx.camera.x, y: shell.fx.camera.y, zoom: shell.fx.camera.zoom, shake: shell.fx.camera.shakeOffset().amplitude },
        bubble: shell.bubble.pose(),
        audio: shell.fx.audio.readMeter(),
      }),
      startAudioMeter: () => shell.fx.audio.startMeter(),
      audit: () => shell.worldView.audit(ctx.world.snapshot()),
      /** Where a world point on the play plane is drawn, in css px. */
      project: (x: number, y: number) => stage.project(x, y),
      models: () => ({ ...models.status(), burUsesModel: shell.bubble.usesModel, ready: models.ready }),
    },
  });
}

function start(): void {
  const canvas = document.getElementById('stage');
  const ui = document.getElementById('ui');
  if (!(canvas instanceof HTMLCanvasElement) || !ui) throw new Error('index.html is missing #stage or #ui');
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  let stage: Stage;
  try {
    stage = new Stage(canvas);
  } catch (error) {
    console.error('WebGL unavailable', error);
    const message = document.createElement('div');
    message.id = 'rotate';
    message.className = 'no-webgl';
    message.textContent = S.noWebgl;
    document.body.appendChild(message);
    return;
  }

  const store = createStore();
  const ports: Ports = { store, telemetry: createTelemetry(store) };
  const debugStart = debugStartStation();
  const ctx = buildContext(ports, debugStart ?? -2);
  applyScale(ctx, ui);

  const models = new ModelRegistry(import.meta.env.BASE_URL);
  const shell = new Shell(ctx, stage, ui, models);
  attachResize(ctx, ui);
  attachRunRouting(ctx, shell, ports);
  attachTelemetryFlush(ports);
  // The landscape curtain hides the game, so the game must stop.
  attachOrientationOverlay(S.rotate, (landscape) => {
    if (landscape) ctx.bus.emit('autoPause');
  });
  exposeDebugHandle(ctx, shell, stage, models);

  // §8: the first-ever run opens on the wordless tutorial, never on a menu. The map is owed to someone
  // who already has a checkpoint, and never to `?start=`, which asks for a run by name.
  if (debugStart === null && ctx.save.unlockedStation >= 0) shell.enterMap();
  else shell.enterRun();
}

start();
