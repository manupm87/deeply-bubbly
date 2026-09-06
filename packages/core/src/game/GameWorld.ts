import { NEUTRAL_ENV, sampleForceFields } from '../physics/forceFields';
import { abortAim, canAirLaunch, createBubble, stepBubble } from '../bubble/bubbleStep';
import { pullPower } from '../control/pull';
import { cameraXRange, createCamera, stepCamera } from '../camera/camera';
import { peekBounds, stepPeek } from '../camera/peek';
import { pxToMeters, zoneAt } from '../level/depth';
import { WorldStreamer } from '../level/streaming';
import { createRunState, mayOfferSecondBreath, registerFailure } from '../run/runState';
import { deathRespawnPoint, resacaRespawnPoint } from '../run/respawn';
import { loadSave, writeSave } from '../run/save';
import { previewTrajectory, trajectoryDots } from './aimPreview';
import { advanceZone, createCheckpointState, crossBoyas, enterStation, reachedStation } from './checkpoints';
import { createBuckets, fillBuckets } from './entities';
import { TRAP_ESCAPE_POWER, createTrapState, escapeTrap, resetTrapState, stepHazards } from './hazards';
import { stepPickups } from './pickups';
import { pointerToWorld } from './pointer';
import { buildMinimap } from './minimap';
import { placeBubble } from './respawnFlow';
import { updateResaca } from './resaca';
import { createWorldWalls, updateWorldWalls } from './worldBounds';
import { clamp } from '../math/vec';
import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type {
  Bubble,
  Camera,
  GameEvent,
  GameMode,
  GamePhase,
  HudData,
  PointerInput,
  RunState,
  SolidEntity,
  WorldSnapshot,
  ZoneIndex,
} from '../types';
import type { AdProvider, KeyValueStore, Telemetry } from '../ports';
import type { Campaign } from '../level/campaign';
import type { SaveData } from '../run/save';
import type { CheckpointState } from './checkpoints';
import type { TrapState } from './hazards';
import type { WorldBuckets } from './entities';

export interface GameWorldDeps {
  campaign: Campaign;
  tuning: Tuning;
  telemetry: Telemetry;
  ads: AdProvider;
  store: KeyValueStore;
  /** Visible height in design px (320–420); can change on resize via setViewHeight. */
  viewH: number;
  /** D3: visible width in design px. Defaults to VIEW_W (180) — the world is WORLD_W (540) wide. */
  viewW?: number;
  seed: number;
  /** Start from this station index (checkpoint), -1 = surface. */
  startStationIndex?: number;
  /** §3.1 mode. 'expedicion' (the campaign) unless the shell asks for 'abismo'. */
  mode?: GameMode;
}

/** Slack (ms) when comparing an accumulated duration against a threshold; see `bubbleStep`. */
const TIME_EPS_MS = 1e-6;

/** Hard cap on the undrained event queue; see `update`. Two seconds of the busiest step imaginable. */
const MAX_QUEUED_EVENTS = 512;

/** Shared empty guide: not charging is by far the common case and it must not allocate (§11.5.10). */
const NO_TRAJECTORY: readonly Vec2[] = Object.freeze([]);

/**
 * Façade composing every core module into one deterministic simulation (§11). This is the ONLY thing the
 * shell talks to. Responsibilities: fixed-step accumulator (FIXED_DT, MAX_STEPS_PER_FRAME), streaming,
 * hazards (periodic phase, contact → loseAir('hit') + pushback), force fields, pickups, boyas (checkpoint),
 * stations (recharge to zone max, capacity change, immersionComplete, phase 'station'), zone changes (radius),
 * resaca detection with the camera, respawn, death flow (DEFLATE_MS → phase 'dead' → restart()), camera step,
 * trajectory preview while charging, telemetry, save on checkpoint.
 *
 * It owns no rule of its own: every one of those bullets is delegated to the module that owns it, and
 * what is written here is the ORDER (§11.4: physics, then the camera, then the frame) and the wiring.
 * Determinism (§11.7.14) is a property of that order plus the ban on `Date.now` — the only clock is
 * `nowMs`, the running sum of fixed steps.
 */
