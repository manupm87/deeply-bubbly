/**
 * The frame loop and the routes (map or run). Once per frame during a run: `world.update(delta, pointer)`
 * → `snapshot()` → hand the snapshot to the views → place the camera at `renderX/renderY`. The camera
 * position, the lookahead and the hitstop's cause are all read from core, never computed here.
 *
 * `GameEvent`s come from the queue DRAINED BY `snapshot()`, re-emitted on the bus: the world also pushes
 * events outside a step (`restartImmersion`), and this is the only channel that carries all of them.
 */
import type { GameEvent, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { FxDirector } from '../fx/FxDirector';
import { PointerAdapter } from '../input/PointerAdapter';
import { AimViews } from '../render/AimViews';
import { Atmosphere } from '../render/Atmosphere';
import { Background } from '../render/Background';
import { Backdrop } from '../render/Backdrop';
import { DebugOverlay } from '../render/DebugOverlay';
import { BubbleView } from '../render/BubbleView';
import { MaterialBank } from '../render/materials';
import type { ModelRegistry } from '../render/ModelRegistry';
import type { Stage } from '../render/Stage';
import { WorldView } from '../render/WorldView';
import { MapMenu } from '../ui/MapMenu';
import { RunUi } from '../ui/RunUi';

export type Route = 'map' | 'run';

/** A frame longer than this is a stall (tab switch, debugger), not time the presentation should show. */
const MAX_PRESENTATION_DT_MS = 100;
const PERF_SAMPLES = 240;

export class Shell {
  route: Route = 'map';
  readonly worldView: WorldView;
  readonly bubble: BubbleView;
  readonly fx: FxDirector;
  private readonly aim: AimViews;
  private readonly background: Background;
  private readonly backdrop: Backdrop;
  private readonly atmosphere: Atmosphere;
  private overlay: DebugOverlay | null = null;
  private readonly pointer: PointerAdapter;
  private runUi: RunUi | null = null;
  private map: MapMenu | null = null;
  private paused = false;
  private hitstopUntil = 0;
  private extraShakePx = 0;
  private extraShakeUntil = 0;
  private lastFrame = 0;
  /** Frames the loop has presented; lets a test wait for "a frame after this" without a clock. */
  frames = 0;
  /** Rolling samples for `__db.perf()`: time between frames, and time this code spent inside one. */
  private readonly frameMs = new Float32Array(PERF_SAMPLES);
  private readonly workMs = new Float32Array(PERF_SAMPLES);

  constructor(
    private readonly ctx: GameContext,
    private readonly stage: Stage,
    private readonly uiRoot: HTMLElement,
    models: ModelRegistry,
  ) {
    const snapshot = ctx.world.snapshot();
    ctx.snapshot = snapshot;
    const bank = new MaterialBank(snapshot.zone);
    this.worldView = new WorldView({ bank, models, tuning: () => ctx.tuning });
    this.bubble = new BubbleView(models, () => ctx.tuning);
    this.aim = new AimViews(ctx.settings);
    this.background = new Background(ctx.tuning.WORLD_W);
    this.backdrop = new Backdrop(models, () => ctx.tuning);
    this.atmosphere = new Atmosphere(stage);
    this.fx = new FxDirector(ctx, this.bubble);
    stage.scene.add(this.background.root, this.backdrop.root, this.atmosphere.rays, this.worldView.root, this.bubble.root, this.fx.particles.mesh, this.aim.root);
    stage.resize(ctx.scale);

    this.pointer = new PointerAdapter(stage.renderer.domElement, ctx);

    ctx.bus.on('pause', () => {
      this.paused = true;
      // Not a release: the world stops stepping here, and a synthetic pointer-up would be read as one
      // on the first step after "Seguir", firing a shot the player never let go of. Disabling aborts,
      // and also keeps a press on the bars beside the menu from becoming an aim on resume.
      this.pointer.setEnabled(false);
      stage.setBlur(true);
    });
    ctx.bus.on('resume', () => {
      this.paused = false;
      this.pointer.setEnabled(true);
      stage.setBlur(false);
    });
    ctx.bus.on('hitstop', (ms) => {
      this.hitstopUntil = Math.max(this.hitstopUntil, this.lastFrame + ms);
    });
    ctx.bus.on('shake', (px, ms) => {
      this.extraShakePx = px;
      this.extraShakeUntil = this.lastFrame + ms;
    });
    ctx.bus.on('gameEvent', (e) => this.runUi?.handleEvent(e));
    ctx.bus.on('scaleChanged', () => {
      stage.resize(ctx.scale);
      this.runUi?.layout();
    });
    requestAnimationFrame(this.frame);
  }

  /** Scene keys in `apps/web`'s vocabulary, so a test can tell the map from a live run the same way. */
  scenes(): string[] {
    return this.route === 'map' ? ['Map'] : ['Game', 'Hud'];
  }

  enterRun(): void {
    this.leaveCurrent();
    this.route = 'run';
    this.paused = false;
    this.hitstopUntil = 0;
    this.extraShakeUntil = 0;
    this.stage.setBlur(false);
    this.stage.setVisible(true);
    const snapshot = this.ctx.world.snapshot();
    this.ctx.snapshot = snapshot;
    this.worldView.clear();
    this.bubble.reset();
    this.ctx.pointer.down = false;
    this.pointer.setEnabled(true);
    this.fx.audio.setActive(true);
    this.runUi = new RunUi(this.uiRoot, this.ctx);
  }

  enterMap(): void {
    this.leaveCurrent();
    this.route = 'map';
    this.paused = false;
    this.stage.setBlur(false);
    this.stage.setVisible(false);
    this.pointer.setEnabled(false);
    this.fx.audio.setActive(false);
    this.map = new MapMenu(this.uiRoot, this.ctx);
  }

  private leaveCurrent(): void {
    this.pointer.setEnabled(false);
    this.runUi?.destroy();
    this.runUi = null;
    this.map?.destroy();
    this.map = null;
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const delta = this.lastFrame === 0 ? 16.67 : now - this.lastFrame;
    this.lastFrame = now;
    if (this.route !== 'run') return;

    const ctx = this.ctx;
    // Hitstop (§7) freezes the SIMULATION, not the presentation: FX and tweens keep running.
    const frozen = this.paused || now < this.hitstopUntil;
    if (!frozen) ctx.world.update(delta, ctx.pointer);
    const snapshot = ctx.world.snapshot();
    ctx.snapshot = snapshot;
    for (const event of snapshot.events) this.onGameEvent(event, now);
    // A screen raised by one of those events may have ended the run this very frame.
    if (this.route !== 'run') return;

    const dt = Math.min(delta, MAX_PRESENTATION_DT_MS);
    this.worldView.sync(snapshot);
    this.bubble.sync(snapshot, dt);
    this.aim.sync(snapshot, ctx.pointer, dt);
    this.fx.update(dt);
    this.placeCamera(snapshot, now);
    const cam = snapshot.camera;
    this.atmosphere.update(cam.renderX, cam.renderY, cam.viewW, cam.viewH, snapshot.timeMs / 1000);
    this.backdrop.update(cam.renderX, cam.renderY, cam.viewW, cam.viewH, snapshot.bubble.pos.x, snapshot.timeMs, dt, this.atmosphere.water.middle);
    this.background.setRocksVisible(!this.backdrop.active);
    this.background.update(this.stage.camera, this.stage.distance, cam.renderY, cam.viewW, cam.viewH, this.atmosphere.water);
    this.overlay?.update(snapshot);
    this.stage.render();
    this.runUi?.update(snapshot, dt);
    const slot = this.frames % PERF_SAMPLES;
    this.frameMs[slot] = delta;
    this.workMs[slot] = performance.now() - now;
    this.frames++;
  };

  /** Debug only: draws core's collision boxes over the models. */
  setCollisionOverlay(on: boolean): void {
    if (on && !this.overlay) {
      this.overlay = new DebugOverlay();
      this.stage.scene.add(this.overlay.lines);
    } else if (!on && this.overlay) {
      this.stage.scene.remove(this.overlay.lines);
      this.overlay = null;
    }
  }

  /** Frame time over the last samples (ms): mean, 95th percentile and the part spent in this code. */
  perf(): { samples: number; frameMean: number; frameP95: number; workMean: number; workP95: number } {
    const n = Math.min(this.frames, PERF_SAMPLES);
    const stats = (a: Float32Array): { mean: number; p95: number } => {
      const v = Array.from(a.subarray(0, n)).sort((x, y) => x - y);
      return { mean: v.reduce((s, x) => s + x, 0) / Math.max(1, n), p95: v[Math.floor(n * 0.95)] ?? 0 };
    };
    const f = stats(this.frameMs);
    const w = stats(this.workMs);
    return { samples: n, frameMean: f.mean, frameP95: f.p95, workMean: w.mean, workP95: w.p95 };
  }

  private onGameEvent(e: GameEvent, now: number): void {
    this.ctx.bus.emit('gameEvent', e);
    if (e.type === 'hitstop') this.hitstopUntil = Math.max(this.hitstopUntil, now + e.ms);
    else if (e.type === 'bounce') this.worldView.react(e.contact.bodyId, 'bounce');
    else if (e.type === 'rest') this.worldView.react(e.ceilingId, 'rest');
  }

  /**
   * Placed, never computed: `renderX/renderY` already carry core's ratchet, lookahead and peek. Core's
   * shake channel and the FX layer's bounce shake are never added: whichever asks for more wins.
   */
  private placeCamera(snapshot: WorldSnapshot, now: number): void {
    const cam = snapshot.camera;
    let shake = 0;
    if (!this.ctx.settings.noShake) {
      const corePx = snapshot.timeMs < cam.shakeUntil ? cam.shakePx : 0;
      const fxPx = now < this.extraShakeUntil ? this.extraShakePx : 0;
      const amplitude = Math.max(corePx, fxPx);
      if (amplitude > 0) shake = (Math.random() * 2 - 1) * amplitude;
    }
    this.stage.place(cam.renderX, cam.renderY + shake, cam.viewW, cam.viewH);
  }
}
