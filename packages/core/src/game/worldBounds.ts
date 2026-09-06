/**
 * The two side walls of the column (DECISIONS-v1.2 D3: "paredes laterales sólidas en x < 0 y
 * x > WORLD_W en todas las zonas", with the world now `WORLD_W` = 540 px wide — three screens of
 * `VIEW_W`). They are a property of the world, not of a chunk: no authored chunk declares them, so
 * without this the column is open at both sides and a lateral shot — D2's cone reaches the horizontal
 * itself, `AIM_CONE_DEG` = 90 — carries Bur out of it for good, because `DAMPING_X` is 0.30 /s and
 * nothing pushes her back. §5 nº 25 makes them level geometry in Z6, where the wall chain IS the verb.
 *
 * They are rebuilt around Bur every step instead of spanning the whole 25.920 px column so the swept
 * collision never has to consider a rect thousands of pixels away from her.
 */
import type { Tuning } from '../tuning';
import type { Wall, ZoneIndex } from '../types';

export const WALL_LEFT_ID = 'world:wall-left';
export const WALL_RIGHT_ID = 'world:wall-right';

/** Thickness of each wall slab in px. Only its inner face is ever touched; the sweep cannot tunnel it. */
const WALL_THICKNESS = 512;

/**
 * Vertical half-extent around Bur, in px. One step moves her at most MAX_FALL_SPEED * FIXED_DT ≈ 9 px,
 * so a whole viewport of margin on each side is far past what any sweep can reach.
 */
const WALL_HALF_H = 1024;

/**
 * §5 nº 25: the hadal trench walls bounce at 0,85, which is what makes the Z6 wall chain survive the
 * horizontal damping. Everywhere else they are the ordinary rock of §11.6.
 */
function wallRestitution(zone: ZoneIndex, t: Tuning): number {
  return zone === 5 ? t.RESTITUTION_HADAL_WALL : t.RESTITUTION_ROCK;
}

/** Mutates `out` (two walls, reused across steps) to bracket `centreY` in zone `zone`. */
export function updateWorldWalls(out: [Wall, Wall], centreY: number, zone: ZoneIndex, t: Tuning): [Wall, Wall] {
  const [left, right] = out;
  const y = centreY - WALL_HALF_H;
  const h = WALL_HALF_H * 2;
  const restitution = wallRestitution(zone, t);
  const material: Wall['material'] = zone === 5 ? 'hadal' : 'rock';

  left.rect.x = -WALL_THICKNESS;
  left.rect.y = y;
  left.rect.w = WALL_THICKNESS;
  left.rect.h = h;
  left.restitution = restitution;
  left.material = material;

  right.rect.x = t.WORLD_W;
  right.rect.y = y;
  right.rect.w = WALL_THICKNESS;
  right.rect.h = h;
  right.restitution = restitution;
  right.material = material;

  return out;
}

/** The pair of wall objects, allocated once per world and kept up to date by `updateWorldWalls`. */
export function createWorldWalls(t: Tuning): [Wall, Wall] {
  const wall = (id: string): Wall => ({
    type: 'wall',
    id,
    rect: { x: 0, y: 0, w: 0, h: 0 },
    restitution: t.RESTITUTION_ROCK,
    material: 'rock',
  });
  return updateWorldWalls([wall(WALL_LEFT_ID), wall(WALL_RIGHT_ID)], 0, 0, t);
}
