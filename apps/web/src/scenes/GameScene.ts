/**
 * The world scene. Its whole job, once per frame: `world.update(delta, pointer)` → `snapshot()` →
 * hand the snapshot to the renderers → place the camera. It owns no game rule; the camera position,
 * the lookahead, the shake and the hitstop are all read from core, never computed here.
 *
 * `GameEvent`s are re-emitted on `ctx.bus` as `'gameEvent'` so the FX, audio and HUD modules can listen
 * without ever touching `GameWorld`. The source is the queue DRAINED BY `snapshot()`, never
 * `world.onEvent`: the world also pushes events outside a step (`restartImmersion` pushes `respawn`),
 * and the snapshot queue is the only channel that carries every one of them in order.
 * `FxDirector` is the single subscriber that turns them into juice: particles, audio, hitstop, shake
 * AND Bur's §7 deformation (through `BubbleView`'s hooks). This scene keeps only what needs the
 * simulation clock or the camera: the hitstop freeze, the zone textures and the camera placement.
 */
import * as Phaser from 'phaser';
import { DEFAULT_TUNING } from '@deeply-bubbly/core';
import type { GameEvent, Tuning, WorldSnapshot } from '@deeply-bubbly/core';
import { FxDirector } from '../fx/FxDirector';
import { createTuningPanel } from '../ui/TuningPanel';
import type { TuningPanel } from '../ui/TuningPanel';
import { getContext, type GameContext } from '../context';
import { ChargeOrbit } from '../render/ChargeOrbit';
import { layoutCamera, scrollCameraTo } from '../scale';
import { PointerAdapter } from '../input/PointerAdapter';
import { Background } from '../render/Background';
import { WorldRenderer } from '../render/WorldRenderer';
import { BubbleView } from '../render/BubbleView';
import { ChargeRing } from '../render/ChargeRing';
import { SlingBand } from '../render/SlingBand';
import { Trajectory } from '../render/Trajectory';
import { buildZoneTextures } from '../render/textures';
import { SCENE_KEYS } from './BootScene';

export class GameScene extends Phaser.Scene {
  private ctx!: GameContext;
  private background!: Background;
  private worldRenderer!: WorldRenderer;
  private bubbleView!: BubbleView;
  private ring!: ChargeRing;
  private band!: SlingBand;
  private orbit!: ChargeOrbit;
  private trajectoryView!: Trajectory;
  private pointerAdapter!: PointerAdapter;
  private fx!: FxDirector;
  private tuningPanel!: TuningPanel;

  private tuning: Tuning = DEFAULT_TUNING;
  private hitstopUntil = 0;
  private paused = false;
  private extraShakePx = 0;
  private extraShakeUntil = 0;
  /** Bus handlers kept so a scene restart (new campaign) does not leave a dead scene subscribed. */
  private readonly busHandlers: Array<[string, (...args: never[]) => void]> = [];

  constructor() {
    super(SCENE_KEYS.game);
  }

  /** Exposed so the FX module can drive Bur's hooks for beats core does not emit (tutorial, screens). */
  get bubble(): BubbleView {
    return this.bubbleView;
  }

