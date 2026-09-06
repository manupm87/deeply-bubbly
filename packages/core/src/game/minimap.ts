/**
 * Minimap model (DECISIONS-v1.2 D5). Pure: turns the streamed entities, the camera and Bur into a
 * `MinimapModel` in MINIMAP px, which the shell draws verbatim (`apps/web/src/ui/Minimap.ts`) and
 * uses as the touch surface of the peek. The two conversions are the whole contract:
 *
 *   minimap px = (world - (0, worldTopY)) * MINIMAP_SCALE        (`buildMinimap`)
 *   world      = minimap px / MINIMAP_SCALE + (0, worldTopY)    (`minimapToWorld`)
 *
 * The map is anchored on the LIVE camera (`worldTopY = camera.y - MINIMAP_ABOVE_PX`), never on the
 * peeked view: the frame moves inside a still map. Marks are clipped to the map. What counts as a mark:
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
import type { Bubble, Camera, MinimapModel, WorldEntity } from '../types';

export function buildMinimap(
  entities: readonly WorldEntity[],
  cam: Readonly<Camera>,
  bubble: Readonly<Bubble>,
  t: Tuning,
): MinimapModel {
  // STUB (contract only): implemented by the D5 workflow with tests in minimap.test.ts.
  void entities;
  const scale = t.MINIMAP_SCALE;
  const worldTopY = cam.y - t.MINIMAP_ABOVE_PX;
  return {
    w: t.WORLD_W * scale,
    h: t.MINIMAP_WORLD_H * scale,
    scale,
    worldTopY,
    view: { x: cam.renderX * scale, y: (cam.renderY - worldTopY) * scale, w: cam.viewW * scale, h: cam.viewH * scale },
    bur: { x: bubble.pos.x * scale, y: (bubble.pos.y - worldTopY) * scale },
    marks: [],
  };
}

/** Minimap px (relative to the map's top-left) → world px. Inverse of the mapping in `buildMinimap`. */
export function minimapToWorld(point: Vec2, model: Pick<MinimapModel, 'scale' | 'worldTopY'>): Vec2 {
  return { x: point.x / model.scale, y: point.y / model.scale + model.worldTopY };
}
