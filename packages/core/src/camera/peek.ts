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
 *
 * Three things the implementation added to that contract, all of them consequences of the offset
 * outliving the frame it was aimed on (the camera keeps moving under it, and so does the streamed
 * window):
 *  - The clamp is re-applied to the OFFSET every step, not only to the target, or a window that
 *    scrolled away under a held peek would keep showing water that is no longer streamed. It may only
 *    ever pull the offset back TOWARDS zero (`shrinkInto`): when the camera itself sits outside the
 *    legal band — it outran the streamer during a fast fall — the un-peeked view (offset 0) has to
 *    stay reachable, and a clamp that could push the offset away from zero would strand the render
 *    view off the camera forever.
 *  - The return snaps to exactly zero below `SNAP_PX` (a quarter of a design pixel, invisible), so a
 *    released peek really does end with `renderX === x` instead of an exponential tail that never
 *    quite lands. Nothing else in the file has a dead band.
 *  - `bounds` always contains `cam.y` (see `peekBounds`), so "no peek" is always a legal peek. At the
 *    surface the camera hangs above y = 0 with nothing streamed over it, and without that repair the
 *    first "look up" of a run would answer by shoving the view DOWN into the first streamed row.
 *
 * Non-finite input (a NaN world point out of a shell that divided by a zero-sized minimap, a NaN `dt`)
 * is treated as "no peek this step" rather than allowed to poison the offset permanently.
 */
import { clamp, smoothK } from '../math/vec';
import { cameraXRange } from './camera';
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
 * Below this the returning offset is set to exactly zero: a quarter of a design pixel is invisible in
 * a game the shell draws on a pixel grid, and it is what makes "released" mean `renderX === x` inside
 * the 1,5 s the e2e budgets for the glide instead of an exponential tail that never quite lands.
 */
const SNAP_PX = 0.25;

/**
 * Top-left of a view centred on `centre`, clamped to the world column and to `bounds`. Pure; the
 * shell reuses it (through the minimap model) to draw the frame where the finger is.
 */
export function peekTopLeft(centre: Vec2, cam: Camera, bounds: PeekBounds, t: Tuning): Vec2 {
  return {
    x: clamp(centre.x - cam.viewW / 2, 0, cameraXRange(cam.viewW, t)),
    y: clamp(centre.y - cam.viewH / 2, bounds.minY, bounds.maxY),
  };
}

/**
 * The peek bounds GameWorld hands to `stepPeek`: PEEK_UP_PX above the live camera, PEEK_DOWN_PX below,
 * and never outside the streamed window `[streamTopY, streamBottomY]` (the view must fit inside it).
 * Returns `minY <= maxY` always: an intersection, a collapse and one repair, below.
 *
 * The two constraints are an intersection, and the streamed window wins when they do not meet: showing
 * un-streamed water is a visible hole, while a peek that reaches less far than PEEK_DOWN_PX is only a
 * shorter look. When the window itself is shorter than the view there is no fully legal top edge, so
 * the band collapses on the one that centres the view in the window and shares the overflow.
 *
 * Then one repair, which is what the surface taught us: the band ALWAYS contains `cam.y`, because
 * the un-peeked view is drawn every frame anyway and "no peek" has to stay a legal peek. A run starts
 * with the camera ~120 px above y = 0 (Bur hangs under the raft) and there is no chunk to stream above
 * the surface, so without this the first "look up" of every run would answer by shoving the view DOWN
 * to the first streamed row — the opposite of what the finger asked for.
 *
 * Neither the collapse nor that repair does anything in normal play: while the camera's own view is
 * inside the streamed window, the intersection already contains `cam.y` and already lies inside the
 * reach. When it is NOT — the §4.3 ratchet alone outruns the streamer by up to ~160 px when Bur bounces
 * back up and the camera stays down in its recall band — the collapse can put the band FURTHER from
 * the camera than PEEK_UP_PX /
 * PEEK_DOWN_PX: the finger gets a slightly longer look, and every extra pixel of it is streamed water
 * that is nearer the window than the un-peeked view already is. That is deliberate and it is the same
 * priority as everywhere else here: showing un-streamed water is a hole the player sees, a reach a few
 * px longer than §11.6 is not. The relative promise — a peek never sticks out further than the camera
 * already does — is the one that holds unconditionally (`shrinkInto`).
 */