export class GameWorld {
  private t: Tuning;
  private readonly campaign: Campaign;
  private readonly telemetry: Telemetry;
  private readonly ads: AdProvider;
  private readonly store: KeyValueStore;
  private readonly streamer: WorldStreamer;

  private readonly buckets: WorldBuckets = createBuckets();
  /** Chunk solids plus the two column walls (§4.3); rebuilt in place every step. */
  private readonly stepSolids: SolidEntity[] = [];
  private readonly walls: ReturnType<typeof createWorldWalls>;
  private readonly checkpoints: CheckpointState;
  private readonly trap: TrapState = createTrapState();

  private bubble: Bubble;
  private camera: Camera;
  private readonly run: RunState;
  private save: SaveData;

  private nowMs = 0;
  /** Left-over frame time (ms) below one fixed step. */
  private accMs = 0;
  private phase: GamePhase = 'playing';
  private zone: ZoneIndex;
  private ascensoActive = false;
  /** Camera offset frozen at the start of the current finger contact (§2.1), or null when it is up. */
  private holdCam: Vec2 | null = null;
  /** D5: world point the player wants centred (minimap held), or null. Consumed by `stepPeek`. */
  private peekTarget: Vec2 | null = null;
  private trajectory: readonly Vec2[] = NO_TRAJECTORY;

  private readonly events: GameEvent[] = [];
  private readonly listeners = new Set<(e: GameEvent) => void>();

  /** Pearls and shells at the start of the current immersion, for the §3.3.5 summary. */
  private immersionPearls = 0;
  private immersionShells = 0;
  /** Pearls of this run already written to the save, so a second write cannot bank them twice (§6.1). */
  private bankedPearls = 0;

  constructor(deps: GameWorldDeps) {
    this.t = deps.tuning;
    this.campaign = deps.campaign;
    this.telemetry = deps.telemetry;
    this.ads = deps.ads;
    this.store = deps.store;
    this.streamer = new WorldStreamer(deps.campaign, deps.tuning);
    this.walls = createWorldWalls(deps.tuning);
    this.save = loadSave(deps.store);

    this.run = createRunState(deps.seed, deps.mode ?? 'expedicion');
    const start = this.startPoint(deps.startStationIndex ?? -1);
    this.zone = this.zoneOf(start.y);
    this.bubble = createBubble(start, this.zone, deps.tuning);
    this.bubble.air = Math.min(deps.tuning.AIR_START, this.bubble.airMax);
    this.camera = createCamera(start.y, deps.viewH, deps.tuning, start.x, deps.viewW ?? deps.tuning.VIEW_W);
    this.run.maxProgressY = start.y;

    this.checkpoints = createCheckpointState(this.zone);
    for (let i = 0; i <= this.run.lastStationIndex; i++) this.checkpoints.completedStations.add(i);
    this.streamer.update(start.y, false);
  }

  /** Advance by a rendered-frame delta (ms); runs 0..MAX_STEPS_PER_FRAME fixed steps. Pointer is in VIEWPORT design px. */
  update(frameDtMs: number, pointer: PointerInput): void {
    const t = this.t;
    const stepMs = t.FIXED_DT * 1000;
    if (!(stepMs > 0)) return;

    this.accMs += Number.isFinite(frameDtMs) ? Math.max(0, frameDtMs) : 0;
    let steps = Math.floor(this.accMs / stepMs);
    if (steps > t.MAX_STEPS_PER_FRAME) {
      // Spiral of death (§11.4): a frame that took 400 ms does NOT buy 24 steps of catch-up. The excess
      // is dropped, so the simulation runs slow for one frame instead of never catching up again.
      steps = t.MAX_STEPS_PER_FRAME;
      this.accMs = 0;
    } else {
      this.accMs -= steps * stepMs;
    }

    const from = this.events.length;
    for (let i = 0; i < steps; i++) this.step(pointer);
    this.dispatch(from);
    // §11.5.10: a shell that only subscribes with `onEvent` never calls `snapshot()`, and an 18–24
    // minute campaign would grow this array without bound. Every listener has already seen what is
    // dropped, and a shell that drains through `snapshot()` keeps the most recent events.
    if (this.events.length > MAX_QUEUED_EVENTS) this.events.splice(0, this.events.length - MAX_QUEUED_EVENTS);
  }

