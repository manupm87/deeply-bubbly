/**
 * Entity and state types (GDD §11.2). All are flat, serializable data; no methods, no engine handles.
 * World coordinates: x ∈ [0, WORLD_W], y grows DOWNWARD from the water surface (y = 0).
 */
import type { Rect, Vec2 } from './math/vec';
import type { CeilingKind } from './tuning';

export type ZoneIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type EntityId = string;

// ---------------------------------------------------------------------------------------------
// Bubble (Bur)
// ---------------------------------------------------------------------------------------------

/**
 * Canonical input states (§11.3, renamed by DECISIONS-v1.2 D2). No other route exists.
 * `AIMING` replaces v1.1's `CHARGING`: power is pull DISTANCE now, so nothing is being charged.
 */
export type BubbleState = 'IDLE' | 'AIMING' | 'LAUNCHED' | 'RESTING' | 'DEAD';

/** Orthogonal flags (§11.3), each stored as an "until" timestamp in simulation ms (0 = inactive). */
export interface BubbleFlags {
  invulnUntil: number;
  stunUntil: number;
  reinflateUntil: number;
  ascensoUntil: number;
  /** Simulation time at which the current resaca (off-top) grace period expires; 0 when not in resaca. */
  resacaUntil: number;
  /** Time at which the anemone trap vents air; 0 when not trapped. */
  trapVentAt: number;
}

/**
 * A solid Bur passes straight through until `until` (simulation ms). Two rules produce these:
 * the trampoline cooldown (§2.2: a medusa deflates for 600 ms after a bounce) and the ceiling Bur has
 * just left, ignored for LAUNCH_LOCK_MS so it cannot re-capture her on the way out (§11.3).
 */
export interface PassThrough {
  id: EntityId;
  until: number;
}

export interface Bubble {
  pos: Vec2;
  vel: Vec2;
  /** Current radius in px (zone pressure + temporary reinflate). */
  radius: number;
  air: number;
  airMax: number;
  state: BubbleState;
  /** ms spent in the current RESTING contact. */
  restMs: number;
  /** ms since entering LAUNCHED. */
  launchedMs: number;
  /** ms since entering DEAD. */
  deadMs: number;
  /** Power [0,1] of the last launch (drives light radius, §11.4). */
  lastLaunchPower: number;
  /**
   * Frozen at pointerdown (D2): the POINTER's world position, not Bur's. The pull is measured from
   * here, so a still finger is a still shot however far Bur drifts while she aims.
   */
  aimOrigin: Vec2 | null;
  /** Pull distance in px from `aimOrigin` to the pointer; power is `pullDist / PULL_MAX_PX` (D2). */
  pullDist: number;
  /** Launch angle in radians from straight down (+ = right), already clamped to the cone (D2). */
  pullTheta: number;
  /** ms accumulated in the current AIMING gesture; cancels at AIM_MAX_MS (D2). */
  aimMs: number;
  /** False while the pull asks to go UP and the direction was clamped to the horizontal (amber guide). */
  aimValid: boolean;
  /** True while the pull is shorter than PULL_CANCEL_PX: releasing now cancels the shot (D2). */
  cancelZone: boolean;
  /** Mid-air launches spent in the current airborne phase (cap AIR_LAUNCHES_MAX); 0 again on rest (D1). */
  airLaunchesUsed: number;
  /**
   * True once the finger currently on the glass has had its gesture. Press EDGES are derived from this
   * latch, never from `state`: the AIM_MAX_MS timeout (D2) ends the gesture with the finger still
   * down, and a never-lifted finger must not start a second aim. Cleared on the first step the
   * pointer is up.
   */
  holdLatched?: boolean;
  restingOnId: EntityId | null;
  lastRestingCeilingId: EntityId | null;
  bounceChain: number;
  bounceChainBodies: EntityId[];
  bounceChainRewardedInChunk: string | null;
  /** Accumulator for passive pressure drain (Z5–Z6). */
  pressureDrainMs: number;
  /** Solids collision skips this tick (absent = none); pruned every step by `stepBubble`. */
  passThrough?: PassThrough[];
  flags: BubbleFlags;
}