  create(): void {
    const ctx = getContext(this);
    this.ctx = ctx;
    // Phaser reuses the SCENE INSTANCE across a stop/start, so every field that describes the run must
    // be reset here, not just at construction. A new run is always requested from a paused world (the
    // start screen and the pause menu both freeze it), and a surviving `paused = true` left the rebuilt
    // world never stepping at all: Bur frozen at the spawn point, `timeMs` stuck at 0, forever.
    this.paused = false;
    this.hitstopUntil = 0;
    this.extraShakePx = 0;
    this.extraShakeUntil = 0;

    const snapshot = ctx.world.snapshot();
    ctx.snapshot = snapshot;
    buildZoneTextures(this, snapshot.zone);

    const s = ctx.scale;
    this.background = new Background(this, snapshot.zone, s.viewW, s.viewH, ctx.tuning.WORLD_W);
    this.worldRenderer = new WorldRenderer(this, snapshot.zone, () => this.tuning);
    this.bubbleView = new BubbleView(this, () => this.tuning);
    this.ring = new ChargeRing(this);
    this.band = new SlingBand(this);
    this.orbit = new ChargeOrbit(this);
    this.trajectoryView = new Trajectory(this, () => this.tuning, ctx.settings);
    this.pointerAdapter = new PointerAdapter(this, ctx);
    this.pointerAdapter.attach();
    this.tuning = ctx.tuning;

    layoutCamera(this.cameras.main, s, snapshot.camera.renderY, snapshot.camera.renderX);
    // FX is built last: it must find the bubble view and a laid-out camera already in place.
    this.fx = new FxDirector(ctx, { bubbleView: this.bubbleView, camera: this.cameras.main, scene: this });
    this.tuningPanel = createTuningPanel(this, ctx);
    this.wireBus(ctx);
    this.input.keyboard?.on('keydown-D', () => this.toggleDebug());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  // -------------------------------------------------------------------------------------------

  private wireBus(ctx: GameContext): void {
    const on = <A extends unknown[]>(event: string, handler: (...args: A) => void): void => {
      ctx.bus.on(event, handler);
      this.busHandlers.push([event, handler as unknown as (...args: never[]) => void]);
    };

    on('pause', () => {
      this.paused = true;
      // Not a release: the world stops stepping here, and the synthetic pointer-up would otherwise be
      // read as one on the first step after "Seguir" — firing, at full power, a shot the player never
      // let go of. `abort` lifts the finger AND cancels the gesture in core (D2).
      this.pointerAdapter.abort();
      this.setPauseBlur(true);
    });
    on('resume', () => {
      this.paused = false;
      this.setPauseBlur(false);
    });
    // FX may ask for extra freeze/shake beyond what core already schedules (§7).
    on('hitstop', (ms: number) => {
      this.hitstopUntil = Math.max(this.hitstopUntil, this.time.now + ms);
    });
    on('shake', (px: number, ms: number) => {
      this.extraShakePx = px;
      this.extraShakeUntil = this.time.now + ms;
    });
    on('tuningChanged', (t: Tuning) => {
      this.tuning = t;
    });
    on('scaleChanged', () => {
      const snap = ctx.snapshot;
      layoutCamera(this.cameras.main, ctx.scale, snap ? snap.camera.renderY : 0, snap ? snap.camera.renderX : 0);
      this.background.resize(ctx.scale.viewW, ctx.scale.viewH);
    });
  }

  /**
   * Fan-out of one drained event. Bur's deformation, particles and audio all hang off the same bus
   * channel inside `FxDirector`; only the two beats that need this scene's own state are handled here.
   */
  private onGameEvent(e: GameEvent): void {
    this.ctx.bus.emit('gameEvent', e);
    switch (e.type) {
      case 'hitstop':
        this.hitstopUntil = Math.max(this.hitstopUntil, this.time.now + e.ms);
        break;
      case 'zoneChange':
        buildZoneTextures(this, e.to);
        this.background.setZone(e.to);
        this.worldRenderer.setZone(e.to);
        break;
      default:
        break;
    }
  }

  /**
   * §8: "congelación con desenfoque". A camera post-effect, so it costs nothing while it is off and
   * needs no second render target. Canvas has no postFX pipeline, hence the guard — the pause overlay
   * still dims the scene there, it simply is not blurred.
   */
  private setPauseBlur(on: boolean): void {
    const fx = this.cameras.main.postFX;
    if (!fx) return;
    fx.clear();
    if (on) fx.addBlur(1, 2, 2, 0.8);
  }

  toggleDebug(): void {
    this.worldRenderer.setDebug(!this.worldRenderer.debugEnabled);
  }

  // -------------------------------------------------------------------------------------------

  override update(time: number, delta: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Hitstop (§7: 40 ms on Air loss, 90 ms on pop) freezes the SIMULATION, not the presentation:
    // tweens and ambient life keep running so the frame does not look broken.
    // D5: the owned pointer is re-read here, not only from its events — a finger on the minimap can
    // swallow the DOM event that carried the pull's own move (see `PointerAdapter.sync`).
    this.pointerAdapter.sync();
    const frozen = this.paused || time < this.hitstopUntil;
    if (!frozen) ctx.world.update(delta, ctx.pointer);

    const snapshot = ctx.world.snapshot();
    ctx.snapshot = snapshot;
    // Single event source for the whole shell (see the header): whatever `snapshot()` just drained.
    for (const event of snapshot.events) this.onGameEvent(event);

    this.worldRenderer.sync(snapshot);
    this.bubbleView.sync(snapshot);
    this.ring.update(snapshot);
    this.orbit.update(snapshot, delta);
    this.band.update(snapshot, ctx.pointer);
    this.trajectoryView.update(snapshot);
    this.background.update(snapshot.timeMs, snapshot.camera.renderX, snapshot.camera.renderY, delta);
    this.fx.update();
    this.placeCamera(snapshot, time);
  }

  /**
   * The camera is placed, never computed: `camera.renderY` already carries core's ratchet plus the §7
   * lookahead. The ZOOM stays the integer design zoom — §8's "zoom = floor(w/180), siempre entero" is
   * the whole nearest-neighbour argument of the art, so neither core's zoom punch nor the FX layer's
   * charge zoom-out is allowed to multiply it (see `fx/Juice.ts`).
   */
  private placeCamera(snapshot: WorldSnapshot, time: number): void {
    const cam = snapshot.camera;

    let shake = 0;
    if (!this.ctx.settings.noShake) {
      // Core owns a shake channel of its own (`camera.shakePx`, reserved for §7's boss gates, which
      // the MVP has none of) and the FX layer announces the bounce shake on the bus. Whichever asks
      // for more wins; they are never added, so two systems can never stack into a 4 px lurch.
      const corePx = snapshot.timeMs < cam.shakeUntil ? cam.shakePx : 0;
      const fxPx = time < this.extraShakeUntil ? this.extraShakePx : 0;
      const amplitude = Math.max(corePx, fxPx);
      if (amplitude > 0) shake = (Math.random() * 2 - 1) * amplitude;
    }

    // D3: the camera also follows in X, and D5 lets the player peek sideways with the minimap. Both
    // are already resolved and clamped by core in `renderX` / `renderY` (the peek is a presentation
    // offset, never a rule), so the shell places exactly what it is given — the shake is the only
    // thing it is allowed to add.
    scrollCameraTo(this.cameras.main, this.ctx.scale, cam.renderY + shake, cam.renderX);
  }

  private teardown(): void {
    for (const [event, handler] of this.busHandlers) this.ctx.bus.off(event, handler);
    this.busHandlers.length = 0;
    this.tuningPanel?.destroy();
    this.fx?.destroy();
    this.pointerAdapter?.destroy();
    this.trajectoryView?.destroy();
    this.orbit?.destroy();
    this.band?.destroy();
    this.ring?.destroy();
    this.bubbleView?.destroy();
    this.worldRenderer?.destroy();
    this.background?.destroy();
  }
}