  /**
   * Read-only view for the renderer; drains the event queue.
   * `bubble`, `camera` and `run` are the LIVE objects, handed out for free: the renderer must treat
   * them as read-only. Mutating them from the shell corrupts the simulation and breaks §11.7.14.
   */
  snapshot(): WorldSnapshot {
    const events = this.events.slice();
    this.events.length = 0;
    return {
      timeMs: this.nowMs,
      bubble: this.bubble,
      camera: this.camera,
      run: this.run,
      zone: this.zone,
      entities: this.streamer.entities(),
      trajectory: this.trajectory,
      trajectoryDots: trajectoryDots(this.zone, this.t),
      hud: this.hud(),
      minimap: buildMinimap(this.streamer.entities(), this.camera, this.bubble, this.t),
      events,
      phase: this.phase,
    };
  }

  /** Player pressed "Otra vez" (from 'dead') — respawn at last boya/station in < RESTART_BUDGET_MS. */
  restart(): void {
    if (this.phase !== 'dead' && this.phase !== 'gameOver') return;
    this.respawnAtCheckpoint();
  }

  /**
   * §8 pause menu, "Reiniciar Inmersión": start the current immersion again from the last checkpoint
   * WITHOUT dying first. Same reset as `restart()` — which stays gated on 'dead'/'gameOver' so a stray
   * call during play cannot rewind the run — except that this one is the player asking for it out loud.
   * 'campaignComplete' is excluded: there is no immersion left to restart, the shell starts a new run.
   */
  restartImmersion(): void {
    if (this.phase === 'campaignComplete') return;
    this.respawnAtCheckpoint();
  }

  private respawnAtCheckpoint(): void {
    const point = deathRespawnPoint(this.run, this.campaign, this.t);
    // Outside a step, so `update`'s dispatch window will never see these: announce them here or a
    // shell that only subscribes with `onEvent` would never learn that Bur is back (§11.5.10).
    const from = this.events.length;
    this.push(placeBubble(this.bubble, point, this.nowMs, this.t));
    this.bubble.air = Math.min(this.t.AIR_START, this.bubble.airMax);
    // O(1): the campaign is already built and the streamer only re-instantiates the window it moves to.
    this.camera = createCamera(point.pos.y, this.camera.viewH, this.t, point.pos.x, this.camera.viewW);
    this.zone = this.zoneOf(point.pos.y);
    this.streamer.update(point.pos.y, false);
    this.resetTrap();
    this.endAscenso();
    this.holdCam = null;
    this.trajectory = NO_TRAJECTORY;
    this.phase = 'playing';
    this.dispatch(from);
  }

  /** Player pressed "Seguir bajando" (from 'station'). */
  continueDescent(): void {
    if (this.phase !== 'station') return;
    this.phase = 'playing';
  }

  setViewHeight(viewH: number): void {
    if (!Number.isFinite(viewH) || viewH <= 0) return;
    this.camera.viewH = viewH;
  }

  /**
   * D3: the view can be narrower or wider than VIEW_W on a resize; the follow band scales with it.
   * The clamp is re-applied here and not left to the next step, because `snapshot()` may be taken
   * between a resize and that step and the shell places the camera verbatim: a widened view would
   * otherwise report a right edge past WORLD_W for one frame.
   */
  setViewWidth(viewW: number): void {
    if (!Number.isFinite(viewW) || viewW <= 0) return;
    this.camera.viewW = viewW;
    this.camera.x = clamp(this.camera.x, 0, cameraXRange(viewW, this.t));
  }

