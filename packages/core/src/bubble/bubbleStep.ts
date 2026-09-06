/**
 * Bur's state machine (GDD §11.3, DECISIONS-v1.2 D1/D2) and her own motion (§11.4). This file owns
 * exactly one thing: how a pointer, a clock and a pile of solids turn into
 * IDLE / AIMING / LAUNCHED / RESTING / DEAD.
 *
 * It never samples force fields, never reads the camera, never touches hazards or pickups: `GameWorld`
 * does that around it. What it does own — and nobody else may re-implement — is the rest capture rule
 * (§2.3), the slingshot gesture (D2) and the mid-air launch budget (D1).
 */
import { computeAim, launchVelocity } from '../control/aim';
import { isCancelZone, launchImpulse, pullPower, zoneRadius } from '../control/pull';
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
 * One fixed step of the bubble state machine (§11.3, D1/D2) + physics (§11.4). Mutates `bubble` in place.
 * Responsibilities, in order:
 *  1. DEAD: advance deadMs; no input; return.
 *  2. Input edges. pointerdown from RESTING → AIMING; pointerdown while airborne (IDLE/LAUNCHED) →
 *     AIMING only if the D1 double jump is still available (`canAirLaunch`), otherwise the touch is
 *     ignored ENTIRELY: no state change, no event, no punishment. `aimOrigin` freezes at the POINTER.
 *     pointerup → `cancelZone` (pull under PULL_CANCEL_PX) cancels for free, anything else launches.
 *  3. AIMING: aimMs += dt*1000; the pull is measured from the frozen origin (power, theta, validity,
 *     cancel zone); at AIM_MAX_MS the aim CANCELS — it never fires by itself (D2).
 *  4. ATTACHED (RESTING, or an aim from rest): vel = 0, pinned, pressure drain frozen. The posadero
 *     anti-camping clock is FROZEN while aiming (D2); impaciente and pegajosa keep counting and can
 *     eject Bur mid-aim, which cancels the gesture. On eject: push DOWN at REST_RELEASE_PUSH, state
 *     IDLE, event restRelease('timeout'). Ignore that ceiling for LAUNCH_LOCK_MS after leaving.
 *  5. IDLE/LAUNCHED/an air aim: integrate velocity, move with moveCircle. For each contact:
 *     - face 'bottom' && body is capturable ceiling && vel.y < 0 && approachSpeed <= REST_CAPTURE_SPEED && not within LAUNCH_LOCK → RESTING (event rest)
 *     - otherwise bounce (event bounce), update bounceChain (distinct bodies; reward +1 air at BOUNCE_CHAIN_REWARD once per chunk)
 *     - trampoline (capturable=false with bounceCooldownMs) → add to ignore set until cooldown expires
 *  6. Passive pressure drain in zones >= PRESSURE_DRAIN_FROM_ZONE every PRESSURE_DRAIN_S (frozen while attached).
 *  7. Flags expiry (stun, invuln, reinflate, ascenso).
 * Hazards, pickups, boyas, stations and camera are NOT handled here (GameWorld does it) — this module is about Bur's own motion.
 *
 * Five implementation notes the integrator needs:
 *  - Input EDGES come from `bubble.holdLatched` ("this finger has already had its gesture"), NOT from
 *    the state. Deriving them from the state (AIMING *is* "the pointer was down") looks equivalent
 *    and is not: D2's AIM_MAX_MS cancel ends the gesture with the finger still on the glass, and the
 *    same never-lifted finger would start a second aim on the very next step. A press is honoured
 *    once per contact; the latch is released the first step the pointer is up.
 *  - A REFUSED air touch does not latch. "El toque no hace nada" (D1) has to survive the next 200 ms:
 *    latching it would mean that a player pressing a moment before landing gets no shot when she
 *    lands, and would have to lift and press again to use the ledge she aimed for.
 *  - Being ATTACHED to a ceiling (`restingOnId !== null`) is orthogonal to the input state: RESTING
 *    and "an aim from rest" are the same physical pose, so the pinning, the frozen pressure clock and
 *    the anti-camping clock all key on the attachment and never on `state === 'RESTING'`. A capture
 *    that lands mid-aim therefore keeps the gesture alive: it parks it in RESTING for one step and
 *    the next input phase RESUMES it, which is §11.3's own RESTING → AIMING arrow — and it turns an
 *    air aim into a free one, because by then Bur is hanging from a ledge.
 *  - Rest capture is decided BEFORE the bounce response, through `moveCircle`'s `stopAtContact` hook:
 *    the motion stops at the capturing contact with the velocity un-reflected, so §2.3's "un solo
 *    evento, sin traqueteo" holds exactly instead of being patched up after a bounce already happened.
 *  - Losing the ledge mid-aim CANCELS the aim (`aimCancel('displaced')`), and that is what makes the
 *    launch branch simple: an aim that survives to a release while detached can only be an air aim.
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

  // LAUNCHED → IDLE. Before the input edges on purpose: a finger pressed during the lock opens its
  // aim on the very first step that allows it, instead of waiting a whole extra frame.
  if (bubble.state === 'LAUNCHED' && bubble.launchedMs + TIME_EPS_MS >= t.LAUNCH_LOCK_MS) bubble.state = 'IDLE';

  // The ceiling Bur hangs from can vanish under her (marine snow dissolving, the streamer dropping it,
  // a boss carrying it away). Rest without a ceiling is not a state §2.3 admits, in RESTING or while
  // aiming from it; a live one is re-pinned so a kinematic slab carries Bur instead of leaving her
  // floating in mid-water.
  if (isAttached(bubble)) {
    const ceiling = findCeiling(input.solids, bubble.restingOnId);
    if (ceiling === null) detachRest(bubble, 'displaced', events);
    else pinToCeiling(bubble, ceiling, input);
  }

  // 2. Input edges (see the notes above: one finger contact = one gesture, and `holdLatched` is what
  //    makes the AIM_MAX_MS cancel final instead of the start of the next aim).
  if (input.pointer.down) {
    // An aim a capture interrupted is RESUMED, not restarted: the pull belongs to the player, and
    // §11.3's route out of RESTING with the finger down is exactly this one, AIMING.
    if (hasLiveAim(bubble) && bubble.holdLatched === true) {
      if (bubble.state === 'IDLE' || bubble.state === 'RESTING') bubble.state = 'AIMING';
    } else if (bubble.holdLatched !== true && canAim(bubble, t)) {
      beginAim(bubble, input, t, events);
    }
  } else {
    bubble.holdLatched = false;
    // A live aim is released whatever state it is parked in, so a capture landing on the last step
    // of the gesture cannot swallow the shot the player pulled.
    if (bubble.state === 'AIMING' || hasLiveAim(bubble)) {
      if (bubble.cancelZone) cancelAim(bubble, 'zone', events);
      else launch(bubble, run, input, t, events);
      if (isDead(bubble)) return out;
    }
  }

  // 3. AIMING clocks (the pull, and the AIM_MAX_MS cancel). Never ends in a launch (D2).
  if (bubble.state === 'AIMING') stepAiming(bubble, input, t, events);

  // 4. Anti-camping clock (§2.3, D2). It runs for as long as Bur is ATTACHED, except on a posadero
  //    she is aiming from: there the clock is frozen.
  if (isAttached(bubble)) stepRestClock(bubble, input, t, events);

  // 5. Motion. Attached poses (RESTING and an aim from rest) are pinned: they do not integrate at all.
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
    restMs: 0,
    launchedMs: 0,
    deadMs: 0,
    lastLaunchPower: 0,
    aimOrigin: null,
    pullDist: 0,
    pullTheta: 0,
    aimMs: 0,
    aimValid: true,
    cancelZone: false,
    airLaunchesUsed: 0,
    holdLatched: false,
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
// Aiming (DECISIONS-v1.2 D1, D2)
// ---------------------------------------------------------------------------------------------

