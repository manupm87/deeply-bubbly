import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { Bubble, Contact, GameEvent, PointerInput, RunState, SolidEntity, ZoneIndex } from '../types';
import type { PhysicsEnv } from '../physics/forceFields';

export interface BubbleStepInput {
  /** Pointer in WORLD coordinates (shell converts viewport -> world using camera.y). */
  pointer: PointerInput;
  /** Solids near Bur (streamer output), world coordinates. */
  solids: readonly SolidEntity[];
  env: PhysicsEnv;
  zone: ZoneIndex;
  nowMs: number;
  dt: number;
  /** Id of the chunk Bur is currently in (for the once-per-chunk bounce-chain reward). */
  currentChunkId: string;
}

export interface BubbleStepResult {
  events: GameEvent[];
  contacts: Contact[];
  /** Set when the state machine requests a respawn (air reached 0 handled elsewhere; this is for RESACA timeout). */
  requestRespawn: boolean;
}

/**
 * One fixed step of the bubble state machine (§11.3) + physics (§11.4). Mutates `bubble` in place.
 * Responsibilities, in order:
 *  1. DEAD: advance deadMs; no input; return.
 *  2. Input edge detection: pointerdown → start CHARGING (freeze aimOrigin = bubble.pos, chargeMs = 0) from IDLE or RESTING;
 *     pointerup → if chargeMs < MIN_TAP_MS: ignore (return to previous state: IDLE, or stay RESTING if it was resting);
 *     else launch: vel = launchVelocity(theta, impulseMagnitude(...)) [ASSIGNMENT], state = LAUNCHED, launchedMs = 0.
 *  3. CHARGING: chargeMs += dt*1000; compute aim from the frozen origin; overcharge drain after OVERCHARGE_MS
 *     (OVERCHARGE_MS_RESTING when charging from rest) every OVERCHARGE_DRAIN_MS via loseAir('overcharge');
 *     auto-release at AUTO_RELEASE_MS. Buoyancy at CHARGING_BUOYANCY_MUL. While charging from RESTING, position stays pinned.
 *  4. RESTING: vel = 0, restMs += dt; pressure drain frozen; after maxRestMs → push DOWN at REST_RELEASE_PUSH, state IDLE,
 *     event restRelease('timeout'). Ignore the ceiling we rest on for LAUNCH_LOCK_MS after leaving it.
 *  5. IDLE/LAUNCHED: integrate velocity, move with moveCircle. For each contact:
 *     - face 'bottom' && body is capturable ceiling && vel.y < 0 && approachSpeed <= REST_CAPTURE_SPEED && not within LAUNCH_LOCK → RESTING (event rest)
 *     - otherwise bounce (event bounce), update bounceChain (distinct bodies; reward +1 air at BOUNCE_CHAIN_REWARD once per chunk)
 *     - trampoline (capturable=false with bounceCooldownMs) → add to ignore set until cooldown expires
 *  6. Passive pressure drain in zones >= PRESSURE_DRAIN_FROM_ZONE every PRESSURE_DRAIN_S (frozen while RESTING).
 *  7. Flags expiry (stun, invuln, reinflate, ascenso).
 * Hazards, pickups, boyas, stations and camera are NOT handled here (GameWorld does it) — this module is about Bur's own motion.
 */
export function stepBubble(bubble: Bubble, run: RunState, input: BubbleStepInput, t: Tuning): BubbleStepResult {
  void bubble; void run; void input; void t;
  throw new Error('not implemented');
}

/** Fresh bubble at a position, IDLE, with AIR_START and zone radius. */
export function createBubble(pos: Vec2, zone: ZoneIndex, t: Tuning): Bubble {
  void pos; void zone; void t;
  throw new Error('not implemented');
}

/** Radius for a zone (+ one zone step when reinflated). Nothing purchasable touches this (§2.6). */
export function radiusForZone(zone: ZoneIndex, reinflated: boolean, t: Tuning): number {
  void zone; void reinflated; void t;
  throw new Error('not implemented');
}
