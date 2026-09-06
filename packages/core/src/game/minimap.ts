/**
 * Minimap model (DECISIONS-v1.2 D5). Pure: turns the streamed entities, the camera and Bur into a
 * `MinimapModel` in MINIMAP px, which the shell draws verbatim (`apps/web/src/ui/Minimap.ts`) and
 * uses as the touch surface of the peek. The two conversions are the whole contract:
 *
 *   minimap px = (world - (0, worldTopY)) * MINIMAP_SCALE        (`buildMinimap`)
 *   world      = minimap px / MINIMAP_SCALE + (0, worldTopY)    (`minimapToWorld`)
 *
 * The map is anchored on the LIVE camera (`worldTopY = camera.y - MINIMAP_ABOVE_PX`), never on the
 * peeked view: the frame moves inside a still map. MARKS are clipped to the map; the view frame and
 * `bur` are NOT — the shell needs the true rect and the true centre to tell the player how far out of
 * the map she is looking, and it clamps both of them when it draws them. What counts as a mark:
 *   ceiling capturable      → 'ledge'        (rect)
 *   ceiling not capturable  → 'ledgeNoRest'  (rect)
 *   wall                    → nothing (the reef walls are the map's edges)
 *   hazard                  → 'hazard'       (shape rect, min 1×1)
 *   pickup                  → 'pickup'       (1×1 at pos)
 *   forcefield              → 'field'        (rect)
 *   boya                    → 'boya'         (full-width 1 px line at worldY)
 *   station                 → 'station'      (full-width band at worldY, CHUNK_H tall)
 *   anchor                  → nothing
 */
import type { Vec2 } from '../math/vec';
import type { Tuning } from '../tuning';
import type { Bubble, Camera, MinimapMark, MinimapMarkKind, MinimapModel, WorldEntity } from '../types';

/**
 * Clip to the map and push at most ONE mark. Everything is passed as numbers so a mark that never
 * makes it onto the map costs no object at all: this runs over the whole streamed window on every
 * snapshot. A mark that touches the map only at its edge (zero area after clipping) is dropped.
 */
function pushMark(
  out: MinimapMark[],
  kind: MinimapMarkKind,
  x: number,
  y: number,
  w: number,
  h: number,
  mapW: number,
  mapH: number,
): void {
  // Totality, on the same data path the finger reads back (`minimapToWorld`): a NaN coordinate makes
  // every comparison below false, so the clip test would let a NaN mark through and the shell would
  // ask Phaser to fill a NaN rect. `camera/peek.ts` refuses non-finite input for the same reason.
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return;
  const left = x < 0 ? 0 : x;
  const top = y < 0 ? 0 : y;
  const right = x + w;
  const bottom = y + h;
  const clippedRight = right > mapW ? mapW : right;
  const clippedBottom = bottom > mapH ? mapH : bottom;
  if (clippedRight <= left || clippedBottom <= top) return;
  out.push({
    kind,
    rect: {
      x: left,
      y: top,
      // A mark that was not clipped keeps its size EXACTLY: `(x + w) - x` is not `w` in floating
      // point, and a rect that changes width with the camera's decimals shimmers on the map.
      w: left === x && clippedRight === right ? w : clippedRight - left,
      h: top === y && clippedBottom === bottom ? h : clippedBottom - top,
    },
  });
}

export function buildMinimap(
  entities: readonly WorldEntity[],
  cam: Readonly<Camera>,
  bubble: Readonly<Bubble>,
  t: Tuning,
): MinimapModel {
  const scale = t.MINIMAP_SCALE;
  // Anchored on the LIVE camera, never on `renderY`: the frame is what moves while the player peeks.
  const worldTopY = cam.y - t.MINIMAP_ABOVE_PX;
  const w = t.WORLD_W * scale;
  const h = t.MINIMAP_WORLD_H * scale;
  const stationH = t.CHUNK_H * scale;
  const marks: MinimapMark[] = [];
  // Indexed on purpose: the array iterator of `for...of` allocates a result object per entity, and
  // this loop runs over the streamed window on every snapshot. One pass, no temporaries.
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e === undefined) continue;
    switch (e.type) {
      case 'ceiling':
        pushMark(
          marks,
          e.capturable ? 'ledge' : 'ledgeNoRest',
          e.rect.x * scale,
          (e.rect.y - worldTopY) * scale,
          e.rect.w * scale,
          e.rect.h * scale,
          w,
          h,
        );
        break;
      case 'hazard':
        // A crown is 6 px across in world px: without the floor it would be 0,6 px of nothing.
        pushMark(
          marks,
          'hazard',
          e.shape.x * scale,
          (e.shape.y - worldTopY) * scale,
          Math.max(1, e.shape.w * scale),
          Math.max(1, e.shape.h * scale),
          w,
          h,
        );
        break;
      case 'forcefield':
        pushMark(
          marks,
          'field',
          e.rect.x * scale,
          (e.rect.y - worldTopY) * scale,
          e.rect.w * scale,
          e.rect.h * scale,
          w,
          h,
        );
        break;
      case 'pickup':
        pushMark(marks, 'pickup', e.pos.x * scale, (e.pos.y - worldTopY) * scale, 1, 1, w, h);
        break;
      case 'boya':
        pushMark(marks, 'boya', 0, (e.worldY - worldTopY) * scale, w, 1, w, h);
        break;
      case 'station':
        pushMark(marks, 'station', 0, (e.worldY - worldTopY) * scale, w, stationH, w, h);
        break;
      // A wall IS the edge of the map, and an anchor is a rule, not a thing the player can see.
      case 'wall':
      case 'anchor':
        break;
    }
  }
  return {
    w,
    h,
    scale,
    worldTopY,
    // The DRAWN view (with the peek): it may stick out of the map, and it is never clipped — the
    // shell needs the true frame to tell the player how far out of the map she is looking.
    view: { x: cam.renderX * scale, y: (cam.renderY - worldTopY) * scale, w: cam.viewW * scale, h: cam.viewH * scale },
    bur: { x: bubble.pos.x * scale, y: (bubble.pos.y - worldTopY) * scale },
    marks,
  };
}

/** Minimap px (relative to the map's top-left) → world px. Inverse of the mapping in `buildMinimap`. */
export function minimapToWorld(point: Vec2, model: Pick<MinimapModel, 'scale' | 'worldTopY'>): Vec2 {
  return { x: point.x / model.scale, y: point.y / model.scale + model.worldTopY };
}