export function peekBounds(cam: Camera, streamTopY: number, streamBottomY: number, t: Tuning): PeekBounds {
  const windowLo = streamTopY;
  const windowHi = streamBottomY - cam.viewH;
  let minY = Math.max(cam.y - t.PEEK_UP_PX, windowLo);
  let maxY = Math.min(cam.y + t.PEEK_DOWN_PX, windowHi);
  if (minY > maxY) {
    // The reach and the window do not overlap. Stay in the window: either the nearest legal top edge
    // to where the camera is, or — with no legal top edge at all — the one that centres the view.
    const collapsed = windowLo > windowHi ? (windowLo + windowHi) / 2 : clamp(cam.y, windowLo, windowHi);
    minY = collapsed;
    maxY = collapsed;
  }
  // "No peek" is always legal: `cam.y` is where the game draws anyway, and the offset has to be able
  // to come home to zero (see the surface, in the doc above).
  minY = Math.min(minY, cam.y);
  maxY = Math.max(maxY, cam.y);
  // Totality: a non-finite window (or camera) must not turn into a NaN band that poisons the offset.
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    const safe = Number.isFinite(cam.y) ? cam.y : 0;
    return { minY: safe, maxY: safe };
  }
  return { minY, maxY };
}

/** Mutates `cam.peekX`, `cam.peekY`, `cam.renderX`, `cam.renderY` only. Call AFTER `stepCamera`. */
export function stepPeek(cam: Camera, input: PeekInput, t: Tuning): void {
  const dt = Number.isFinite(input.dt) ? Math.max(0, input.dt) : 0;
  const target = finiteTarget(input.target);

  if (target !== null) {
    // Chase the CLAMPED top-left of a view centred on the target, expressed as an offset from the
    // live camera: as the camera keeps following Bur, the offset shrinks by itself and the peeked
    // world point stays under the finger.
    const topLeft = peekTopLeft(target, cam, input.bounds, t);
    const k = smoothK(t.PEEK_LAMBDA, dt);
    cam.peekX += (topLeft.x - cam.x - cam.peekX) * k;
    cam.peekY += (topLeft.y - cam.y - cam.peekY) * k;
  } else if (!input.hold) {
    // Released and nothing is aiming: glide home. `hold` (a live pull) skips exactly this branch, so
    // the view the player aimed on is the view she shoots on.
    const k = smoothK(t.PEEK_RETURN_LAMBDA, dt);
    cam.peekX -= cam.peekX * k;
    cam.peekY -= cam.peekY * k;
    if (Math.abs(cam.peekX) < SNAP_PX) cam.peekX = 0;
    if (Math.abs(cam.peekY) < SNAP_PX) cam.peekY = 0;
  }

  cam.peekX = shrinkInto(cam.peekX, cam.x, 0, cameraXRange(cam.viewW, t));
  cam.peekY = shrinkInto(cam.peekY, cam.y, input.bounds.minY, input.bounds.maxY);
  cam.renderX = cam.x + cam.peekX;
  cam.renderY = cam.y + cam.lookaheadPx + cam.peekY;
}

/**
 * Re-publishes `renderX`/`renderY` (and re-clamps `peekX` to the world column) OUTSIDE the step, for
 * the one thing that changes the view between two steps: a resize. `setViewWidth` already re-clamps
 * `camera.x` on the spot because "the shell places the camera verbatim" — since D5 the number the
 * shell places is `renderX`, so it has to be just as fresh, or a widened view is drawn one frame past
 * the right edge of the world. The vertical clamp needs the streamed window and so stays in `stepPeek`;
 * only the derived `renderY` is republished here.
 */
export function refreshPeekRender(cam: Camera, t: Tuning): void {
  cam.peekX = shrinkInto(cam.peekX, cam.x, 0, cameraXRange(cam.viewW, t));
  cam.renderX = cam.x + cam.peekX;
  cam.renderY = cam.y + cam.lookaheadPx + cam.peekY;
}

/** The requested centre, or null when there is none to chase (released, or not a real point). */
function finiteTarget(target: Vec2 | null): Vec2 | null {
  if (target === null) return null;
  return Number.isFinite(target.x) && Number.isFinite(target.y) ? target : null;
}

/**
 * Pull `offset` back until `base + offset` is inside `[lo, hi]`, but only ever TOWARDS zero. A clamp
 * that could grow the offset would answer "the camera is outside the legal band" by shoving the drawn
 * view even further off it, and the offset would never reach zero again.
 */
function shrinkInto(offset: number, base: number, lo: number, hi: number): number {
  if (!Number.isFinite(offset)) return 0;
  const clamped = clamp(base + offset, lo, hi) - base;
  if (!Number.isFinite(clamped)) return offset;
  if (offset > 0) return clamp(clamped, 0, offset);
  if (offset < 0) return clamp(clamped, offset, 0);
  return 0;
}