/**
 * True while Bur hangs from a ceiling (§2.3). It is a pose, not an input state: RESTING and an aim
 * pulled from the ledge are the same thing physically, and the pinning, the anti-camping clock and
 * the frozen pressure clock all belong to the pose.
 */
function isAttached(bubble: Bubble): boolean {
  return bubble.restingOnId !== null;
}

/**
 * D1's "double jump": one mid-air launch per airborne phase, priced at AIR_LAUNCH_COST pips and
 * NEVER available on the last pip. The strict `>` is the whole of "nunca el último pip": with the
 * shipped cost of 1 it takes two pips to buy a shot that leaves one.
 * Exported because the HUD shows it (D1 makes it a resource the player counts) and because it is the
 * one place the rule is written.
 */
export function canAirLaunch(bubble: Bubble, t: Tuning): boolean {
  return bubble.airLaunchesUsed < t.AIR_LAUNCHES_MAX && bubble.air > t.AIR_LAUNCH_COST;
}

/**
 * True while the Anémona Pegajosa holds Bur (§2.4.5, §5 nº 7). `flags.trapVentAt` is the trap's own
 * stamp — `hazards.ts` sets it when the crown closes and clears it the moment it lets go — so the
 * state machine can read the pose without knowing what a hazard is.
 *
 * It matters here because §2.4.5 prices the escape at a shot of 60 % or more and calls the anemone
 * "recurso, NO muerte". A pinned Bur is held AGAINST a surface, not adrift: her escape is the shot D1
 * sends out of a rest, not the mid-air correction D1 took away. Charging it to the double-jump budget
 * would make an anemone met on the last pip an unavoidable death, which is the opposite of the rule.
 */
