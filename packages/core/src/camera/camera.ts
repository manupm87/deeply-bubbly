import { clamp, smoothK } from '../math/vec';
import type { Tuning } from '../tuning';
import type { Camera, GameEvent, ZoneIndex } from '../types';

export interface CameraStepInput {
  burY: number;
  burVelY: number;
  zone: ZoneIndex;
  ascenso: boolean;
  nowMs: number;
  dt: number;
}

/** Recall band width for the current ascenso state (§4.3). */
function recallFor(ascenso: boolean, t: Tuning): number {
  return ascenso ? t.CAM_RECALL_ASCENSO_PX : t.CAM_RECALL_PX;
}

/**
 * Ratchet camera with recall band (§4.3, §11.4). Mutates `cam`. Frame-rate independent (smoothK).
 *   target = burY - viewH * CAM_ANCHOR
 *   if bur outside deadzone [0.34H, 0.56H] of the view: cam.y += (target - cam.y) * k(dist > 90 ? FAST : NORMAL)
 *   cam.maxY = max(cam.maxY, cam.y)
 *   recall = ascenso ? CAM_RECALL_ASCENSO_PX : CAM_RECALL_PX
 *   cam.y = clamp(cam.y, cam.maxY - recall, cam.maxY)
 *   if zone >= CAM_MIN_SCROLL_FROM_ZONE && !ascenso: cam.y += CAM_MIN_SCROLL * dt  (then re-ratchet maxY)
 *   if |burVelY| > CAM_ZOOM_PUNCH_SPEED and no punch active: start zoom punch (event zoomPunch)
 * Returns events (zoomPunch).
 */
export function stepCamera(cam: Camera, input: CameraStepInput, t: Tuning): GameEvent[] {
  const events: GameEvent[] = [];
  const { burY, burVelY, zone, ascenso, nowMs, dt } = input;

  // --- Follow, but only outside the dead zone -------------------------------------------------
  const target = burY - cam.viewH * t.CAM_ANCHOR;
  const [dzLo, dzHi] = t.CAM_DEADZONE;
  const outsideDeadzone = burY < cam.y + cam.viewH * dzLo || burY > cam.y + cam.viewH * dzHi;
  if (outsideDeadzone) {
    const dist = Math.abs(target - cam.y);
    const lambda = dist > t.CAM_FAST_DIST_PX ? t.CAM_LAMBDA_FAST : t.CAM_LAMBDA;
    cam.y += (target - cam.y) * smoothK(lambda, dt);
  }

  // --- Ratchet + recall band ------------------------------------------------------------------
  const recall = recallFor(ascenso, t);
  cam.recallPx = recall;
  cam.maxY = Math.max(cam.maxY, cam.y);
  cam.y = clamp(cam.y, cam.maxY - recall, cam.maxY);

  // --- Minimum current: constant downward pressure from Z3, suspended during ascenso (§4.3) ----
  if (zone >= t.CAM_MIN_SCROLL_FROM_ZONE && !ascenso) {
    cam.y += t.CAM_MIN_SCROLL * dt;
    cam.maxY = Math.max(cam.maxY, cam.y);
    cam.y = clamp(cam.y, cam.maxY - recall, cam.maxY);
  }

  // --- Zoom punch: extreme vertical speed in EITHER direction (§4.3) --------------------------
  if (cam.zoomPunchUntil > 0 && nowMs >= cam.zoomPunchUntil) {
    cam.zoomPunchUntil = 0;
    cam.zoom = 1;
  }
  if (cam.zoomPunchUntil === 0 && Math.abs(burVelY) > t.CAM_ZOOM_PUNCH_SPEED) {
    cam.zoomPunchUntil = nowMs + t.CAM_ZOOM_PUNCH_MS;
    cam.zoom = 1 - t.CAM_ZOOM_PUNCH_PCT; // zoom OUT: more world visible
    events.push({ type: 'zoomPunch', pct: t.CAM_ZOOM_PUNCH_PCT, ms: t.CAM_ZOOM_PUNCH_MS });
  }

  // --- Shake decays on its own clock; the trigger lives in GameWorld --------------------------
  if (cam.shakeUntil > 0 && nowMs >= cam.shakeUntil) {
    cam.shakeUntil = 0;
    cam.shakePx = 0;
  }

  stepLookahead(cam, burVelY, t);

  return events;
}

/**
 * §7 lookahead: the view leads Bur by up to CAM_LOOKAHEAD_PX in the direction she is travelling,
 * approached with CAM_LOOKAHEAD_LERP per fixed step. It is a RENDERING offset only — `cam.y` stays
 * the ratchet position every rule (resaca, recall band, deadzone) is written against, and `renderY`
 * is what the shell must draw from, so the backdrop and the world can never disagree.
 */
function stepLookahead(cam: Camera, burVelY: number, t: Tuning): void {
  const target = t.CAM_LOOKAHEAD_PX * clamp(burVelY / t.MAX_FALL_SPEED, -1, 1);
  cam.lookaheadPx += (target - cam.lookaheadPx) * clamp(t.CAM_LOOKAHEAD_LERP, 0, 1);
  cam.renderY = cam.y + cam.lookaheadPx;
}

export function createCamera(burY: number, viewH: number, t: Tuning): Camera {
  const y = burY - viewH * t.CAM_ANCHOR;
  return {
    y,
    maxY: y,
    recallPx: t.CAM_RECALL_PX,
    zoom: 1,
    zoomPunchUntil: 0,
    shakePx: 0,
    shakeUntil: 0,
    viewH,
    lookaheadPx: 0,
    renderY: y,
  };
}

/** True when Bur's circle is entirely above the top edge of the view (resaca condition, §2.4.2). */
export function isAboveView(cam: Camera, burY: number, radius: number): boolean {
  return burY + radius < cam.y;
}
