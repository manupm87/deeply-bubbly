/**
 * Tunable constants (GDD §11.6). Every value here is a *starting* value subject to playtest tuning.
 * Units: px = design pixels (the world is WORLD_W = 540 wide, the view VIEW_W = 180 of it), ms, s, px/s, px/s².
 *
 * The live tuning panel edits a `Tuning` object created by `createTuning()`; `DEFAULT_TUNING` is frozen.
 * Derived values (e.g. TERMINAL_RISE) are recomputed by `createTuning`, never stored independently.
 */

export const ZONE_COUNT = 6;

/** Rest-surface quality (GDD §2.3). */
export type CeilingKind = 'posadero' | 'impaciente' | 'pegajosa';

/** Generic (non-const) helper so literal numbers widen to `number` while the object stays frozen. */
function defineTuning<T extends Record<string, unknown>>(t: T): Readonly<T> {
  return Object.freeze(t);
}

export const DEFAULT_TUNING = defineTuning({
  // --- Buoyancy & damping (§2.2) ---
  BUOYANCY: 100, // px/s² upward push ("inverted gravity")
  DAMPING_Y: 0.6, // 1/s
  DAMPING_X: 0.3, // 1/s — horizontal is preserved so wall chains work
  MAX_FALL_SPEED: 520, // px/s safety cap (positive = downward)

  // --- Impulse (§2.2, DECISIONS-v1.2 D4) ---
  IMPULSE_MIN: 90, // px/s (minimum pull that still counts as a shot) — DECISIONS-v1.2 D4
  IMPULSE_MAX: 280, // px/s (full pull) — DECISIONS-v1.2 D4

  // --- Slingshot gesture (DECISIONS-v1.2 D1, D2) ---
  PULL_MAX_PX: 70, // drag distance for full power
  PULL_CANCEL_PX: 12, // release inside this radius = cancel, no shot
  AIM_MAX_MS: 6000, // aiming longer than this cancels (never auto-fires)
  AIR_LAUNCHES_MAX: 1, // "double jump": mid-air launches per airborne phase
  AIR_LAUNCH_COST: 1, // pips per mid-air launch; never available on the last pip
  LONG_SLING_MUL: 1.5, // accessibility: longer pull for the same power

  // --- Aim (§2.1, revised D2: any non-upward direction) ---
  AIM_CONE_DEG: 90, // D2: the clamp is the horizontal, on the side the pull asked for
  AIM_DEADZONE_DEG: 5, // snap to straight down, so the commonest shot of the game is free
  AIM_BUOYANCY_MUL: 0.35, // §2.1 "apuntar ancla": buoyancy while an AIR aim is held (see integrator.ts)

  // --- Pressure (§2.6) ---
  RADIUS_BASE: 7,
  ZONE_RADIUS_PCT: [1.0, 0.92, 0.84, 0.74, 0.64, 0.55] as readonly number[],
  IMPULSE_RADIUS_EXP: 0.35,
  MAX_HOP_PX: [110, 105, 100, 95, 90, 80] as readonly number[], // D4
  MAX_HOP_X_PX: [200, 190, 180, 170, 160, 140] as readonly number[], // D4: max lateral gap between anchors
  REINFLATE_MS: 12000,
  MIN_SILHOUETTE_PX: 8,

  // --- Rest (§2.3) ---
  REST_CAPTURE_SPEED: 260, // px/s max approach speed (moving up) to capture
  REST_MAX_MS: { posadero: 3000, impaciente: 1200, pegajosa: 600 } as Readonly<Record<CeilingKind, number>>,
  REST_STICKY_IMPULSE_MUL: 0.6,
  REST_RELEASE_PUSH: 90, // px/s DOWNWARD when rest time is exhausted
  LAUNCH_LOCK_MS: 250,
  /** GDD §11.3 mentions lighter damping during LAUNCHED; kept at 1.0 so the §2.2 reach table stays exact. Tune in playtest. */
  LAUNCH_DAMPING_MUL: 1.0,

  // --- Materials ---
  RESTITUTION_ROCK: 0.55,
  RESTITUTION_JELLY: 0.92,
  RESTITUTION_SOFT: 0.18,
  RESTITUTION_HADAL_WALL: 0.85,
  BOUNCE_COOLDOWN_MS: 600,
  LATERAL_FRICTION: 0.08,

  // --- Air (§2.4, §2.5) ---
  AIR_START: 5,
  AIR_MAX_BASE: 8,
  ZONE_AIR_MAX: [8, 8, 7, 7, 6, 6] as readonly number[],
  INVULN_MS: 700,
  STUN_MS: 400,
  STUN_IMPULSE_MUL: 0.6,
  HIT_PUSHBACK: 120, // px/s
  RESACA_GRACE_MS: 1600,
  PRESSURE_DRAIN_S: 25, // Z5–Z6 only
  PRESSURE_DRAIN_FROM_ZONE: 4, // zero-based zone index (Z5)
  BOUNCE_CHAIN_REWARD: 5,
  TRAP_VENT_MS: 1500, // anemone: vents 1 air if still trapped
  TRAP_HOLD_MS: 800,
  TRAP_REARM_MS: 1500, // an anemone that just vented stays open that long (§5 nº 7: "recurso, no muerte")

  // --- Camera (§4.3, §11.4) ---
  CAM_LAMBDA: 12, // 1/s
  CAM_LAMBDA_FAST: 25,
  CAM_FAST_DIST_PX: 90,
  CAM_RECALL_PX: 96,
  CAM_RECALL_ASCENSO_PX: 640,
  ASCENSO_TAIL_MS: 2000,
  CAM_DEADZONE: [0.34, 0.56] as readonly [number, number],
  CAM_DEADZONE_X: [0.35, 0.65] as readonly [number, number], // D3: horizontal follow band (fraction of viewW)
  CAM_ANCHOR: 0.45, // target fraction of H where Bur sits
  CAM_LOOKAHEAD_PX: 20, // §7: the view leads Bur in the direction of travel
  CAM_LOOKAHEAD_LERP: 0.12, // per fixed step
  CAM_MIN_SCROLL: 8, // px/s from Z3 (zone index 2)
  CAM_MIN_SCROLL_FROM_ZONE: 2,
  CAM_ZOOM_PUNCH_SPEED: 420,
  CAM_ZOOM_PUNCH_PCT: 0.08,
  CAM_ZOOM_PUNCH_MS: 200,

  // --- Peek & minimap (DECISIONS-v1.2 D5: look around before committing a shot) ---
  PEEK_UP_PX: 120, // how far above the live camera the view may peek (world px)
  PEEK_DOWN_PX: 240, // how far below (one chunk); also clamped to the streamed chunks
  PEEK_LAMBDA: 14, // 1/s: the view chases the peek target
  PEEK_RETURN_LAMBDA: 5, // 1/s: the glide back once the minimap is released
  MINIMAP_SCALE: 0.1, // minimap px per world px (540 px world → 54 px map)
  MINIMAP_ABOVE_PX: 120, // world px shown above the live camera top
  MINIMAP_WORLD_H: 600, // world px tall (120 above + 480 below: every legal peek TARGET fits; the frame itself may leave the map)

  // --- World / chunks (§11.1, §11.5) ---
  WORLD_W: 540, // D3: three screens wide
  CHUNK_W: 540,
  VIEW_W: 180, // design viewport width (fixed)
  CHUNK_H: 240,
  CHUNK_REPEAT_WINDOW: 6,
  IMMERSION_CHUNKS: 6, // 5 playable + 1 rest station
  IMMERSION_PLAYABLE_CHUNKS: 5,
  BOYA_AFTER_CHUNK: 3,
  MAX_SEGMENT_S: 35,
  STREAM_CHUNKS: 4,
  STREAM_CHUNKS_ASCENSO: 5,
  DIFFICULTY_CAP: 4.6,
  MERCY_FAILS: [2, 4] as readonly [number, number],
  MERCY_DENSITY_MUL: [0.8, 0.65] as readonly [number, number],
  AD_OFFER_MIN_FAILS: 4,

  // --- Flow ---
  DEFLATE_MS: 700,
  RESTART_BUDGET_MS: 800,
  DEAD_IDLE_AUTO_MS: 8000,
  // "Buceo tranquilo" (§8): rest ×2 (3,0 s → 6,0 s), resaca grace ×1,5, pressure drain ×1,4.
  CALM_REST_MUL: 2,
  CALM_RESACA_GRACE_MUL: 1.5,
  CALM_PRESSURE_DRAIN_MUL: 1.4,

  // --- Presentation hints consumed by the shell (kept here so the panel can tune them) ---
  TRAJECTORY_DOTS: [6, 6, 5, 4, 3, 2] as readonly number[],
  LIGHT_RADIUS_BASE: 8,
  LIGHT_RADIUS_CHARGED: 14, // light of a full-power launch (§11.4)
  DEPTH_COUNTER_MAX_STEP_M: 9,

  // --- Simulation ---
  FIXED_DT: 1 / 60, // s
  MAX_STEPS_PER_FRAME: 6,
});