function isTrapped(bubble: Bubble): boolean {
  return bubble.flags.trapVentAt > 0;
}

/**
 * Whether a pointerdown may open a gesture at all (D1). From a rest surface: always — that is where
 * the game is played from. Held by an anemone: always, because that shot is the way out §2.4.5 sells.
 * In open water: only with the double jump in hand; otherwise the touch is ignored entirely, "ni
 * evento ni castigo".
 */
function canAim(bubble: Bubble, t: Tuning): boolean {
  if (bubble.state === 'RESTING') return true;
  if (bubble.state !== 'IDLE' && bubble.state !== 'LAUNCHED') return false;
  if (isTrapped(bubble)) return true;
  return canAirLaunch(bubble, t);
}

/**
 * True while a gesture owns a frozen origin: AIMING, plus the single step a rest capture may park a
 * running aim in RESTING before the next input phase resumes it (§2.3 can capture Bur in the middle
 * of an air aim, and §11.3 has no route that throws the player's pull away).
 * `aimOrigin` is the marker because `beginAim` sets it and both endings — `launch` and `cancelAim` —
 * clear it.
 */
function hasLiveAim(bubble: Bubble): boolean {
  return bubble.aimOrigin !== null;
}

/** D2: the origin is the FINGER's world position at the pointerdown, frozen for the whole gesture. */
function beginAim(bubble: Bubble, input: BubbleStepInput, t: Tuning, events: GameEvent[]): void {
  const fromRest = isAttached(bubble);
  bubble.state = 'AIMING';
  bubble.aimOrigin = { x: input.pointer.x, y: input.pointer.y };
  bubble.aimMs = 0;
  bubble.pullDist = 0;
  bubble.pullTheta = 0;
  bubble.aimValid = true;
  // A gesture is born inside the cancel radius: at zero pull there is no shot to take yet (D2).
  bubble.cancelZone = isCancelZone(0, t);
  // This finger has had its gesture: whatever ends it (release, cancel, timeout), the next one needs
  // a real pointerup first.
  bubble.holdLatched = true;
  events.push({ type: 'aimStart', at: { x: bubble.aimOrigin.x, y: bubble.aimOrigin.y }, fromRest });
}

/**
 * Ends a gesture without a shot (D2). No Air is charged and nothing moves: a cancelled air aim costs
 * no pip, and a cancelled rest aim leaves Bur exactly where she was hanging. What it DOES charge is
 * the ledge's own clock (see below), which is what keeps the freeze of §2.3 bounded.
 */
function cancelAim(
  bubble: Bubble,
  reason: 'zone' | 'timeout' | 'displaced' | 'noAir',
  events: GameEvent[],
): void {
  // D2 freezes the posadero's anti-camping clock "mientras se apunta", and argues the freeze is
  // bounded because "AIM_MAX_MS bounds that at 6 s and the same finger cannot open a second aim
  // without lifting". Lifting costs one frame, so without this line the loop press → 6 s → lift →
  // press renews the freeze for ever, and with it §2.4.4's pressure drain, which `stepBubble` parks
  // for as long as Bur hangs. So the freeze is a LOAN against the ledge: a gesture that ends without
  // a shot pays its time back, and only a launch (which leaves the ledge anyway) is free of it.
  // Camping is then bounded by REST_MAX_MS + AIM_MAX_MS, whatever the finger does.
  if (isAttached(bubble)) bubble.restMs += bubble.aimMs;
  if (bubble.state === 'AIMING') bubble.state = isAttached(bubble) ? 'RESTING' : 'IDLE';
  clearAim(bubble);
  events.push({ type: 'aimCancel', reason });
}

