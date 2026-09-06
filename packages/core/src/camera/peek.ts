/**
 * Peek ("ojeo", DECISIONS-v1.2 D5): the player looks around before committing a shot.
 *
 * The world is three screens wide (D3) and a full-power shot travels most of a screen (D4), so the
 * ledge a player wants is off-screen more often than not. The minimap in the HUD is the control: while
 * a finger holds it, the shell asks `GameWorld.setPeek(worldPoint)` to CENTRE the view on that point;
 * on release it asks `setPeek(null)` and the view glides back to Bur.
 *
 * The peek is a PRESENTATION offset (`camera.peekX/peekY`, folded into `renderX/renderY`), layered on
 * top of the §4.3 camera exactly like the §7 lookahead: `camera.x/y`, the ratchet, the recall band and
 * the resaca rule never see it. The one place besides drawing that reads it is the pointer conversion
 * (`GameWorld.pointerCam`): the finger points at what is on the glass, so the frozen aim origin must
 * include the peek — the pull itself is relative and cannot notice.
 *
 * Rules (all tested in `peek.test.ts`):
 *  - The target is clamped: x in [0, WORLD_W - viewW]; y in `bounds` (GameWorld computes them from
 *    PEEK_UP_PX / PEEK_DOWN_PX and the streamed chunk window, so a peek never shows un-streamed water).
 *  - The offset chases the clamped target with PEEK_LAMBDA and returns to zero with
 *    PEEK_RETURN_LAMBDA, both through `smoothK` (frame-rate independent, §11.7.5).
 *  - `hold` suspends the RETURN only: with `target === null` the offset stays where it is instead of
 *    gliding back. GameWorld sets it while a pull is live (`aimOrigin !== null`), so a view that was
 *    peeked when the pull started stays put until the shot or the cancel; a second finger that is still
 *    on the minimap (`target !== null`) keeps steering the view while the first one aims.
 *  - Never mutates `x`, `y`, `maxY`, `lookaheadPx`. Always recomputes `renderX = x + peekX` and
 *    `renderY = y + lookaheadPx + peekY`.
 */
import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { Camera } from '../types';

/** World-y band the TOP of the peeked view may occupy this step (inclusive). `minY <= maxY`. */
export interface PeekBounds {
  minY: number;
  maxY: number;
}

export interface PeekInput {
  /** World point the player wants CENTRED in the view, or null when nobody is peeking. */
  target: Vec2 | null;
  /** Suspend the glide back to zero while `target` is null (a pull is live). */
  hold: boolean;
  bounds: PeekBounds;
  dt: number;
}

/**
 * Top-left of a view centred on `centre`, clamped to the world column and to `bounds`. Pure; the
 * shell reuses it (through the minimap model) to draw the frame where the finger is.
 */
export function peekTopLeft(centre: Vec2, cam: Camera, bounds: PeekBounds, t: Tuning): Vec2 {
  // STUB (contract only): implemented by the D5 workflow with tests in peek.test.ts.
  void bounds;
  void t;
  return { x: centre.x - cam.viewW / 2, y: centre.y - cam.viewH / 2 };
}

/**
 * The peek bounds GameWorld hands to `stepPeek`: PEEK_UP_PX above the live camera, PEEK_DOWN_PX below,
 * and never outside the streamed window `[streamTopY, streamBottomY]` (the view must fit inside it).
 * Returns `minY <= maxY` always (collapses to the nearest legal value when the window is too short).
 */
export function peekBounds(cam: Camera, streamTopY: number, streamBottomY: number, t: Tuning): PeekBounds {
  // STUB (contract only): implemented by the D5 workflow with tests in peek.test.ts.
  void streamTopY;
  void streamBottomY;
  void t;
  return { minY: cam.y, maxY: cam.y };
}

/** Mutates `cam.peekX`, `cam.peekY`, `cam.renderX`, `cam.renderY` only. Call AFTER `stepCamera`. */
export function stepPeek(cam: Camera, input: PeekInput, t: Tuning): void {
  // STUB (contract only): implemented by the D5 workflow with tests in peek.test.ts.
  void input;
  void t;
  cam.peekX = 0;
  cam.peekY = 0;
  cam.renderX = cam.x + cam.peekX;
  cam.renderY = cam.y + cam.lookaheadPx + cam.peekY;
}