// ---------------------------------------------------------------------------------------------
// Static / kinematic world entities
// ---------------------------------------------------------------------------------------------

export interface MovingSpec {
  axis: 'x' | 'y';
  speed: number; // px/s
  range: number; // px, total travel (oscillates around the base position)
  phase?: number; // 0..1 initial phase
}

/** Solid rectangle. Only the BOTTOM face of a `capturable` ceiling captures Bur into RESTING (§2.3). */
export interface Ceiling {
  type: 'ceiling';
  id: EntityId;
  rect: Rect; // w ≥ 20, h ≥ 8
  kind: CeilingKind;
  capturable: boolean;
  restitution: number;
  /** Overrides REST_MAX_MS[kind] when present. */
  maxRestMs?: number;
  /** Trampoline cooldown; after a bounce Bur passes through for this long (jellyfish). */
  bounceCooldownMs?: number;
  moving?: MovingSpec;
  /** Marine snow: dissolves this many ms after first contact. */
  dissolveMs?: number;
  /** Visual material hint for the renderer. */
  material: 'rock' | 'coral' | 'kelp' | 'jelly' | 'snow' | 'shell' | 'foam' | 'creature';
  /**
   * GDD §5 catalogue number 1-25 when this ceiling IS a catalogue creature (Medusa Farolillo nº 1,
   * Alga Cinta nº 2, Tortuga Paseante nº 3 ...). Fauna that costs no Air is a `Ceiling`, not a
   * `Hazard`, but §11.5.5 ("las dos primeras instancias de un catalogId") is didactic, not damage
   * based: without this the rule cannot see three of Zone 1's four catalogue entries.
   */
  catalogId?: number;
}

/** Side walls and floors: solid both ways, never capturable. */
export interface Wall {
  type: 'wall';
  id: EntityId;
  rect: Rect;
  restitution: number;
  material: 'rock' | 'reef' | 'hadal';
}

/** Declared rest point; consumed by the reach rule (§11.5.11), respawn (§2.4) and tests. */
export interface Anchor {
  type: 'anchor';
  id: EntityId;
  ceilingId: EntityId;
  pos: Vec2; // Bur's centre when resting under the ceiling
}

export type PushDir = 'lateral' | 'down' | 'up';

/**
 * Which face of its ledge a crown grows from (§5 nº 6, nº 7). Authoring vocabulary lives in
 * `level/content/builders.ts`; the type is here because the RENDERER reads it — a crown on a lip hangs
 * downward and its art has to be turned over (§8, silhouette first) — and because the trap-escape rule
 * of §2.4.5 is about exactly this choice.
 */
export type CrownGrowth = 'shoulder' | 'lip';

export interface Hazard {
  type: 'hazard';
  id: EntityId;
  /** GDD §5 catalogue number 1–25. */
  catalogId: number;
  shape: Rect;
  airCost: 1;
  /** Periodic hazards: ms per cycle and current phase offset in ms. */
  periodMs?: number;
  phaseMs?: number;
  /** Warning window before the dangerous part of the cycle. */
  tellMs?: number;
  /** Fraction of the cycle [0,1) during which the hazard is dangerous (default 1 = always). */
  activeFraction?: number;
  pushImpulse?: number; // px/s
  pushDir: PushDir; // 'up' only allowed for catalogId 20 and 21 (§11.7.9)
  moving?: MovingSpec;
  /** Anemone-style trap: holds Bur, then vents air (§2.4.5). */
  trap?: boolean;
  /** Seat on its ledge (§5 nº 6/7). Absent means 'shoulder', the ledge's top face. */
  growth?: CrownGrowth;
}

export type ForceFieldType = 'corriente' | 'fumarola' | 'salmuera' | 'frio' | 'descendente';

