/**
 * Tunable constants (GDD §11.6). Every value here is a *starting* value subject to playtest tuning.
 * Units: px = design pixels (world is 180 px wide), ms, s, px/s, px/s².
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

  // --- Impulse & charge (§2.1, §2.2) ---
  IMPULSE_MIN: 150, // px/s (dry tap)
  IMPULSE_MAX: 430, // px/s (full charge, neutral drag)
  CHARGE_FULL_MS: 550,
  CHARGE_EXP: 1.3,
  MASTERY_WINDOW_MS: 170,
  OVERCHARGE_MS: 900,
  OVERCHARGE_MS_RESTING: 1800,
  OVERCHARGE_DRAIN_MS: 500,
  OVERCHARGE_MIN_AIR: 1, // hard floor: overcharge never takes the last pip
  OVERCHARGE_MAX_DRAIN: 2, // per hold
  AUTO_RELEASE_MS: 2500,
  MIN_TAP_MS: 70,
  CHARGING_BUOYANCY_MUL: 0.35,
  DRAG_FINE_TUNE: 0.15, // ±15 %, neutral at DRAG_NEUTRAL_PX
  DRAG_NEUTRAL_PX: 45,
  DRAG_MAX_PX: 90,

  // --- Aim (§2.1) ---
  AIM_CONE_DEG: 62,
  AIM_DEADZONE_DEG: 5,
  AIM_GAIN: 1.5,
  AIM_MIN_RADIUS: 18, // px, anti-jitter

  // --- Pressure (§2.6) ---
  RADIUS_BASE: 7,
  ZONE_RADIUS_PCT: [1.0, 0.92, 0.84, 0.74, 0.64, 0.55] as readonly number[],
  IMPULSE_RADIUS_EXP: 0.35,
  MAX_HOP_PX: [200, 195, 185, 175, 165, 150] as readonly number[],
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

  // --- Camera (§4.3, §11.4) ---
  CAM_LAMBDA: 12, // 1/s
  CAM_LAMBDA_FAST: 25,
  CAM_FAST_DIST_PX: 90,
  CAM_RECALL_PX: 96,
  CAM_RECALL_ASCENSO_PX: 640,
  ASCENSO_TAIL_MS: 2000,
  CAM_DEADZONE: [0.34, 0.56] as readonly [number, number],
  CAM_ANCHOR: 0.45, // target fraction of H where Bur sits
  CAM_MIN_SCROLL: 8, // px/s from Z3 (zone index 2)
  CAM_MIN_SCROLL_FROM_ZONE: 2,
  CAM_ZOOM_PUNCH_SPEED: 420,
  CAM_ZOOM_PUNCH_PCT: 0.08,
  CAM_ZOOM_PUNCH_MS: 200,

  // --- World / chunks (§11.1, §11.5) ---
  WORLD_W: 180,
  CHUNK_W: 180,
  CHUNK_H: 240,
  CHUNK_MOUTH_MIN_W: 64,
  LANE_X: { L: 40, C: 90, R: 140 } as Readonly<Record<'L' | 'C' | 'R', number>>,
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
  SLOW_CHARGE_MUL: 1.6,

  // --- Presentation hints consumed by the shell (kept here so the panel can tune them) ---
  TRAJECTORY_DOTS: [6, 6, 5, 4, 3, 2] as readonly number[],
  LIGHT_RADIUS_BASE: 8,
  LIGHT_RADIUS_CHARGED: 14,
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

/** Accessibility: "carga lenta" scales *every* gesture time by the same factor (§8). */
export function withSlowCharge(t: Tuning, mul: number = t.SLOW_CHARGE_MUL): Tuning {
  return {
    ...t,
    CHARGE_FULL_MS: t.CHARGE_FULL_MS * mul,
    OVERCHARGE_MS: t.OVERCHARGE_MS * mul,
    OVERCHARGE_MS_RESTING: t.OVERCHARGE_MS_RESTING * mul,
    OVERCHARGE_DRAIN_MS: t.OVERCHARGE_DRAIN_MS * mul,
    AUTO_RELEASE_MS: t.AUTO_RELEASE_MS * mul,
  };
}