  /**
   * Ends a live gesture without a shot (D2). The SHELL's route to `abortAim`, and the reason it has
   * to exist: every forced end of a finger contact that is not a deliberate release — an automatic
   * pause on blur or a hidden tab, a landscape prompt, a `pointercancel`, a drag that walks off the
   * canvas — arrives at core as `pointer.down = false`, which is a RELEASE and fires the shot. A
   * player coming back from a phone call must not find that her pull went off while she was away.
   * Idempotent: with no gesture running it does nothing and reports nothing.
   */
  /**
   * D5 peek: ask for the view to be centred on a WORLD point (the minimap finger), or `null` to let it
   * glide back to Bur. Presentation only — see `camera/peek.ts`. Safe to call every frame.
   */
  setPeek(target: Vec2 | null): void {
    this.peekTarget = target === null ? null : { x: target.x, y: target.y };
  }

  cancelAim(): void {
    const from = this.events.length;
    this.push(abortAim(this.bubble));
    // Dispatched here and not left to the next `update`: this is the one event source OUTSIDE the
    // step loop, and `update` only fans out what its own steps produced. A shell that is paused (the
    // exact case this method exists for) may not call `update` again for minutes.
    this.dispatch(from);
  }

  /** Replace tuning live (tuning panel). Derived values recomputed by the caller via createTuning. */
  setTuning(t: Tuning): void {
    this.t = t;
  }