export interface ForceField {
  type: 'forcefield';
  id: EntityId;
  rect: Rect;
  fieldType: ForceFieldType;
  /** Acceleration added to velocity each second while overlapping (px/s²). */
  vector: Vec2;
  buoyancyMul: number;
  impulseMul: number;
  chargeMul: number;
  opensAscenso: boolean;
  /**
   * GDD §5 catalogue number 1-25 when this field IS a catalogue entry (Corriente de Arrecife nº 8,
   * Fumarola nº 21 ...). Same reason as `Ceiling.catalogId`: §11.5.5 ("las dos primeras apariciones de
   * un peligro nuevo salen solas") is a DIDACTIC rule, not a damage one, and the verb of Zone 2 is a
   * force field. Without this the rule cannot see the first new thing Zone 2 teaches.
   */
  catalogId?: number;
}

export type PickupType = 'aire' | 'aireGrande' | 'perla' | 'perlaGrande' | 'concha';

export interface Pickup {
  type: 'pickup';
  id: EntityId;
  pos: Vec2;
  pickupType: PickupType;
  value: number;
  radius: number;
}

/** Silent mid-immersion respawn point (§3.1). */
export interface Boya {
  type: 'boya';
  id: EntityId;
  worldY: number;
  immersionIndex: number;
}

export interface RestStation {
  type: 'station';
  id: EntityId;
  worldY: number; // top of the 240 px station band
  zoneFrom: ZoneIndex;
  zoneTo: ZoneIndex;
  isDelivery: boolean;
  tutorialVerb?: string;
  immersionIndex: number;
}

export type WorldEntity = Ceiling | Wall | Anchor | Hazard | ForceField | Pickup | Boya | RestStation;
export type SolidEntity = Ceiling | Wall;

// ---------------------------------------------------------------------------------------------
// Level structure
// ---------------------------------------------------------------------------------------------

/**
 * Single chunk schema of the project (§4.1, §11.2). Entities are in CHUNK-LOCAL coordinates
 * (0..CHUNK_W, 0..CHUNK_H).
 *
 * DECISIONS-v1.2 D3 removed the `L/C/R` lanes and the entry mouth: in a 540 px world the continuity
 * between chunks is guaranteed by the 2D reach rule between anchors (D4) and by nothing else. What a
 * chunk still declares is WHERE that ladder starts and ends.
 */
export interface Chunk {
  id: string;
  zone: ZoneIndex;
  difficulty: 1 | 2 | 3 | 4 | 5;
  verbs: string[];
  entryAnchorId: EntityId;
  exitAnchorId: EntityId;
  /**
   * D3: alternative exit anchors a wide chunk offers. The validator certifies the declared route
   * (`exitAnchorId`) and, when this is present, that every candidate is a real anchor of the chunk —
   * "puede haber varios anclajes de salida candidatos, pero el validador certifica al menos la ruta
   * declarada".
   */
  exitAnchorIds?: EntityId[];
  airBudget: number;
  targetTimeS: number;
  tags: string[];
  /** 'station' chunks are the 6th chunk of an immersion; 'fixed' chunks are never shuffled. */
  role: 'playable' | 'tutorial' | 'boss' | 'station' | 'transition' | 'opening';
  entities: WorldEntity[];
}

/** A placed chunk: the library chunk plus its world offset. */
export interface PlacedChunk {
  chunk: Chunk;
  index: number; // position in the campaign sequence
  worldY: number; // top edge in world coordinates
  immersionIndex: number;
}

export interface Immersion {
  index: number;
  zone: ZoneIndex;
  chunkIds: string[]; // length IMMERSION_CHUNKS; last one is the station
  startY: number;
  boyaY: number;
  stationY: number;
}

// ---------------------------------------------------------------------------------------------
// Camera, run, input
// ---------------------------------------------------------------------------------------------