export type Tuning = { -readonly [K in keyof typeof DEFAULT_TUNING]: (typeof DEFAULT_TUNING)[K] };

/** Derived identity (§11.6): terminal upward speed. Never store it separately. */
export function terminalRise(t: Pick<Tuning, 'BUOYANCY' | 'DAMPING_Y'>): number {
  return t.BUOYANCY / t.DAMPING_Y;
}

/** Deep-copy the defaults, applying overrides (used by the live tuning panel and by tests). */
export function createTuning(overrides: Partial<Tuning> = {}): Tuning {
  // JSON round-trip is a safe deep copy here: tuning holds only numbers, strings, arrays and plain objects.
  const copy = JSON.parse(JSON.stringify(DEFAULT_TUNING)) as Tuning;
  return { ...copy, ...overrides };
}

/**
 * Difficulty: "Buceo tranquilo" (§8). The gentler of the two dives — the same game with more room:
 * every rest surface holds twice as long (posadero 3,0 s → 6,0 s, §2.3), the resaca grace window is
 * 1,5× wider (§2.4.2) and the Z5–Z6 pressure drain is 1,4× slower (§2.6). Nothing else moves: it is a
 * difficulty, never an easy mode.
 */
export function withCalmDive(t: Tuning): Tuning {
  const rest = {} as Record<CeilingKind, number>;
  for (const kind of Object.keys(t.REST_MAX_MS) as CeilingKind[]) {
    rest[kind] = (t.REST_MAX_MS[kind] ?? 0) * t.CALM_REST_MUL;
  }
  return {
    ...t,
    REST_MAX_MS: rest,
    RESACA_GRACE_MS: t.RESACA_GRACE_MS * t.CALM_RESACA_GRACE_MUL,
    PRESSURE_DRAIN_S: t.PRESSURE_DRAIN_S * t.CALM_PRESSURE_DRAIN_MUL,
  };
}

/**
 * Accessibility, DECISIONS-v1.2 D2: "carga lenta" no longer means anything once power is distance
 * instead of time, and is replaced by the LONG SLINGSHOT — the same power spread over `LONG_SLING_MUL`
 * times more travel, so every notch of power needs a longer, and therefore more accurate, drag.
 * It is the only gesture constant it touches: the cancel radius, the cone and the aim timeout are the
 * same for everyone.
 */
export function withLongSling(t: Tuning, mul: number = t.LONG_SLING_MUL): Tuning {
  return { ...t, PULL_MAX_PX: t.PULL_MAX_PX * mul };
}
