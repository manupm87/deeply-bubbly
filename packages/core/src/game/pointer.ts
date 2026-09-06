/**
 * Viewport px → world px, the single conversion in the project (DECISIONS-v1.2 D3).
 *
 * Before D3 the world was exactly as wide as the view, so x was 1:1 and only y scrolled; `GameWorld`
 * could add `camera.y` inline. A 540 px world scrolls in BOTH axes, and the slingshot of D2 measures a
 * drag between a frozen world origin and a live finger — so getting one axis wrong rotates every shot.
 * One pure function, used by `GameWorld` and by anything that has to reproduce what the finger meant.
 *
 * `camX` / `camY` are the TOP-LEFT of the view in world px (`camera.x`, `camera.y`), never `renderY`:
 * the §7 lookahead is a drawing offset and the rules are written against the ratchet position.
 */
import type { Vec2 } from '../math/vec';
import type { PointerInput } from '../types';

/** World point under a pointer sampled in viewport coordinates. */
export function pointerToWorld(pointer: Pick<PointerInput, 'x' | 'y'>, camX: number, camY: number): Vec2 {
  return { x: pointer.x + camX, y: pointer.y + camY };
}

/** Viewport point of a world position: the inverse of `pointerToWorld`, for guides and HUD probes. */
export function worldToPointer(world: Vec2, camX: number, camY: number): Vec2 {
  return { x: world.x - camX, y: world.y - camY };
}