export interface Camera {
  /** D3: left edge of the viewport in world px, always inside [0, WORLD_W - viewW]. */
  x: number;
  y: number; // top of the viewport in world px
  maxY: number; // ratchet: never decreases
  recallPx: number;
  zoom: number; // 1 = normal; zoom punch modulates this
  zoomPunchUntil: number;
  shakePx: number;
  shakeUntil: number;
  /** D3: visible width in design px (VIEW_W = 180); the world is three of these wide. */
  viewW: number;
  viewH: number; // visible height in design px (320–420)
  /** §7 lookahead: smoothed offset (px) added to `y` for RENDERING only, never for the rules. */
  lookaheadPx: number;
  /** World y of the top of the view as it must be DRAWN: `y + lookaheadPx + peekY`. */
  renderY: number;
  /**
   * Peek ("ojeo", DECISIONS-v1.2 D5): a PRESENTATION offset the player asks for through the minimap
   * to look around before committing a shot. Added to `x` / `y` for drawing and for reading the finger
   * (the finger points at what is on the glass), never for the rules: resaca, recall band, dead zones
   * and the ratchet keep reading `x` / `y`. Zero while nobody is peeking; glides back to zero on release.
   */
  peekX: number;
  peekY: number;
  /** World x of the left edge of the view as it must be DRAWN: `x + peekX`. */
  renderX: number;
}

export type GameMode = 'expedicion' | 'abismo';

export interface RunState {
  seed: number;
  mode: GameMode;
  immersionIndex: number;
  lastBoyaId: EntityId | null;
  lastStationIndex: number; // -1 before the first station
  /** Progress ratchet in world px: never decreases (distinct from camera.maxY). */
  maxProgressY: number;
  pearls: number;
  shells: number;
  failCountThisImmersion: number;
  mercyLevel: 0 | 1 | 2;
  shieldAvailable: boolean; // shell shield absorbs the first hit of each zone
  elapsedMs: number; // simulation time
}