/**
 * Cancels a live aim from OUTSIDE the state machine. Three callers, all of them cases where the world
 * takes the gesture away rather than the player ending it: the station summary (§3.3: a station is a
 * pause, not a level), the anemone's 0,8 s hold (§5 nº 7), and — through `GameWorld.cancelAim` — the
 * shell, whenever a finger contact ends without a release (an automatic pause, a lost focus, a
 * `pointercancel`, a drag off the canvas). It is here, and not written out again over there, because
 * "a gesture ends by launching or by cancelling" is a rule of this file.
 */
export function abortAim(bubble: Bubble): GameEvent[] {
  if (!hasLiveAim(bubble) && bubble.state !== 'AIMING') return [];
  const events: GameEvent[] = [];
  cancelAim(bubble, 'displaced', events);
  return events;
}

/** The gesture fields, back to their resting values. Both endings share it so neither can forget one. */
function clearAim(bubble: Bubble): void {
  bubble.aimOrigin = null;
  bubble.aimMs = 0;
  bubble.pullDist = 0;
  bubble.aimValid = true;
  bubble.cancelZone = false;
}

/**
 * The pull, re-measured every step from the frozen origin (D2), plus the aim timeout. There is no
 * auto-fire: "existe un tope AIM_MAX_MS tras el cual el tiro SE CANCELA (nunca se dispara solo)".
 */
function stepAiming(bubble: Bubble, input: BubbleStepInput, t: Tuning, events: GameEvent[]): void {
  bubble.aimMs += input.dt * 1000;

  const origin = bubble.aimOrigin ?? bubble.pos;
  const aim = computeAim({ x: input.pointer.x, y: input.pointer.y }, origin, t);
  bubble.pullTheta = aim.theta;
  bubble.pullDist = aim.pullDist;
  bubble.aimValid = aim.valid;
  bubble.cancelZone = isCancelZone(aim.pullDist, t);

  if (bubble.aimMs + TIME_EPS_MS >= t.AIM_MAX_MS) cancelAim(bubble, 'timeout', events);
}

/**
 * §2.2, rule number one: the launch ASSIGNS the velocity. Never `vel +=`.
 * An aim that reaches here detached and free is an AIR launch by construction (a rest aim that loses
 * its ledge is cancelled by `detachRest`), so it spends one of the D1 budget and pays its pip — a
 * price, not a blow: `loseAir` grants no invulnerability, no stun, and `GameWorld` adds no pushback
 * for it. Detached but HELD by an anemone is the third case, and it is free (see `isTrapped`).
 */
function launch(
  bubble: Bubble,
  run: RunState,
  input: BubbleStepInput,
  t: Tuning,
  events: GameEvent[],
): void {
  const power = pullPower(bubble.pullDist, t);
  const fromRest = isAttached(bubble);
  const airLaunch = !fromRest && !isTrapped(bubble);
  // D1 is a rule about the SHOT, not about the pointerdown: a gesture opened with two pips and
  // released with one is still "el último pip", and `loseAir`'s floor would decline to charge for it,
  // turning the refusal into a free extra launch the HUD has already told the player she does not
  // have. The release is declined instead of fired — the same "ni evento ni castigo" as the touch
  // that never opened, plus the `aimCancel` the shell needs to close the gesture it was drawing.
  if (airLaunch && !canAirLaunch(bubble, t)) {
    cancelAim(bubble, 'noAir', events);
    return;
  }
  const ceilingId = bubble.restingOnId;
  const ceiling = fromRest ? findCeiling(input.solids, ceilingId) : null;

  const impulse = launchImpulse(
    {
      power,
      radius: bubble.radius,
      stunned: input.nowMs < bubble.flags.stunUntil,
      sticky: ceiling !== null && ceiling.kind === 'pegajosa',
      chargeMul: input.env.chargeMul,
      impulseMul: input.env.impulseMul,
    },
    t,
  );

  bubble.vel = launchVelocity(bubble.pullTheta, impulse);
  bubble.state = 'LAUNCHED';
  bubble.launchedMs = 0;
  bubble.lastLaunchPower = power;
  clearAim(bubble);
  events.push({
    type: 'launch',
    power,
    vel: { x: bubble.vel.x, y: bubble.vel.y },
    at: { x: bubble.pos.x, y: bubble.pos.y },
    airLaunch,
  });

  if (airLaunch) {
    bubble.airLaunchesUsed += 1;
    const change = applyAirLoss(bubble, run, 'airLaunch', bubble.pos, input.nowMs, t);
    events.push(...change.events);
    return;
  }
  // A trap escape leaves no ledge and spends no budget: nothing to detach, nothing to report.
  if (!fromRest) return;
  // State is already LAUNCHED, so `detachRest` only clears the attachment and reports it.
  detachRest(bubble, 'launch', events);
  if (ceilingId !== null) addPassThrough(bubble, ceilingId, input.nowMs + t.LAUNCH_LOCK_MS);
}

