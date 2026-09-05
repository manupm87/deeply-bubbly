/**
 * Bur's state machine (GDD §11.3) and her own motion (§11.4). This file owns exactly one thing: how a
 * pointer, a clock and a pile of solids turn into IDLE / CHARGING / LAUNCHED / RESTING / DEAD.
 *
 * It never samples force fields, never reads the camera, never touches hazards or pickups: `GameWorld`
 * does that around it. What it does own — and nobody else may re-implement — is the rest capture rule
 * (§2.3), the charge/launch gesture (§2.1) and the overcharge clock (§2.2).
 */
import { computeAim, launchVelocity } from '../control/aim';
import { chargePower, impulseMagnitude, zoneRadius } from '../control/charge';
import { moveCircle, solidRectAt } from '../physics/collision';
import { integrateVelocity } from '../physics/integrator';
import { clamp } from '../math/vec';
import { gainAir, loseAir, resetBounceChain, zoneAirMax } from './air';
import type { AirChange } from './air';
import type { Rect, Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type {
  AirLossReason,
  Bubble,
  Ceiling,
  Contact,
  EntityId,
  GameEvent,
  PointerInput,
  RunState,
  SolidEntity,
  ZoneIndex,
} from '../types';
import type { ReadonlyPhysicsEnv } from '../physics/forceFields';

export interface BubbleStepInput {
  /** Pointer in WORLD coordinates (shell converts viewport -> world using camera.y). */
  pointer: PointerInput;
  /** Solids near Bur (streamer output), world coordinates. */
  solids: readonly SolidEntity[];
  /** Force-field environment sampled by the caller; only read, so `NEUTRAL_ENV` is a valid argument. */
  env: ReadonlyPhysicsEnv;
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

/** Hitstop asked of the shell when Bur runs out of air, so the deflate reads as a beat (§2.4). */
export const DEATH_HITSTOP_MS = 90;

/**
 * Slack (ms) when comparing an accumulated duration against a threshold. Accumulating `dt * 1000`
 * fifteen times gives 249.99999999999994, not 250: without this the LAUNCH_LOCK_MS window silently
 * lasts one extra step (see the same warning on `launchLockSteps`).
 */
const TIME_EPS_MS = 1e-6;

/** Radius step used by REINFLATED (§2.6): one zone larger, saturating at the surface. */
const PREVIOUS_ZONE: Readonly<Record<ZoneIndex, ZoneIndex>> = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };

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
 *  4. ATTACHED (RESTING, or a hold from rest): vel = 0, restMs += dt; pressure drain frozen; after maxRestMs → push DOWN
 *     at REST_RELEASE_PUSH, state IDLE, event restRelease('timeout'). Ignore that ceiling for LAUNCH_LOCK_MS after leaving.
 *  5. IDLE/LAUNCHED: integrate velocity, move with moveCircle. For each contact:
 *     - face 'bottom' && body is capturable ceiling && vel.y < 0 && approachSpeed <= REST_CAPTURE_SPEED && not within LAUNCH_LOCK → RESTING (event rest)
 *     - otherwise bounce (event bounce), update bounceChain (distinct bodies; reward +1 air at BOUNCE_CHAIN_REWARD once per chunk)
 *     - trampoline (capturable=false with bounceCooldownMs) → add to ignore set until cooldown expires
 *  6. Passive pressure drain in zones >= PRESSURE_DRAIN_FROM_ZONE every PRESSURE_DRAIN_S (frozen while attached).
 *  7. Flags expiry (stun, invuln, reinflate, ascenso).
 * Hazards, pickups, boyas, stations and camera are NOT handled here (GameWorld does it) — this module is about Bur's own motion.
 *
 * Four implementation notes the integrator needs:
 *  - Input EDGES come from `bubble.holdLatched` ("this finger has already had its hold"), NOT from
 *    the state. Deriving them from the state (CHARGING *is* "the pointer was down") looks equivalent
 *    and is not: §2.2's auto-release ends the gesture at 2.500 ms with the finger still on the glass,
 *    and 250 ms later the same, never-lifted finger would start a second hold — a second
 *    `chargeStart` and a fresh overcharge budget, so a 5 s press would cost 4 pips where §2.2 and
 *    §11.7.4 cap a `mantenido` at 2. A press is honoured once per contact, from IDLE or RESTING; the
 *    latch is released the first step the pointer is up.
 *  - Being ATTACHED to a ceiling (`restingOnId !== null`) is orthogonal to the input state: RESTING
 *    and "a hold from rest" (CHARGING while attached) are the same physical pose, so the pinning, the
 *    1.800 ms overcharge threshold, the frozen pressure clock and the anti-camping clock all key on
 *    the attachment and never on `state === 'RESTING'`. A capture that lands mid-hold therefore keeps
 *    the gesture alive: it parks it in RESTING for one step and the next input phase RESUMES it (no
 *    second `chargeStart`, no lost charge), which is §11.3's own RESTING → CHARGING arrow.
 *  - Rest capture is decided BEFORE the bounce response, through `moveCircle`'s `stopAtContact` hook:
 *    the motion stops at the capturing contact with the velocity un-reflected, so §2.3's "un solo
 *    evento, sin traqueteo" holds exactly instead of being patched up after a bounce already happened.
 *  - The anti-camping CLOCK runs for as long as Bur is attached, aiming included (§2.3 argues the
 *    budget as "1.800 ms de puntería dentro de un reposo de 3,0 s", which is only an argument if the
 *    clock keeps running); the EJECT itself waits for the gesture to end, so a shot is never yanked
 *    out of the player's hands mid-charge. AUTO_RELEASE_MS bounds that wait.
 */
export function stepBubble(bubble: Bubble, run: RunState, input: BubbleStepInput, t: Tuning): BubbleStepResult {
  const events: GameEvent[] = [];
  const contacts: Contact[] = [];
  const out: BubbleStepResult = { events, contacts, requestRespawn: false };
  const dtMs = input.dt * 1000;

  // Pressure follows the zone every step, plus the temporary reinflate. Nothing purchasable (§2.6).
  // Radius, flags and the pass-through list are not input, so they hold in EVERY state, DEAD
  // included: the snapshot must not show the previous zone's radius, or an invulnerability that
  // expired, for the whole 700 ms of the deflate.
  bubble.radius = radiusForZone(input.zone, bubble.flags.reinflateUntil > input.nowMs, t);
  prunePassThrough(bubble, input.nowMs);

  // 1. DEAD absorbs everything: only an external restart leaves it (§11.7.6).
  if (bubble.state === 'DEAD') {
    bubble.deadMs += dtMs;
    expireFlags(bubble, input.nowMs);
    return out;
  }

  // LAUNCHED → IDLE. Before the input edges on purpose: a finger pressed during the lock starts its
  // charge on the very first step that allows it, instead of waiting a whole extra frame.
  if (bubble.state === 'LAUNCHED' && bubble.launchedMs + TIME_EPS_MS >= t.LAUNCH_LOCK_MS) bubble.state = 'IDLE';

  // The ceiling Bur hangs from can vanish under her (marine snow dissolving, the streamer dropping it,
  // a boss carrying it away). Rest without a ceiling is not a state §2.3 admits, in RESTING or while
  // charging from it; a live one is re-pinned so a kinematic slab carries Bur instead of leaving her
  // floating in mid-water.
  if (isAttached(bubble)) {
    const ceiling = findCeiling(input.solids, bubble.restingOnId);
    if (ceiling === null) detachRest(bubble, 'displaced', events);
    else pinToCeiling(bubble, ceiling, input);
  }

  // 2. Input edges (see the note above: one finger contact = one hold, and `holdLatched` is what
  //    makes the auto-release final instead of the start of the next hold).
  if (input.pointer.down) {
    if (bubble.state === 'IDLE' || bubble.state === 'RESTING') {
      // A hold a capture interrupted is RESUMED, not restarted: the charge belongs to the player, and
      // §11.3's route out of RESTING with the finger down is exactly this one, CHARGING.
      if (bubble.holdLatched !== true) beginCharge(bubble, events);
      else if (hasLiveHold(bubble)) bubble.state = 'CHARGING';
    }
  } else {
    bubble.holdLatched = false;
    // A live hold is released whatever state it is parked in, so a capture landing on the last step
    // of the gesture cannot swallow the shot the player charged.
    if (bubble.state === 'CHARGING' || hasLiveHold(bubble)) {
      if (bubble.chargeMs < t.MIN_TAP_MS) cancelCharge(bubble);
      else launch(bubble, input, t, events);
    }
  }

  // 3. CHARGING clocks (aim, overcharge, auto-release). May end in a launch or in DEAD.
  if (bubble.state === 'CHARGING') {
    stepCharging(bubble, run, input, t, events);
    if (isDead(bubble)) return out;
  }

  // 4. Anti-camping clock (§2.3). It runs for as long as Bur is ATTACHED, aiming included.
  if (isAttached(bubble)) stepRestClock(bubble, input, t, events);

  // 5. Motion. Attached poses (RESTING and a hold from rest) are pinned: they do not integrate at all.
  if (isAttached(bubble)) bubble.vel = { x: 0, y: 0 };
  else stepMotion(bubble, input, t, events, contacts);
  if (bubble.state === 'LAUNCHED') bubble.launchedMs += dtMs;

  // 6. Passive pressure drain (§2.4.4), frozen while Bur hangs from a ceiling: §2.3 freezes it "mientras
  //    dura el reposo", and what she does while resting is aim, so the freeze follows the attachment.
  if (input.zone >= t.PRESSURE_DRAIN_FROM_ZONE && !isAttached(bubble)) {
    const periodMs = t.PRESSURE_DRAIN_S * 1000;
    bubble.pressureDrainMs += dtMs;
    while (periodMs > 0 && bubble.pressureDrainMs + TIME_EPS_MS >= periodMs) {
      bubble.pressureDrainMs -= periodMs;
      const change = applyAirLoss(bubble, run, 'pressure', bubble.pos, input.nowMs, t);
      events.push(...change.events);
      if (change.died) return out;
    }
  }

  // 7. RESACA timeout (§2.4.2). Detection needs the camera and lives in GameWorld, which sets
  //    flags.resacaUntil when Bur leaves the top of the view and clears it when she comes back; the
  //    penalty is a pure clock, so it is served here and reported through `requestRespawn`.
  if (bubble.flags.resacaUntil > 0 && input.nowMs + TIME_EPS_MS >= bubble.flags.resacaUntil) {
    bubble.flags.resacaUntil = 0;
    const change = applyAirLoss(bubble, run, 'resaca', bubble.pos, input.nowMs, t);
    events.push(...change.events);
    out.requestRespawn = !change.died;
    if (change.died) return out;
  }

  // 8. Flags expiry.
  expireFlags(bubble, input.nowMs);
  return out;
}

/** Fresh bubble at a position, IDLE, with AIR_START and zone radius. */
export function createBubble(pos: Vec2, zone: ZoneIndex, t: Tuning): Bubble {
  return {
    pos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    radius: radiusForZone(zone, false, t),
    air: t.AIR_START,
    airMax: zoneAirMax(zone, 0, t),
    state: 'IDLE',
    chargeMs: 0,
    restMs: 0,
    launchedMs: 0,
    deadMs: 0,
    lastChargePower: 0,
    aimOrigin: null,
    aimTheta: 0,
    lastAimValid: null,
    dragDist: 0,
    overchargeDrained: 0,
    overchargeTickMs: 0,
    holdLatched: false,
    overchargeAnnounced: false,
    restingOnId: null,
    lastRestingCeilingId: null,
    bounceChain: 0,
    bounceChainBodies: [],
    bounceChainRewardedInChunk: null,
    pressureDrainMs: 0,
    passThrough: [],
    flags: { invulnUntil: 0, stunUntil: 0, reinflateUntil: 0, ascensoUntil: 0, resacaUntil: 0, trapVentAt: 0 },
  };
}

/** Radius for a zone (+ one zone step when reinflated). Nothing purchasable touches this (§2.6). */
export function radiusForZone(zone: ZoneIndex, reinflated: boolean, t: Tuning): number {
  return zoneRadius(reinflated ? PREVIOUS_ZONE[zone] : zone, t);
}

/**
 * Loses one pip through `loseAir` and performs the DEAD transition when that was the last one.
 * `GameWorld` should route hazard hits and anemone vents through this rather than through `loseAir`
 * directly, so the death flow (§2.4: velocity to 0, deflate, hitstop) has exactly one implementation.
 */
export function applyAirLoss(
  bubble: Bubble,
  run: RunState,
  reason: AirLossReason,
  at: Vec2,
  nowMs: number,
  t: Tuning,
): AirChange {
  const change = loseAir(bubble, run, reason, at, nowMs, t);
  if (!change.died) return change;
  bubble.state = 'DEAD';
  bubble.deadMs = 0;
  bubble.vel = { x: 0, y: 0 };
  bubble.restingOnId = null;
  change.events.push({ type: 'deflate', at: { x: at.x, y: at.y } }, { type: 'hitstop', ms: DEATH_HITSTOP_MS });
  return change;
}

// ---------------------------------------------------------------------------------------------
// Charging
// ---------------------------------------------------------------------------------------------

/**
 * True while Bur hangs from a ceiling (§2.3). It is a pose, not an input state: RESTING and a hold
 * charged from the ledge are the same thing physically, and the pinning, the anti-camping clock and
 * the frozen pressure clock all belong to the pose.
 */
function isAttached(bubble: Bubble): boolean {
  return bubble.restingOnId !== null;
}

/**
 * True while a gesture owns an accumulated charge: CHARGING, plus the single step a rest capture may
 * park a running hold in RESTING before the next input phase resumes it (§2.3 can capture Bur in the
 * middle of an in-air hold, and §11.3 has no route that throws the player's charge away).
 * `aimOrigin` is the marker because `beginCharge` sets it and both endings — `launch` and
 * `cancelCharge` — clear it.
 */
function hasLiveHold(bubble: Bubble): boolean {
  return bubble.aimOrigin !== null;
}

function beginCharge(bubble: Bubble, events: GameEvent[]): void {
  bubble.state = 'CHARGING';
  // §2.1: frozen HERE, at Bur's position, never re-read from her live position afterwards.
  bubble.aimOrigin = { x: bubble.pos.x, y: bubble.pos.y };
  bubble.chargeMs = 0;
  bubble.dragDist = 0;
  bubble.overchargeDrained = 0;
  bubble.overchargeTickMs = 0;
  bubble.overchargeAnnounced = false;
  // This finger has had its hold: whatever ends it (release, tap, auto-release), the next hold needs
  // a real pointerup first (§2.2).
  bubble.holdLatched = true;
  events.push({ type: 'chargeStart', at: { x: bubble.pos.x, y: bubble.pos.y } });
}

/** §11.7.3: a release under MIN_TAP_MS produces no impulse and no state change. */
function cancelCharge(bubble: Bubble): void {
  bubble.state = isAttached(bubble) ? 'RESTING' : 'IDLE';
  bubble.chargeMs = 0;
  bubble.aimOrigin = null;
  bubble.overchargeTickMs = 0;
  bubble.overchargeAnnounced = false;
}

function stepCharging(
  bubble: Bubble,
  run: RunState,
  input: BubbleStepInput,
  t: Tuning,
  events: GameEvent[],
): void {
  const dtMs = input.dt * 1000;
  bubble.chargeMs += dtMs;

  // Aim is measured from the frozen origin, so a still finger is a still shot however far Bur drifts.
  const origin = bubble.aimOrigin ?? bubble.pos;
  const aim = computeAim({ x: input.pointer.x, y: input.pointer.y }, origin, bubble.lastAimValid, t);
  bubble.aimTheta = aim.theta;
  bubble.dragDist = aim.dragDist;
  if (aim.valid) bubble.lastAimValid = aim.theta;

  const thresholdMs = isAttached(bubble) ? t.OVERCHARGE_MS_RESTING : t.OVERCHARGE_MS;
  if (bubble.chargeMs > thresholdMs && t.OVERCHARGE_DRAIN_MS > 0) {
    // The tell, once per hold, latched rather than derived from "crossed the threshold this step":
    // the threshold MOVES from 1.800 ms to 900 ms the moment the ceiling stops holding Bur (snow
    // dissolving, a slab carried away, the streamer dropping the chunk), and §2.2 sells the
    // overcharge as a communicated cost — no pip is ever vented without its warning.
    if (bubble.overchargeAnnounced !== true) {
      bubble.overchargeAnnounced = true;
      events.push({ type: 'overchargeStart' });
    }
    // Only the part of this step that is past the threshold counts, so the first drain lands exactly
    // OVERCHARGE_DRAIN_MS after it (§11.7.4: a 1.400 ms hold drains exactly one pip).
    bubble.overchargeTickMs += Math.min(dtMs, bubble.chargeMs - thresholdMs);
    while (bubble.overchargeTickMs + TIME_EPS_MS >= t.OVERCHARGE_DRAIN_MS) {
      bubble.overchargeTickMs -= t.OVERCHARGE_DRAIN_MS;
      const change = applyAirLoss(bubble, run, 'overcharge', bubble.pos, input.nowMs, t);
      events.push(...change.events);
      if (change.died) return;
    }
  }

  // "Mantener eternamente no es un estado válido" (§2.2): Bur lets go with what she has.
  if (bubble.chargeMs + TIME_EPS_MS >= t.AUTO_RELEASE_MS) launch(bubble, input, t, events);
}

/** §2.2, rule number one: the launch ASSIGNS the velocity. Never `vel +=`. */
function launch(bubble: Bubble, input: BubbleStepInput, t: Tuning, events: GameEvent[]): void {
  const power = chargePower(bubble.chargeMs, t);
  const fromRest = isAttached(bubble);
  const ceilingId = bubble.restingOnId;
  const ceiling = fromRest ? findCeiling(input.solids, ceilingId) : null;
  const stickyMul = ceiling !== null && ceiling.kind === 'pegajosa' ? t.REST_STICKY_IMPULSE_MUL : 1;

  const impulse =
    impulseMagnitude(
      {
        power,
        dragDist: bubble.dragDist,
        radius: bubble.radius,
        stunned: input.nowMs < bubble.flags.stunUntil,
        externalMul: input.env.chargeMul * stickyMul,
      },
      t,
    ) * input.env.impulseMul;

  bubble.vel = launchVelocity(bubble.aimTheta, impulse);
  bubble.state = 'LAUNCHED';
  bubble.launchedMs = 0;
  bubble.lastChargePower = power;
  bubble.chargeMs = 0;
  bubble.overchargeTickMs = 0;
  bubble.overchargeAnnounced = false;
  bubble.aimOrigin = null;
  events.push({ type: 'launch', power, vel: { x: bubble.vel.x, y: bubble.vel.y }, at: { x: bubble.pos.x, y: bubble.pos.y } });

  if (!fromRest) return;
  // State is already LAUNCHED, so `detachRest` only clears the attachment and reports it.
  detachRest(bubble, 'launch', events);
  if (ceilingId !== null) addPassThrough(bubble, ceilingId, input.nowMs + t.LAUNCH_LOCK_MS);
}

// ---------------------------------------------------------------------------------------------
// Resting
// ---------------------------------------------------------------------------------------------

/**
 * Anti-camping clock (§2.3, "máximo 3,0 s de reposo continuado"). It counts every step Bur spends
 * ATTACHED, aiming included: §2.3 justifies the 1.800 ms rest overcharge threshold with "con el
 * temporizador de reposo de 3,0 s, eso deja presupuesto de puntería de sobra sin necesidad de quitar
 * el anti-camping", and that argument only holds if the clock keeps running while she charges —
 * otherwise drumming a finger under a ledge parks Bur there forever.
 * The EJECT waits for the gesture to end, though: pulling a charged shot out of the player's hands
 * mid-gesture is not what §2.3 asks for, and the wait is bounded by AUTO_RELEASE_MS (2.500 ms), after
 * which the hold launches itself and detaches anyway.
 */
function stepRestClock(bubble: Bubble, input: BubbleStepInput, t: Tuning, events: GameEvent[]): void {
  const ceiling = findCeiling(input.solids, bubble.restingOnId);
  if (ceiling === null) return; // Already detached above; nothing left to time.

  bubble.restMs += input.dt * 1000;
  if (bubble.state === 'CHARGING') return;
  const maxRestMs = ceiling.maxRestMs ?? t.REST_MAX_MS[ceiling.kind];
  if (bubble.restMs + TIME_EPS_MS < maxRestMs) return;

  // Anti-camping pushes DOWNWARD (§2.3): never a free resaca for taking too long to aim.
  bubble.vel = { x: 0, y: t.REST_RELEASE_PUSH };
  detachRest(bubble, 'timeout', events);
  addPassThrough(bubble, ceiling.id, input.nowMs + t.LAUNCH_LOCK_MS);
}

/** Ends the attachment to a ceiling. Returns to IDLE only if Bur was actually RESTING. */
function detachRest(bubble: Bubble, reason: 'timeout' | 'launch' | 'displaced', events: GameEvent[]): void {
  if (bubble.state === 'RESTING') bubble.state = 'IDLE';
  bubble.restingOnId = null;
  bubble.restMs = 0;
  events.push({ type: 'restRelease', reason });
}

/**
 * Glues Bur to the bottom face of a (possibly moving) ceiling: she follows its horizontal travel and
 * sits exactly one radius under it, so neither a kinematic slab (§5 nº 3, nº 24) nor a radius that
 * shrank at a zone change (§2.6) can leave her hanging in open water or buried in the rock.
 */
function pinToCeiling(bubble: Bubble, ceiling: Ceiling, input: BubbleStepInput): void {
  const now = solidRectAt(ceiling, input.nowMs);
  const before = solidRectAt(ceiling, input.nowMs - input.dt * 1000);
  bubble.pos = restPose(bubble.pos.x + (now.x - before.x), now, bubble.radius);
}

/**
 * The one rest pose (§2.3): hanging one radius under the bottom face, inside its horizontal extent.
 * Both halves matter. The vertical one keeps Bur touching a ceiling whose radius or height changed;
 * the horizontal one is what a capture needs, because `collision.ts` maps a corner graze to the face
 * its normal is closest to — an arrival at the bottom-left lip is reported as face 'bottom' with a
 * contact point ON THE CORNER, and snapping only `y` to it would leave Bur resting beside the slab,
 * a full radius from it, with `pinToCeiling` re-asserting that pose forever.
 */
function restPose(x: number, rect: Rect, radius: number): Vec2 {
  return { x: clamp(x, rect.x, rect.x + rect.w), y: rect.y + rect.h + radius };
}

// ---------------------------------------------------------------------------------------------
// Motion, capture and bounces
// ---------------------------------------------------------------------------------------------

function stepMotion(
  bubble: Bubble,
  input: BubbleStepInput,
  t: Tuning,
  events: GameEvent[],
  contactsOut: Contact[],
): void {
  const launched = bubble.state === 'LAUNCHED';
  const vel = integrateVelocity(
    bubble.vel,
    input.dt,
    { state: bubble.state, env: input.env, dampingMul: launched ? t.LAUNCH_DAMPING_MUL : 1 },
    t,
  );

  // A holder, not a plain `let`: the compiler cannot see the assignment made inside the callback.
  const capture: { contact: Contact | null; ceiling: Ceiling | null } = { contact: null, ceiling: null };
  const ignoreIds = passThroughIds(bubble);
  const moved = moveCircle(bubble.pos, vel, bubble.radius, input.dt, input.solids, {
    lateralFriction: t.LATERAL_FRICTION,
    timeMs: input.nowMs,
    ...(ignoreIds === null ? {} : { ignoreIds }),
    stopAtContact: (contact) => {
      const ceiling = capturingCeiling(contact, launched, t);
      if (ceiling === null) return false;
      capture.contact = contact;
      capture.ceiling = ceiling;
      return true;
    },
  });

  bubble.pos = moved.pos;
  bubble.vel = moved.vel;
  contactsOut.push(...moved.contacts);

  for (const contact of moved.contacts) {
    if (capture.contact === contact && capture.ceiling !== null) {
      enterRest(bubble, capture.ceiling, input, events);
      return; // The capture is the last contact of the tick by construction.
    }
    handleBounce(bubble, contact, input, t, events);
  }
}

/**
 * §2.3 capture test, applied BEFORE the bounce response. Returns the ceiling that captures Bur, or
 * null when this contact is a plain bounce.
 * `approachSpeed` on a 'bottom' face is exactly `-vel.y` at the moment of impact, so "> 0" is the
 * "moving up" half of the rule and no pre-contact velocity has to be smuggled in from outside.
 */
function capturingCeiling(contact: Contact, launched: boolean, t: Tuning): Ceiling | null {
  if (launched) return null; // The launch lock ignores rest, or Bur re-sticks to the ceiling she left.
  if (contact.face !== 'bottom') return null; // Top and sides always bounce, never rest.
  const body = contact.body;
  if (body.type !== 'ceiling' || !body.capturable) return null;
  if (contact.approachSpeed <= 0 || contact.approachSpeed > t.REST_CAPTURE_SPEED) return null;
  return body;
}

/**
 * Turns a capturing contact into the attachment (§2.3). The pose is the canonical `restPose`, not the
 * contact point, so a corner graze cannot leave Bur hanging next to the ledge.
 * The capture arrow of §11.3 lands on RESTING whatever Bur was doing, but it does NOT end a hold that
 * is running: `chargeMs` and `aimOrigin` are left alone, so the next input phase resumes the gesture
 * as a hold from rest (pinned, 1.800 ms of threshold, sticky launch) instead of throwing away the
 * half second of charge the player is holding.
 */
function enterRest(bubble: Bubble, ceiling: Ceiling, input: BubbleStepInput, events: GameEvent[]): void {
  bubble.state = 'RESTING';
  bubble.vel = { x: 0, y: 0 };
  // Snap to the rest pose (touching the face, not CONTACT_EPSILON away from it) so the very first
  // attached frame already shows the position every later step will pin Bur to.
  bubble.pos = restPose(bubble.pos.x, solidRectAt(ceiling, input.nowMs), bubble.radius);
  bubble.restMs = 0;
  bubble.restingOnId = ceiling.id;
  bubble.lastRestingCeilingId = ceiling.id;
  events.push({ type: 'rest', ceilingId: ceiling.id, kind: ceiling.kind });
}

function handleBounce(
  bubble: Bubble,
  contact: Contact,
  input: BubbleStepInput,
  t: Tuning,
  events: GameEvent[],
): void {
  const body = contact.body;
  events.push({ type: 'bounce', contact, speed: contact.approachSpeed, material: body.material });

  // Trampoline (§2.2): a medusa deflates after being bounced on and Bur passes through it.
  if (body.type === 'ceiling' && !body.capturable && body.bounceCooldownMs !== undefined && body.bounceCooldownMs > 0) {
    addPassThrough(bubble, body.id, input.nowMs + body.bounceCooldownMs);
  }

  // Chain (§2.5): only DISTINCT bodies count, or Bur farms air rattling under one medusa.
  if (!bubble.bounceChainBodies.includes(contact.bodyId)) {
    bubble.bounceChainBodies.push(contact.bodyId);
    bubble.bounceChain = bubble.bounceChainBodies.length;
  }
  if (bubble.bounceChain >= t.BOUNCE_CHAIN_REWARD && bubble.bounceChainRewardedInChunk !== input.currentChunkId) {
    bubble.bounceChainRewardedInChunk = input.currentChunkId;
    events.push(...gainAir(bubble, 1, 'bounceChain', bubble.pos));
    resetBounceChain(bubble);
  }
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** Read through a call boundary: `bubble.state` is narrowed by the guards above, this is not. */
function isDead(bubble: Bubble): boolean {
  return bubble.state === 'DEAD';
}

function findCeiling(solids: readonly SolidEntity[], id: EntityId | null): Ceiling | null {
  if (id === null) return null;
  for (const solid of solids) if (solid.id === id && solid.type === 'ceiling') return solid;
  return null;
}

function addPassThrough(bubble: Bubble, id: EntityId, until: number): void {
  const list = (bubble.passThrough ??= []);
  const existing = list.find((entry) => entry.id === id);
  if (existing === undefined) list.push({ id, until });
  else existing.until = Math.max(existing.until, until);
}

/** Drops spent entries. The single owner of the "still live" predicate, run once per step. */
function prunePassThrough(bubble: Bubble, nowMs: number): void {
  const list = bubble.passThrough;
  if (list === undefined || list.length === 0) return;
  let kept = 0;
  for (const entry of list) if (entry.until > nowMs) list[kept++] = entry;
  list.length = kept;
}

/**
 * Ids collision must skip this tick, or null when there are none (so no Set is allocated). The list
 * has already been pruned this step, and anything added since (the ceiling just launched from) is
 * live by construction, so no expiry is re-tested here.
 */
function passThroughIds(bubble: Bubble): ReadonlySet<EntityId> | null {
  const list = bubble.passThrough;
  if (list === undefined || list.length === 0) return null;
  const ids = new Set<EntityId>();
  for (const entry of list) ids.add(entry.id);
  return ids;
}

/** Orthogonal flags are "until" stamps: clearing spent ones keeps the snapshot honest (§11.3). */
function expireFlags(bubble: Bubble, nowMs: number): void {
  const flags = bubble.flags;
  if (flags.invulnUntil !== 0 && nowMs >= flags.invulnUntil) flags.invulnUntil = 0;
  if (flags.stunUntil !== 0 && nowMs >= flags.stunUntil) flags.stunUntil = 0;
  if (flags.reinflateUntil !== 0 && nowMs >= flags.reinflateUntil) flags.reinflateUntil = 0;
  if (flags.ascensoUntil !== 0 && nowMs >= flags.ascensoUntil) flags.ascensoUntil = 0;
}