/** Pointer input sampled once per rendered frame by the shell, in DESIGN px of the viewport. */
export interface PointerInput {
  down: boolean;
  /** Viewport coordinates (0..viewW, 0..viewH). Only meaningful while `down`. */
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------------------------
// Physics contact
// ---------------------------------------------------------------------------------------------

export type ContactFace = 'bottom' | 'top' | 'left' | 'right';

export interface Contact {
  bodyId: EntityId;
  body: SolidEntity;
  /** Which face of the BODY was hit (bottom = Bur came from below, moving up). */
  face: ContactFace;
  normal: Vec2; // unit, pointing away from the body toward Bur
  point: Vec2;
  /** Approach speed along the normal before resolution (px/s, positive). */
  approachSpeed: number;
  /** Simulation time of the contact. */
  timeMs: number;
}

// ---------------------------------------------------------------------------------------------
// Events emitted to the presentation layer (SFX, particles, haptics, HUD)
// ---------------------------------------------------------------------------------------------

/** D1 replaces v1.1's 'overcharge' with 'airLaunch': the optional pip a mid-air launch costs. */
export type AirLossReason = 'hit' | 'resaca' | 'airLaunch' | 'pressure' | 'trap';
export type AirGainReason = 'pickup' | 'station' | 'bounceChain';

export type GameEvent =
  /** `at` is the frozen `aimOrigin` (the finger), not Bur. `fromRest` is false for an air aim (D1). */
  | { type: 'aimStart'; at: Vec2; fromRest: boolean }
  /**
   * 'zone' = released inside PULL_CANCEL_PX, 'timeout' = AIM_MAX_MS, 'displaced' = Bur lost the ledge
   * (or the world took the gesture away), 'noAir' = the mid-air launch the release asked for is the
   * one D1 refuses on the last pip, so the shot is declined instead of fired.
   */
  | { type: 'aimCancel'; reason: 'zone' | 'timeout' | 'displaced' | 'noAir' }
  | { type: 'launch'; power: number; vel: Vec2; at: Vec2; airLaunch: boolean }
  | { type: 'bounce'; contact: Contact; speed: number; material: Ceiling['material'] | Wall['material'] }
  | { type: 'rest'; ceilingId: EntityId; kind: CeilingKind }
  | { type: 'restRelease'; reason: 'timeout' | 'launch' | 'displaced' }
  | { type: 'airLost'; reason: AirLossReason; air: number; at: Vec2 }
  | { type: 'airGained'; reason: AirGainReason; air: number; at: Vec2 }
  | { type: 'shieldUsed'; at: Vec2 }
  | { type: 'pickup'; pickup: Pickup }
  | { type: 'resacaWarning' }
  | { type: 'respawn'; at: Vec2; anchorKind: 'ceiling' | 'chunkEntry' | 'boya' | 'station' }
  | { type: 'boya'; boyaId: EntityId }
  | { type: 'stationEnter'; station: RestStation }
  | { type: 'zoneChange'; from: ZoneIndex; to: ZoneIndex }
  | { type: 'deflate'; at: Vec2 }
  | { type: 'gameOver' }
  | { type: 'immersionComplete'; immersionIndex: number; pearls: number; shells: number }
  | { type: 'ascensoStart' }
  | { type: 'ascensoEnd' }
  | { type: 'zoomPunch'; pct: number; ms: number }
  | { type: 'hitstop'; ms: number };

// ---------------------------------------------------------------------------------------------
// Snapshot: the ONLY thing the renderer reads (read-only view of the world after a step)
// ---------------------------------------------------------------------------------------------

export interface HudData {
  air: number;
  airMax: number; // zone capacity (+ upgrades)
  airMaxBase: number; // AIR_MAX_BASE, dimmed pips beyond airMax
  depthM: number; // exact, unsmoothed
  bestDepthM: number;
  zone: ZoneIndex;
  pearls: number;
  shells: number;
  power: number; // 0..1 while AIMING (pull distance over PULL_MAX_PX)
  lastPip: boolean;
  /** True while the pull is inside PULL_CANCEL_PX: the ring is drawn empty, "here there is no shot". */
  cancelZone: boolean;
  /** True while the "double jump" of D1 is still available (a pip to spend and a launch left). */
  airLaunchAvailable: boolean;
}

export type GamePhase = 'playing' | 'station' | 'dead' | 'gameOver' | 'campaignComplete';

// ---------------------------------------------------------------------------------------------
// Minimap (DECISIONS-v1.2 D5): what the shell draws in the corner, in MINIMAP px (already scaled)
// ---------------------------------------------------------------------------------------------

export type MinimapMarkKind = 'ledge' | 'ledgeNoRest' | 'hazard' | 'pickup' | 'field' | 'boya' | 'station';

/** One thing worth drawing on the minimap, as a rect in minimap px (points are 1x1 rects). */
export interface MinimapMark {
  kind: MinimapMarkKind;
  rect: Rect;
}

/**
 * Pure model of the minimap for one frame. Coordinates are MINIMAP px: `world * MINIMAP_SCALE`, with
 * the map's top-left at world `(0, worldTopY)`. The map is anchored on the LIVE camera (`camera.y`), not
 * on the peeked view, so the frame the player drags moves inside a still map.
 */
export interface MinimapModel {
  /** Size of the map in minimap px (`WORLD_W * MINIMAP_SCALE` × `MINIMAP_WORLD_H * MINIMAP_SCALE`). */
  w: number;
  h: number;
  scale: number;
  /** World y shown at the top edge of the map (`camera.y - MINIMAP_ABOVE_PX`). */
  worldTopY: number;
  /** The view as DRAWN (with the peek), in minimap px; may be partly outside the map when peeking. */
  view: Rect;
  /** Bur's centre in minimap px. */
  bur: Vec2;
  /** Marks inside the map, clipped to it. */
  marks: readonly MinimapMark[];
}

export interface WorldSnapshot {
  timeMs: number;
  bubble: Readonly<Bubble>;
  camera: Readonly<Camera>;
  run: Readonly<RunState>;
  zone: ZoneIndex;
  /** Entities currently instantiated by the streamer, in WORLD coordinates. */
  entities: readonly WorldEntity[];
  /** Predicted arc while aiming (world coords), exact until the first bounce (§2.7). */
  trajectory: readonly Vec2[];
  trajectoryDots: number;
  hud: HudData;
  /** D5: minimap of the world around the camera, rebuilt on every snapshot. */
  minimap: MinimapModel;
  /** Events produced since the previous snapshot; drained on read. */
  events: readonly GameEvent[];
  phase: GamePhase;
}
