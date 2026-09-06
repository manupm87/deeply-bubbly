/**
 * D3: the world is WORLD_W wide and the view scrolls in BOTH axes, so the viewport → world conversion
 * is a rule of its own. It used to be "add camera.y"; getting the x half wrong would rotate every
 * slingshot pull (D2) by however far the camera has travelled sideways.
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { pointerToWorld, worldToPointer } from './pointer';

const t = createTuning();

describe('pointerToWorld', () => {
  it('adds the camera origin on both axes', () => {
    expect(pointerToWorld({ x: 40, y: 100 }, 360, 1200)).toEqual({ x: 400, y: 1300 });
  });

  it('is the identity at the top-left of the world', () => {
    expect(pointerToWorld({ x: 40, y: 100 }, 0, 0)).toEqual({ x: 40, y: 100 });
  });

  it('maps the whole viewport inside the world column when the camera is clamped right', () => {
    const camX = t.WORLD_W - t.VIEW_W;
    expect(pointerToWorld({ x: 0, y: 0 }, camX, 0).x).toBe(camX);
    expect(pointerToWorld({ x: t.VIEW_W, y: 0 }, camX, 0).x).toBe(t.WORLD_W);
  });

  it('round-trips through worldToPointer', () => {
    const world = pointerToWorld({ x: 123, y: 45 }, 360, 1200);
    expect(worldToPointer(world, 360, 1200)).toEqual({ x: 123, y: 45 });
  });

  it('is pure: it never touches the pointer it was given', () => {
    const pointer = { x: 10, y: 20 };
    pointerToWorld(pointer, 100, 200);
    expect(pointer).toEqual({ x: 10, y: 20 });
  });
});
