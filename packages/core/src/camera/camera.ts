import { clamp, smoothK } from '../math/vec';
import type { Tuning } from '../tuning';
import type { Camera, GameEvent, ZoneIndex } from '../types';

export interface CameraStepInput {
  /**
   * D3: Bur's x in world px, which drives the horizontal follow. Optional so a caller that only
   * exercises the §4.3 ratchet (the Y tests) can leave the column alone: with no x reported there is
   * nothing to follow and `cam.x` keeps whatever `createCamera` centred it on.
   */
  burX?: number;
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
 *   X (D3): if bur outside CAM_DEADZONE_X of the view: cam.x += (edge target - cam.x) * k(lambda)
 *           cam.x = clamp(cam.x, 0, WORLD_W - viewW)   — no ratchet, no recall
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
  const { burX, burY, burVelY, zone, ascenso, nowMs, dt } = input;

  // --- Horizontal follow (D3). No ratchet, no recall: X is free in both directions. -------------
  if (burX !== undefined) stepCameraX(cam, burX, dt, t);

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

/** The band of world x the view may take, given a world WORLD_W px wide (D3). Never negative. */
export function cameraXRange(viewW: number, t: Tuning): number {
  return Math.max(0, t.WORLD_W - viewW);
}

/**
 * D3 horizontal follow. The world is `WORLD_W` px wide and the view only `viewW` of it, so the camera
 * tracks Bur in X too — but only once she leaves the CAM_DEADZONE_X band of the view, and only far
 * enough to put her back on the edge of that band. Tracking her centre instead would glue the view to
 * every sideways bounce; the dead zone is what keeps a wall chain readable.
 *
 * Frame-rate independent through the same `smoothK` the Y follow uses (§11.7.5), and clamped to
 * `[0, WORLD_W - viewW]` so the reef walls at x = 0 and x = WORLD_W are never crossed by the view.
 * There is no ratchet and no recall band here: only descent is one-way (§4.3).
 */
function stepCameraX(cam: Camera, burX: number, dt: number, t: Tuning): void {
  const [dzLo, dzHi] = t.CAM_DEADZONE_X;
  const loEdge = cam.x + cam.viewW * dzLo;
  const hiEdge = cam.x + cam.viewW * dzHi;
  const target = burX < loEdge ? burX - cam.viewW * dzLo : burX > hiEdge ? burX - cam.viewW * dzHi : cam.x;
  if (target !== cam.x) {
    const dist = Math.abs(target - cam.x);
    const lambda = dist > t.CAM_FAST_DIST_PX ? t.CAM_LAMBDA_FAST : t.CAM_LAMBDA;
    cam.x += (target - cam.x) * smoothK(lambda, dt);
  }
  cam.x = clamp(cam.x, 0, cameraXRange(cam.viewW, t));
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

/**
 * A camera looking at Bur: anchored on her in Y (§4.3) and CENTRED on her in X (D3), clamped to the
 * world column. `burX` and `viewW` are optional so a caller that only cares about the §4.3 ratchet
 * still reads as a single column; they default to the middle of the world at the standard `VIEW_W`,
 * which is where a run starts (`respawn` spawns Bur at `WORLD_W / 2`).
 */
export function createCamera(
  burY: number,
  viewH: number,
  t: Tuning,
  burX: number = t.WORLD_W / 2,
  viewW: number = t.VIEW_W,
): Camera {
  const y = burY - viewH * t.CAM_ANCHOR;
  return {
    x: clamp(burX - viewW / 2, 0, cameraXRange(viewW, t)),
    viewW,
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
