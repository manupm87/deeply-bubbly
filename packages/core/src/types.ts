/**
 * Entity and state types (GDD §11.2). All are flat, serializable data; no methods, no engine handles.
 * World coordinates: x ∈ [0, WORLD_W], y grows DOWNWARD from the water surface (y = 0).
 */
import type { Rect, Vec2 } from './math/vec';
import type { CeilingKind } from './tuning';

export type ZoneIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type Lane = 'L' | 'C' | 'R';
export type EntityId = string;

// ---------------------------------------------------------------------------------------------
// Bubble (Bur)
// ---------------------------------------------------------------------------------------------

/** Canonical input states (§11.3). No other route exists. */
export type BubbleState = 'IDLE' | 'CHARGING' | 'LAUNCHED' | 'RESTING' | 'DEAD';

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
  /** ms accumulated in the current CHARGING hold. */
  chargeMs: number;
  /** ms spent in the current RESTING contact. */
  restMs: number;
  /** ms since entering LAUNCHED. */
  launchedMs: number;
  /** ms since entering DEAD. */
  deadMs: number;
  /** Charge power [0,1] of the last launch (drives light radius, §11.4). */
  lastChargePower: number;
  /** Frozen at pointerdown (§2.1); aim direction is measured from here, never from live pos. */
  aimOrigin: Vec2 | null;
  /** Current aim angle in radians from straight-down (+ = right). */
  aimTheta: number;
  /** Last valid aim angle, kept when the pointer goes above the origin or too close (§2.1). */
  lastAimValid: number | null;
  /** Drag distance (px) from aimOrigin, for the ±15 % fine tune. */
  dragDist: number;
  /** Pips drained by overcharge during the current hold (cap OVERCHARGE_MAX_DRAIN). */
  overchargeDrained: number;
  /** Accumulator for the next overcharge drain tick. */
  overchargeTickMs: number;
  /**
   * True once the finger currently on the glass has had its hold. Press EDGES are derived from this
   * latch, never from `state`: the auto-release (§2.2) ends the gesture at 2.500 ms with the finger
   * still down, and a never-lifted finger must not start a second hold (nor a second overcharge
   * budget). Cleared on the first step the pointer is up.
   */
  holdLatched?: boolean;
  /**
   * True once `overchargeStart` was emitted for the current hold. The threshold moves mid-hold
   * (1.800 ms attached, 900 ms in the water, §2.3), so the tell is latched instead of being derived
   * from a threshold crossing: §2.2 has no silent drain.
   */
  overchargeAnnounced?: boolean;
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
  lane: Lane;
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

/** Single chunk schema of the project (§4.1, §11.2). Entities are in CHUNK-LOCAL coordinates (0..180, 0..240). */
export interface Chunk {
  id: string;
  zone: ZoneIndex;
  difficulty: 1 | 2 | 3 | 4 | 5;
  verbs: string[];
  entry: Lane;
  exit: Lane;
  entryAnchorId: EntityId;
  exitAnchorId: EntityId;
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
  y: number; // top of the viewport in world px
  maxY: number; // ratchet: never decreases
  recallPx: number;
  zoom: number; // 1 = normal; zoom punch modulates this
  zoomPunchUntil: number;
  shakePx: number;
  shakeUntil: number;
  viewH: number; // visible height in design px (320–420)
  /** §7 lookahead: smoothed offset (px) added to `y` for RENDERING only, never for the rules. */
  lookaheadPx: number;
  /** World y of the top of the view as it must be DRAWN: `y + lookaheadPx`. */
  renderY: number;
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
  /** Viewport coordinates (0..WORLD_W, 0..viewH). Only meaningful while `down`. */
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

export type AirLossReason = 'hit' | 'resaca' | 'overcharge' | 'pressure' | 'trap';
export type AirGainReason = 'pickup' | 'station' | 'bounceChain';

export type GameEvent =
  | { type: 'chargeStart'; at: Vec2 }
  | { type: 'launch'; power: number; vel: Vec2; at: Vec2 }
  | { type: 'bounce'; contact: Contact; speed: number; material: Ceiling['material'] | Wall['material'] }
  | { type: 'rest'; ceilingId: EntityId; kind: CeilingKind }
  | { type: 'restRelease'; reason: 'timeout' | 'launch' | 'displaced' }
  | { type: 'airLost'; reason: AirLossReason; air: number; at: Vec2 }
  | { type: 'airGained'; reason: AirGainReason; air: number; at: Vec2 }
  | { type: 'shieldUsed'; at: Vec2 }
  | { type: 'pickup'; pickup: Pickup }
  | { type: 'overchargeStart' }
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
  chargePower: number; // 0..1 while CHARGING
  overcharging: boolean;
  lastPip: boolean;
  fineTune: number; // -1..1
}

export type GamePhase = 'playing' | 'station' | 'dead' | 'gameOver' | 'campaignComplete';

export interface WorldSnapshot {
  timeMs: number;
  bubble: Readonly<Bubble>;
  camera: Readonly<Camera>;
  run: Readonly<RunState>;
  zone: ZoneIndex;
  /** Entities currently instantiated by the streamer, in WORLD coordinates. */
  entities: readonly WorldEntity[];
  /** Predicted arc while charging (world coords), exact until the first bounce (§2.7). */
  trajectory: readonly Vec2[];
  trajectoryDots: number;
  hud: HudData;
  /** Events produced since the previous snapshot; drained on read. */
  events: readonly GameEvent[];
  phase: GamePhase;
}