// ---------------------------------------------------------------------------------------------
// Resting
// ---------------------------------------------------------------------------------------------

/**
 * Anti-camping clock (§2.3), as revised by D2.
 *
 * On a POSADERO the clock is FROZEN while Bur aims: v1.1 could argue that a 3,0 s budget left room to
 * point because power was a 550 ms hold, and D2 replaced that with a 6 s slingshot the player is
 * expected to line up. Camping is still impossible, but not because the finger has to lift — that
 * costs one frame: the freeze is a loan, and `cancelAim` charges every gesture that ends without a
 * shot back to `restMs`, so a rest lasts at most REST_MAX_MS + AIM_MAX_MS however the finger drums.
 * IMPACIENTE and PEGAJOSA keep counting through the aim and eject Bur mid-gesture: "las superficies
 * impaciente y pegajosa mantienen sus temporizadores propios corriendo: es su carácter". The eject
 * cancels the aim through `detachRest`, so the player loses the shot, which is exactly the threat
 * those two surfaces are for.
 */
function stepRestClock(bubble: Bubble, input: BubbleStepInput, t: Tuning, events: GameEvent[]): void {
  const ceiling = findCeiling(input.solids, bubble.restingOnId);
  if (ceiling === null) return; // Already detached above; nothing left to time.
  if (bubble.state === 'AIMING' && ceiling.kind === 'posadero') return;

  bubble.restMs += input.dt * 1000;
  const maxRestMs = ceiling.maxRestMs ?? t.REST_MAX_MS[ceiling.kind];
  if (bubble.restMs + TIME_EPS_MS < maxRestMs) return;

  // Anti-camping pushes DOWNWARD (§2.3): never a free resaca for taking too long to aim.
  bubble.vel = { x: 0, y: t.REST_RELEASE_PUSH };
  detachRest(bubble, 'timeout', events);
  addPassThrough(bubble, ceiling.id, input.nowMs + t.LAUNCH_LOCK_MS);
}

/**
 * Ends the attachment to a ceiling. Returns to IDLE if Bur was RESTING or aiming from the ledge, and
 * an aim that loses its ledge is CANCELLED (D2): the shot was pulled against a surface that is no
 * longer there. It is also what lets `launch` assume that a detached aim is an air aim — `launch`
 * itself calls this AFTER moving to LAUNCHED, so it never cancels its own shot.
 */
function detachRest(bubble: Bubble, reason: 'timeout' | 'launch' | 'displaced', events: GameEvent[]): void {
  const aiming = bubble.state === 'AIMING';
  if (bubble.state === 'RESTING' || aiming) bubble.state = 'IDLE';
  bubble.restingOnId = null;
  bubble.restMs = 0;
  events.push({ type: 'restRelease', reason });
  if (aiming) cancelAim(bubble, 'displaced', events);
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
 * The capture arrow of §11.3 lands on RESTING whatever Bur was doing, but it does NOT end an aim that
 * is running: `aimOrigin` and the pull are left alone, so the next input phase resumes the gesture as
 * an aim from rest (pinned, free, sticky-launch aware) instead of throwing away the pull the player
 * is holding — and the shot stops costing a pip, because she is no longer in open water.
 * Resting is also what refills the D1 double jump: `airLaunchesUsed` is per AIRBORNE PHASE.
 */
function enterRest(bubble: Bubble, ceiling: Ceiling, input: BubbleStepInput, events: GameEvent[]): void {
  bubble.state = 'RESTING';
  bubble.airLaunchesUsed = 0;
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
