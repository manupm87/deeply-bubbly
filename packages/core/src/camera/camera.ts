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
  void cam; void input; void t;
  throw new Error('not implemented');
}

export function createCamera(burY: number, viewH: number, t: Tuning): Camera {
  void burY; void viewH; void t;
  throw new Error('not implemented');
}

/** True when Bur's circle is entirely above the top edge of the view (resaca condition, §2.4.2). */
export function isAboveView(cam: Camera, burY: number, radius: number): boolean {
  void cam; void burY; void radius;
  throw new Error('not implemented');
}