  /** Subscribe to events as they happen (alternative to snapshot().events). */
  onEvent(listener: (e: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * §6.5: whether the "segundo aliento" rewarded slot may even be shown. Both halves must hold — the
   * player has failed enough (§11.7.8 guarantees free mercy arrives first) and the provider has an ad.
   * In the MVP the port is the no-op one, so this is always false and the slot stays laid out and dark.
   */
  mayOfferSecondBreath(): boolean {
    return mayOfferSecondBreath(this.run, this.t) && this.ads.isAvailable('segundoAliento');
  }

  // -------------------------------------------------------------------------------------------
  // The fixed step
  // -------------------------------------------------------------------------------------------

  /**
   * One step of FIXED_DT. The order is normative (§11.4 puts the camera "después de la física"): the
   * world is built around Bur, the fields are sampled at her pre-move position, she moves, the world
   * reacts, and only then do the camera and the frame bookkeeping run.
   */
  private step(pointer: PointerInput): void {
    const t = this.t;
    const dt = t.FIXED_DT;
    const dtMs = dt * 1000;
    const nowMs = this.nowMs;
    const bubble = this.bubble;

    // 1. Streaming window and the bodies of this step.
    this.streamer.update(bubble.pos.y, bubble.flags.ascensoUntil > nowMs);
    fillBuckets(this.buckets, this.streamer.entities());
    this.zone = this.zoneOf(bubble.pos.y);
    const solids = this.buildSolids();

    // 2. Force fields, sampled ONCE at the pre-move position and reused by everything below.
    const env =
      this.buckets.fields.length === 0
        ? NEUTRAL_ENV
        : sampleForceFields(bubble.pos, bubble.radius, this.buckets.fields);

    // 3. ASCENSO (§4.3). Set BEFORE the camera and the resaca read it, not after: the field was sampled
    //    at the start of this step, so the window it opens is in force for this step. Deferring it would
    //    give the resaca one step to fire inside a fumarola, which is the exact case §4.3 suspends.
    this.updateAscenso(env.opensAscenso, nowMs);
    const ascenso = bubble.flags.ascensoUntil > nowMs;

    // 4. Bur herself. The pointer arrives in VIEWPORT px and is converted to world here by
    //    `pointerToWorld` — BOTH axes since D3 widened the world to WORLD_W — with the camera offset
    //    FROZEN for the duration of the contact, exactly as `beginAim` freezes the origin. D2 is one
    //    promise — "con el origen congelado, dedo quieto = tiro quieto" — and it only holds if BOTH
    //    ends of the pull vector are frozen: the origin is in world coordinates and the finger in
    //    viewport ones, so re-adding a scrolling camera every step rotates the shot under a
    //    motionless thumb (the camera chases Bur on every descent and, since D3, sideways too).
    //    The freeze is captured on a step boundary like every other input, so §11.7.14's "dos órdenes
    //    de acumulador distintos" still produce the same world.
    //    Input is suppressed outside 'playing' (§3.3: a station is a pause, not a level) and while the
    //    anemone holds Bur (§5 nº 7: "atrapa 0,8 s", which is how long she cannot act).
    const blocked = this.phase !== 'playing' || nowMs < this.trap.pinUntil;
    // A suppressed step must not FIRE the gesture it is taking away: the synthetic pointer-up would
    // otherwise take `stepBubble`'s release branch and launch a shot the player never let go of
    // (crossing a station seam mid-pull). `abortAim` is the same cancel the state machine performs,
    // so the aim ends the one way D2 allows it to end without a shot.
    if (blocked) this.push(abortAim(bubble));
    const hold = this.pointerCam(pointer.down, bubble);
    const world = pointerToWorld(pointer, hold.x, hold.y);
    const accepted: PointerInput = { down: !blocked && pointer.down, x: world.x, y: world.y };
    const stepped = stepBubble(
      bubble,
      this.run,
      {
        pointer: accepted,
        solids,
        env,
        zone: this.zone,
        nowMs,
        dt,
        currentChunkId: this.streamer.currentChunk().chunk.id,
      },
      t,
    );
    this.push(stepped.events);
    // D2 gives one gesture per finger CONTACT, and a suppressed step is not a pointerup: without this
    // a finger held through the whole station summary would open a brand-new aim on the first step
    // after `continueDescent`, from a contact that already had its gesture.
    if (blocked && pointer.down) bubble.holdLatched = true;
    this.escapeTrapOnLaunch(stepped.events);
    // §2.4.2: the grace window expired inside `stepBubble`, which charged the pip; the anchor is ours.
    if (stepped.requestRespawn) {
      this.respawn(resacaRespawnPoint(bubble, this.run, this.camera, this.streamer.entities(), this.campaign, t));
    }

    // 5. Hazards, then pickups (§2.4.1, §2.5).
    const hazards = stepHazards(bubble, this.run, this.trap, { hazards: this.buckets.hazards, nowMs }, t);
    this.push(hazards.events);
    if (hazards.hitId !== null) {
      const data = { hazardId: hazards.hitId, depthM: this.depthM() };
      this.telemetry.track({ name: 'hazardHit', timeMs: nowMs, data });
    }

    const pickups = stepPickups(bubble, this.run, this.buckets.pickups, nowMs, t);
    this.push(pickups.events);
    for (const id of pickups.consumed) this.streamer.consume(id);

    // 6. Checkpoints and zone (§3.1, §3.3, §2.6).
    const boyas = crossBoyas(bubble, this.run, this.buckets.boyas, this.checkpoints);
    this.push(boyas);
    for (const event of boyas) {
      if (event.type !== 'boya') continue;
      this.telemetry.track({ name: 'boya', timeMs: nowMs, data: { boyaId: event.boyaId, depthM: this.depthM() } });
    }
    this.checkStation();
    this.push(advanceZone(this.run, this.zone, this.checkpoints));

    // 7. Resaca window (§2.4.2), then the camera (§11.4: after the physics).
    this.push(updateResaca(bubble, this.camera, { ascenso, playing: this.phase === 'playing', nowMs }, t));
    this.push(
      stepCamera(
        this.camera,
        { burX: bubble.pos.x, burY: bubble.pos.y, burVelY: bubble.vel.y, zone: this.zone, ascenso, nowMs, dt },
        t,
      ),
    );
    // 7b. D5 peek: a presentation offset layered on the placed camera; frozen while a pull is live.
    const streamWindow = this.streamer.windowBounds();
    stepPeek(
      this.camera,
      {
        target: this.peekTarget,
        hold: bubble.aimOrigin !== null,
        bounds: peekBounds(this.camera, streamWindow.topY, streamWindow.bottomY, t),
        dt,
      },
      t,
    );

    // 8. The guide (§2.7), predicted from the CURRENT pull with no force fields drawn. The cancel
    //    zone draws nothing (D2), and it is tested here as well as inside `previewTrajectory` so the
    //    common case keeps sharing the frozen empty array instead of allocating one per step.
    // A LIVE gesture, not the AIMING state: a rest capture parks a running aim in RESTING for one
    // step before the next input phase resumes it (see `enterRest`), and the pull the player is
    // holding must not blink out of the guide — nor out of the ring and the band the shell draws
    // beside it — for that frame.
    this.trajectory =
      bubble.aimOrigin !== null && !bubble.cancelZone
        ? previewTrajectory(bubble, solids, env, this.zone, nowMs, t)
        : NO_TRAJECTORY;

    // 9. Frame bookkeeping. `maxProgressY` is the progress ratchet of §4.3, distinct from `camera.maxY`.
    this.run.elapsedMs += dtMs;
    this.run.maxProgressY = Math.max(this.run.maxProgressY, bubble.pos.y);
    this.trackAirLosses(nowMs, stepped.events, hazards.events);

    // 10. Endings.
    this.checkDeath();
    this.checkCampaignEnd();

    this.nowMs = nowMs + dtMs;
  }

  /**
   * Camera offset used to convert the pointer this step (§2.1). It is captured when the contact
   * begins and held for as long as the gesture owns a frozen origin, so the WORLD point under a
   * motionless finger cannot move while the camera scrolls. With no live hold it simply tracks the
   * live camera, which is what makes the first step of a charge read the finger where the player
   * actually sees it — the origin is frozen on that same step.
   */
  private pointerCam(down: boolean, bubble: Bubble): Vec2 {
    // D5: the finger points at what is on the glass, so the peek is part of the offset (the lookahead
    // is not: it is 20 px of drift the frozen origin must not inherit — see `pointer.ts`).
    if (!down) {
      this.holdCam = null;
      return { x: this.camera.x + this.camera.peekX, y: this.camera.y + this.camera.peekY };
    }
    if (bubble.aimOrigin === null || this.holdCam === null) {
      this.holdCam = { x: this.camera.x + this.camera.peekX, y: this.camera.y + this.camera.peekY };
    }
    return this.holdCam;
  }

  /** Chunk solids plus the two column walls (§4.3). Rebuilt in place: a step must not allocate. */
  private buildSolids(): SolidEntity[] {
    const solids = this.stepSolids;
    solids.length = 0;
    for (const solid of this.buckets.solids) solids.push(solid);
    updateWorldWalls(this.walls, this.bubble.pos.y, this.zone, this.t);
    solids.push(this.walls[0], this.walls[1]);
    return solids;
  }

  /**
   * §4.3: the ascenso window lasts while Bur is inside an `opensAscenso` field and ASCENSO_TAIL_MS
   * after it. The flag is the "until" stamp of §11.3; the two events mark its edges exactly once.
   */
  private updateAscenso(inside: boolean, nowMs: number): void {
    if (inside) this.bubble.flags.ascensoUntil = nowMs + this.t.ASCENSO_TAIL_MS;
    const active = this.bubble.flags.ascensoUntil > nowMs;
    if (active === this.ascensoActive) return;
    this.ascensoActive = active;
    this.push([{ type: active ? 'ascensoStart' : 'ascensoEnd' }]);
  }

  /** §2.4.5: a launch of 60 % or more is the escape from the anemone, and the launch has just happened. */
  private escapeTrapOnLaunch(events: readonly GameEvent[]): void {
    if (this.trap.hazardId === null) return;
    for (const event of events) {
      if (event.type === 'launch' && event.power >= TRAP_ESCAPE_POWER) {
        escapeTrap(this.bubble, this.trap);
        return;
      }
    }
  }

  private respawn(point: ReturnType<typeof deathRespawnPoint>): void {
    this.push(placeBubble(this.bubble, point, this.nowMs, this.t));
    this.resetTrap();
    this.endAscenso();
  }

  /**
   * §4.3: `placeBubble` clears the ascenso stamp, because a teleport to a checkpoint must not carry a
   * window that widens the camera recall band to 640 px and suspends the resaca at the new point.
   * Clearing the stamp is only half of it — the pair of edge events has to close too, or the next
   * `updateAscenso` re-fires `ascensoStart` for a field Bur is no longer inside.
   */
  private endAscenso(): void {
    if (!this.ascensoActive) return;
    this.ascensoActive = false;
    this.push([{ type: 'ascensoEnd' }]);
  }

  /**
   * The zone a world y belongs to, clamped to the campaign's own column. Past `bottomY` the §11.1 table
   * still has zones — the MVP ends exactly on the Z2/Z3 border — but the run does not: without the clamp
   * the last fall of the campaign announced a `zoneChange` into a Zone 3 that does not exist yet and the
   * shell repainted to its palette for the frame before `campaignComplete`.
   */
  private zoneOf(worldY: number): ZoneIndex {
    return zoneAt(Math.min(worldY, this.campaign.bottomY - 1)).index;
  }

  private resetTrap(): void {
    resetTrapState(this.trap);
  }

  /**
   * §3.3: reaching the top of a station band ends the immersion. The simulation keeps running behind
   * the summary screen — Bur floats and rests as usual — but input is ignored until `continueDescent`.
   */
  private checkStation(): void {
    // DEAD is excluded on purpose: a deflate that happens to end past the seam must not refill the bar
    // the death flow is about to report as empty, nor open a summary screen over the end screen.
    if (this.phase !== 'playing' || this.bubble.state === 'DEAD') return;
    const station = reachedStation(this.bubble, this.buckets.stations, this.checkpoints);
    if (station === null) return;

    this.push(enterStation(this.bubble, this.run, station, this.checkpoints, this.t));
    this.push([
      {
        type: 'immersionComplete',
        immersionIndex: station.immersionIndex,
        pearls: this.run.pearls - this.immersionPearls,
        shells: this.run.shells - this.immersionShells,
      },
    ]);
    this.telemetry.track({
      name: 'immersionComplete',
      timeMs: this.nowMs,
      data: { immersionIndex: station.immersionIndex, depthM: this.depthM(), elapsedMs: this.run.elapsedMs },
    });
    this.persist(station.immersionIndex, station.immersionIndex, this.run.shells - this.immersionShells);
    // "Se revierte al superarla" (§4.2.3): `enterStation` cleared the mercy level, so the world thickens
    // again for the next immersion.
    this.streamer.bindRun(this.run);
    this.immersionPearls = this.run.pearls;
    this.immersionShells = this.run.shells;
    this.phase = 'station';
  }

  /**
   * §2.4: 700 ms of deflate, THEN the end screen. Leaving it is the player's call (`restart`).
   * 'station' is accepted as well as 'playing': the Z5–Z6 pressure clock (§2.4.4) keeps running while
   * a summary screen is open, so a player who walks away at a station can still run out of Air there,
   * and that must reach the end screen instead of parking the run in a phase nothing can leave.
   */
  private checkDeath(): void {
    if ((this.phase !== 'playing' && this.phase !== 'station') || this.bubble.state !== 'DEAD') return;
    if (this.bubble.deadMs + TIME_EPS_MS < this.t.DEFLATE_MS) return;
    this.phase = 'dead';
    registerFailure(this.run, this.t);
    // §11.7.8: the free, silent help arrives here — before any commercial offer, and without a word.
    this.streamer.bindRun(this.run);
    this.push([{ type: 'gameOver' }]);
    this.telemetry.track({
      name: 'gameOver',
      timeMs: this.nowMs,
      data: {
        depthM: this.depthM(),
        immersionIndex: this.run.immersionIndex,
        fails: this.run.failCountThisImmersion,
        mercyLevel: this.run.mercyLevel,
      },
    });
  }

  /** Past the bottom of the last placed chunk there is no more world (§11.1: 25.920 px). */
  private checkCampaignEnd(): void {
    if (this.phase !== 'playing') return;
    if (this.bubble.pos.y < this.campaign.bottomY) return;
    this.phase = 'campaignComplete';
    // The immersion being played when the column ends has no station to bank it: its conchas are
    // recorded here, under ITS index. Never under `lastStationIndex`, whose immersion was already
    // banked correctly when its station was entered.
    this.persist(this.run.lastStationIndex, this.run.immersionIndex, this.run.shells - this.immersionShells);
  }

  // -------------------------------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------------------------------

  private startPoint(startStationIndex: number): Vec2 {
    const last = this.campaign.immersions.length - 1;
    if (startStationIndex >= 0) {
      const index = Math.min(Math.trunc(startStationIndex), last);
      this.run.lastStationIndex = index;
      this.run.immersionIndex = index + 1;
    }
    // One chain, one answer: with no checkpoint it lands at the campaign start, just under the entry
    // anchor of the first chunk, so Bur rises into it on her own (§2.4, §8 step 1; respawn.ts).
    return deathRespawnPoint(this.run, this.campaign, this.t).pos;
  }

  private push(events: readonly GameEvent[]): void {
    for (const event of events) this.events.push(event);
  }

  private dispatch(from: number): void {
    if (this.listeners.size === 0) return;
    for (let i = from; i < this.events.length; i++) {
      const event = this.events[i];
      if (event === undefined) continue;
      for (const listener of this.listeners) listener(event);
    }
  }

  /** §12.1: "telemetría local: profundidad de cada pérdida de Aire", whichever of the five it was. */
  private trackAirLosses(nowMs: number, ...batches: readonly (readonly GameEvent[])[]): void {
    for (const batch of batches) {
      for (const event of batch) {
        if (event.type !== 'airLost') continue;
        this.telemetry.track({
          name: 'airLost',
          timeMs: nowMs,
          data: { reason: event.reason, air: event.air, depthM: pxToMeters(event.at.y) },
        });
      }
    }
  }

  private depthM(): number {
    return pxToMeters(this.bubble.pos.y);
  }

  /**
   * §6.1 / §12.1: the save is permanent meta-progression, not a report of the current run. Every field
   * is therefore monotonic — a fresh run can only ADD to what is banked, never overwrite it with its
   * own smaller counters. Perlas accumulate by delta (what this run has earned since the last write),
   * conchas keep the best haul of each immersion, and the two records take a `Math.max`.
   */
  private persist(unlockedStation: number, immersionIndex: number, shellsThisImmersion: number): void {
    const previous = this.save;
    const shells = { ...previous.shellsByImmersion };
    const haul = Math.max(0, shellsThisImmersion);
    if (immersionIndex >= 0 && haul > 0) shells[immersionIndex] = Math.max(shells[immersionIndex] ?? 0, haul);
    const earned = Math.max(0, this.run.pearls - this.bankedPearls);
    this.bankedPearls = this.run.pearls;
    this.save = {
      ...previous,
      unlockedStation: Math.max(previous.unlockedStation, unlockedStation),
      bestDepthM: Math.max(previous.bestDepthM, pxToMeters(this.run.maxProgressY)),
      pearls: previous.pearls + earned,
      shellsByImmersion: shells,
    };
    writeSave(this.store, this.save);
  }

  private hud(): HudData {
    const bubble = this.bubble;
    const aiming = bubble.state === 'AIMING';
    return {
      air: bubble.air,
      airMax: bubble.airMax,
      airMaxBase: this.t.AIR_MAX_BASE,
      depthM: this.depthM(),
      bestDepthM: Math.max(this.save.bestDepthM, pxToMeters(this.run.maxProgressY)),
      zone: this.zone,
      pearls: this.run.pearls,
      shells: this.run.shells,
      power: aiming ? pullPower(bubble.pullDist, this.t) : 0,
      lastPip: bubble.air > 0 && bubble.air <= 1,
      cancelZone: aiming && bubble.cancelZone,
      // Reported whatever Bur is doing, resting included: D1 makes the double jump a resource the
      // player budgets for the WHOLE descent, so the pip it will cost has to be visible before the
      // moment she needs it, not only once she is already falling.
      airLaunchAvailable: canAirLaunch(bubble, this.t),
    };
  }
}
