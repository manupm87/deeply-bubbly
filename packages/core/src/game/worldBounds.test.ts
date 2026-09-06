/**
 * §4.3: "el mundo mide exactamente 180 px de ancho, con paredes laterales sólidas en todas las zonas".
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { moveCircle } from '../physics/collision';
import { WALL_LEFT_ID, WALL_RIGHT_ID, createWorldWalls, updateWorldWalls } from './worldBounds';
import type { Tuning } from '../tuning';

const T: Tuning = createTuning();

describe('the column walls', () => {
  it('close the world at x = 0 and x = WORLD_W without narrowing it', () => {
    const [left, right] = updateWorldWalls(createWorldWalls(T), 500, 0, T);
    expect(left.id).toBe(WALL_LEFT_ID);
    expect(right.id).toBe(WALL_RIGHT_ID);
    expect(left.rect.x + left.rect.w).toBe(0);
    expect(right.rect.x).toBe(T.WORLD_W);
    expect(left.rect.y).toBeLessThan(500);
    expect(left.rect.y + left.rect.h).toBeGreaterThan(500);
  });

  it('follows Bur down the column', () => {
    const walls = createWorldWalls(T);
    updateWorldWalls(walls, 20_000, 5, T);
    for (const wall of walls) {
      expect(wall.rect.y).toBeLessThan(20_000);
      expect(wall.rect.y + wall.rect.h).toBeGreaterThan(20_000);
    }
  });

  it('bounces at the hadal restitution in Z6, where the wall chain IS the verb (§5 nº 25)', () => {
    const [left] = updateWorldWalls(createWorldWalls(T), 21_000, 5, T);
    expect(left.restitution).toBe(T.RESTITUTION_HADAL_WALL);
    expect(left.material).toBe('hadal');
    const [rock] = updateWorldWalls(createWorldWalls(T), 500, 0, T);
    expect(rock.restitution).toBe(T.RESTITUTION_ROCK);
  });

  it('turns a lateral shot back into the column instead of losing Bur (§4.3)', () => {
    const walls = updateWorldWalls(createWorldWalls(T), 500, 0, T);
    let pos = { x: 170, y: 500 };
    let vel = { x: 400, y: 0 };
    for (let i = 0; i < 30; i++) {
      const moved = moveCircle(pos, vel, 7, T.FIXED_DT, walls, { lateralFriction: T.LATERAL_FRICTION, timeMs: i * 16 });
      pos = moved.pos;
      vel = moved.vel;
    }
    expect(pos.x).toBeLessThanOrEqual(T.WORLD_W);
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(vel.x).toBeLessThan(0); // sent back inward
  });
});
