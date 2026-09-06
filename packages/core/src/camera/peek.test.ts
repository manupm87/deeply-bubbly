/**
 * D5 "ojeo": the presentation offset the minimap drives. Every rule in the header of `peek.ts` has a
 * test here — the clamps, the collapse of an impossible band, the two lambdas, what `hold` does and
 * does not suspend, frame-rate independence, and the promise the rest of the game is written against:
 * the peek NEVER touches `x`, `y`, `maxY` or `lookaheadPx`.
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { createCamera } from './camera';
import { peekBounds, peekTopLeft, stepPeek } from './peek';
import type { PeekBounds, PeekInput } from './peek';
import type { Camera } from '../types';

const VIEW_H = 360;
const t = createTuning();
/** Right edge of the legal camera column: the world is three screens wide (D3). */
const X_MAX = t.WORLD_W - t.VIEW_W;

/** A camera looking at Bur in the middle of the world column, with the peek at rest. */
function camAt(burX: number, burY = 1000): Camera {
  return createCamera(burY, VIEW_H, t, burX, t.VIEW_W);
}

/** Bounds so wide that only the x clamp can bind; the y clamp gets its own tests. */
function wideBounds(cam: Camera): PeekBounds {
  return { minY: cam.y - 10_000, maxY: cam.y + 10_000 };
}

function step(cam: Camera, input: Partial<PeekInput> & Pick<PeekInput, 'target'>, dt = 1 / 60): void {
  stepPeek(cam, { hold: false, bounds: input.bounds ?? wideBounds(cam), dt, target: input.target }, t);
}

describe('peekTopLeft', () => {
  it('centres the view on the point when nothing binds', () => {
    const cam = camAt(270);
    const centre = { x: 270, y: cam.y + VIEW_H / 2 };
    const topLeft = peekTopLeft(centre, cam, wideBounds(cam), t);
    expect(topLeft.x).toBeCloseTo(270 - t.VIEW_W / 2, 10);
    expect(topLeft.y).toBeCloseTo(cam.y, 10);
  });

  it('clamps x to [0, WORLD_W - viewW]: the reef walls are never crossed by the view', () => {
    const cam = camAt(270);
    expect(peekTopLeft({ x: -400, y: cam.y }, cam, wideBounds(cam), t).x).toBe(0);
    expect(peekTopLeft({ x: 5000, y: cam.y }, cam, wideBounds(cam), t).x).toBe(X_MAX);
  });

  it('clamps y to the bounds it is given', () => {
    const cam = camAt(270);
    const bounds = { minY: cam.y - 50, maxY: cam.y + 80 };
    expect(peekTopLeft({ x: 270, y: -99_999 }, cam, bounds, t).y).toBe(bounds.minY);
    expect(peekTopLeft({ x: 270, y: 99_999 }, cam, bounds, t).y).toBe(bounds.maxY);
  });

  it('scales the x clamp with a resized view, like the camera itself does', () => {
    const cam = camAt(270);
    cam.viewW = 300;
    expect(peekTopLeft({ x: 5000, y: cam.y }, cam, wideBounds(cam), t).x).toBe(t.WORLD_W - 300);
  });
});

describe('peekBounds', () => {
  const WINDOW = { topY: 720, bottomY: 1920 }; // five chunks of the streamed column

  it('reaches PEEK_UP_PX above and PEEK_DOWN_PX below the LIVE camera', () => {
    const cam = camAt(270, 1200);
    const bounds = peekBounds(cam, WINDOW.topY, WINDOW.bottomY, t);
    expect(bounds.minY).toBeCloseTo(cam.y - t.PEEK_UP_PX, 10);
    expect(bounds.maxY).toBeCloseTo(cam.y + t.PEEK_DOWN_PX, 10);
  });

  it('never lets the view leave the streamed window, top or bottom', () => {
    const near = camAt(270, 1000); // camera near the top of the window
    const top = peekBounds(near, WINDOW.topY, WINDOW.bottomY, t);
    expect(near.y - t.PEEK_UP_PX).toBeLessThan(WINDOW.topY); // the reach would leave the window
    expect(top.minY).toBe(WINDOW.topY); // ...and the window is what wins

    const deep = camAt(270, 1600); // camera near the bottom of it
    const bottom = peekBounds(deep, WINDOW.topY, WINDOW.bottomY, t);
    expect(deep.y + t.PEEK_DOWN_PX).toBeGreaterThan(WINDOW.bottomY - deep.viewH);
    expect(bottom.maxY).toBe(WINDOW.bottomY - deep.viewH);
    expect(bottom.maxY + deep.viewH).toBeLessThanOrEqual(WINDOW.bottomY);
  });

  it('always contains the camera, so "no peek" is always a legal peek', () => {
    // The surface: the camera hangs above y = 0 (Bur is under the raft) and there is nothing to
    // stream above it. Looking up must do NOTHING — not shove the view down to the first streamed row.
    const cam = camAt(270, 40);
    expect(cam.y).toBeLessThan(0);
    const bounds = peekBounds(cam, 0, 960, t);
    expect(bounds.minY).toBe(cam.y);
    expect(peekTopLeft({ x: 270, y: -99_999 }, cam, bounds, t).y).toBe(cam.y);
  });

  it('always returns minY <= maxY, and finite numbers, over a sweep of windows', () => {
    for (let camY = 0; camY <= 3000; camY += 37) {
      for (const height of [0, 90, VIEW_H - 1, VIEW_H, 720, 1200]) {
        const cam = camAt(270, camY + VIEW_H * t.CAM_ANCHOR);
        const bounds = peekBounds(cam, camY - 200, camY - 200 + height, t);
        expect(Number.isFinite(bounds.minY)).toBe(true);
        expect(Number.isFinite(bounds.maxY)).toBe(true);
        expect(bounds.minY).toBeLessThanOrEqual(bounds.maxY);
      }
    }
  });

  it('collapses onto the centred view when the window is shorter than the view', () => {
    const cam = camAt(270, 500);
    const bounds = peekBounds(cam, 0, 300, t); // 300 px of water for a 360 px view
    // No top edge is fully legal, so the far end of the band is the one that shares the overflow.
    expect(bounds.minY).toBeCloseTo((0 + 300 - VIEW_H) / 2, 10);
    expect(bounds.minY + VIEW_H - 300).toBeCloseTo(0 - bounds.minY, 10);
    // And the near end is the camera itself: the view the game draws anyway stays reachable.
    expect(bounds.maxY).toBe(cam.y);
  });

  it('lets a camera that outran the window claw back towards it, and no further away', () => {
    const cam = camAt(270, 5000);
    const bounds = peekBounds(cam, 0, 720, t);
    expect(bounds.minY).toBe(720 - VIEW_H); // as deep as the streamed water allows, no deeper
    expect(bounds.maxY).toBe(cam.y); // and never past where the un-peeked view already is
  });

  it('is total: a non-finite window degrades to "no peek" instead of NaN', () => {
    const cam = camAt(270, 1200);
    const bounds = peekBounds(cam, Number.NaN, Number.NaN, t);
    expect(bounds.minY).toBe(cam.y);
    expect(bounds.maxY).toBe(cam.y);
  });
});

describe('stepPeek: chasing a target', () => {
  it('moves the offset a smoothK(PEEK_LAMBDA) fraction of the way on the first step', () => {
    const cam = camAt(90); // cam.x = 0
    const target = { x: 450, y: cam.y + VIEW_H / 2 };
    const wanted = peekTopLeft(target, cam, wideBounds(cam), t);
    step(cam, { target });
    expect(cam.peekX).toBeCloseTo((wanted.x - cam.x) * (1 - Math.exp(-t.PEEK_LAMBDA / 60)), 9);
    expect(cam.peekY).toBeCloseTo(0, 9);
  });

  it('converges on the clamped target: one second of holding lands the view on it', () => {
    const cam = camAt(90);
    const target = { x: 450, y: cam.y + 200 + VIEW_H / 2 };
    for (let i = 0; i < 60; i++) step(cam, { target });
    const wanted = peekTopLeft(target, cam, wideBounds(cam), t);
    expect(cam.renderX).toBeCloseTo(wanted.x, 2);
    expect(cam.renderY - cam.lookaheadPx).toBeCloseTo(wanted.y, 2);
  });

  it('cannot walk the drawn view out of the world column', () => {
    const cam = camAt(90);
    for (let i = 0; i < 600; i++) step(cam, { target: { x: 99_999, y: cam.y } });
    expect(cam.renderX).toBeCloseTo(X_MAX, 6);
    for (let i = 0; i < 600; i++) step(cam, { target: { x: -99_999, y: cam.y } });
    expect(cam.renderX).toBeCloseTo(0, 6);
  });

  it('cannot walk the drawn view out of the peek bounds', () => {
    const cam = camAt(270);
    const bounds = { minY: cam.y - 40, maxY: cam.y + 120 };
    for (let i = 0; i < 600; i++) step(cam, { target: { x: 270, y: 99_999 }, bounds });
    expect(cam.renderY).toBeCloseTo(bounds.maxY, 6);
    for (let i = 0; i < 600; i++) step(cam, { target: { x: 270, y: -99_999 }, bounds });
    expect(cam.renderY).toBeCloseTo(bounds.minY, 6);
  });

  it('follows the camera: the peeked WORLD point stays under the finger while the view scrolls', () => {
    const cam = camAt(270);
    const target = { x: 450, y: cam.y + 100 + VIEW_H / 2 };
    for (let i = 0; i < 120; i++) step(cam, { target, bounds: wideBounds(cam) });
    const before = { x: cam.renderX, y: cam.renderY };
    // The §4.3 camera keeps working underneath: Bur fell, so `stepCamera` moved x and y.
    cam.x += 30;
    cam.y += 45;
    for (let i = 0; i < 120; i++) step(cam, { target, bounds: wideBounds(cam) });
    expect(cam.renderX).toBeCloseTo(before.x, 2);
    expect(cam.renderY).toBeCloseTo(before.y, 2);
  });
});

describe('stepPeek: returning home', () => {
  /** A camera on the left wall, already peeked 200 px right and 100 px down, as if the finger lifted. */
  function peeked(): Camera {
    const cam = camAt(90); // cam.x = 0, so 200 px of peek to the right is inside the world column
    cam.peekX = 200;
    cam.peekY = 100;
    return cam;
  }

  it('decays with PEEK_RETURN_LAMBDA, not with PEEK_LAMBDA', () => {
    const cam = peeked();
    step(cam, { target: null });
    expect(cam.peekX).toBeCloseTo(200 * Math.exp(-t.PEEK_RETURN_LAMBDA / 60), 9);
    expect(cam.peekY).toBeCloseTo(100 * Math.exp(-t.PEEK_RETURN_LAMBDA / 60), 9);
  });

  it('is slower than the chase: a released view glides, a dragged one snaps', () => {
    expect(t.PEEK_RETURN_LAMBDA).toBeLessThan(t.PEEK_LAMBDA);
  });

  it('lands on exactly zero, so the drawn view really is the camera again', () => {
    const cam = peeked();
    for (let i = 0; i < 90; i++) step(cam, { target: null }); // 1.5 s, the budget the e2e asserts
    expect(cam.peekX).toBe(0);
    expect(cam.peekY).toBe(0);
    expect(cam.renderX).toBe(cam.x);
    expect(cam.renderY).toBe(cam.y + cam.lookaheadPx);
  });
});

describe('stepPeek: hold', () => {
  it('suspends the return: a view peeked when the pull started stays put', () => {
    const cam = camAt(270);
    cam.peekX = 150;
    cam.peekY = -60;
    for (let i = 0; i < 300; i++) {
      stepPeek(cam, { target: null, hold: true, bounds: wideBounds(cam), dt: 1 / 60 }, t);
    }
    expect(cam.peekX).toBe(150);
    expect(cam.peekY).toBe(-60);
    expect(cam.renderX).toBe(cam.x + 150);
  });

  it('suspends the return ONLY: a second finger on the minimap keeps steering while the first aims', () => {
    const cam = camAt(90);
    const target = { x: 450, y: cam.y + VIEW_H / 2 };
    for (let i = 0; i < 60; i++) {
      stepPeek(cam, { target, hold: true, bounds: wideBounds(cam), dt: 1 / 60 }, t);
    }
    expect(cam.renderX).toBeCloseTo(peekTopLeft(target, cam, wideBounds(cam), t).x, 2);
  });

  it('releases the offset the step the pull ends', () => {
    const cam = camAt(270);
    cam.peekX = 150;
    stepPeek(cam, { target: null, hold: true, bounds: wideBounds(cam), dt: 1 / 60 }, t);
    expect(cam.peekX).toBe(150);
    step(cam, { target: null });
    expect(cam.peekX).toBeLessThan(150);
  });
});

describe('stepPeek: frame-rate independence (§11.7.5)', () => {
  it('chases to the same place in 60 steps of 1/60 s as in 30 of 1/30 s', () => {
    const a = camAt(90);
    const b = camAt(90);
    const target = { x: 450, y: a.y + 150 + VIEW_H / 2 };
    for (let i = 0; i < 60; i++) step(a, { target }, 1 / 60);
    for (let i = 0; i < 30; i++) step(b, { target }, 1 / 30);
    expect(Math.abs(a.peekX - b.peekX)).toBeLessThan(1);
    expect(Math.abs(a.peekY - b.peekY)).toBeLessThan(1);
  });

  it('returns to the same place at both rates', () => {
    const a = camAt(90);
    const b = camAt(90);
    a.peekX = b.peekX = 300;
    a.peekY = b.peekY = -120;
    for (let i = 0; i < 30; i++) step(a, { target: null }, 1 / 60);
    for (let i = 0; i < 15; i++) step(b, { target: null }, 1 / 30);
    expect(Math.abs(a.peekX - b.peekX)).toBeLessThan(1);
    expect(Math.abs(a.peekY - b.peekY)).toBeLessThan(1);
    expect(a.peekX).toBeCloseTo(300 * Math.exp(-t.PEEK_RETURN_LAMBDA * 0.5), 6);
  });
});

describe('stepPeek: what it must never touch', () => {
  it('leaves x, y, maxY and lookaheadPx exactly as `stepCamera` left them', () => {
    const cam = camAt(270);
    cam.lookaheadPx = 20;
    const before = { x: cam.x, y: cam.y, maxY: cam.maxY, lookaheadPx: cam.lookaheadPx };
    for (let i = 0; i < 200; i++) step(cam, { target: { x: 500, y: cam.y + 400 } });
    for (let i = 0; i < 200; i++) step(cam, { target: null });
    expect(cam.x).toBe(before.x);
    expect(cam.y).toBe(before.y);
    expect(cam.maxY).toBe(before.maxY);
    expect(cam.lookaheadPx).toBe(before.lookaheadPx);
  });

  it('keeps renderX / renderY as the ONE definition of the drawn view, lookahead included', () => {
    const cam = camAt(270);
    cam.lookaheadPx = 20;
    for (let i = 0; i < 20; i++) {
      step(cam, { target: { x: 400, y: cam.y + 300 } });
      expect(cam.renderX).toBeCloseTo(cam.x + cam.peekX, 12);
      expect(cam.renderY).toBeCloseTo(cam.y + cam.lookaheadPx + cam.peekY, 12);
    }
  });

  it('does nothing at all with no target, no hold and no offset', () => {
    const cam = camAt(270);
    step(cam, { target: null });
    expect(cam.peekX).toBe(0);
    expect(cam.peekY).toBe(0);
    expect(cam.renderX).toBe(cam.x);
  });
});

describe('stepPeek: the offset is re-clamped, but only towards zero', () => {
  it('pulls a held peek back when the streamed window scrolls out from under it', () => {
    const cam = camAt(270);
    cam.peekY = 200;
    // The window moved: 200 px down is no longer streamed, only 50 is.
    stepPeek(cam, { target: null, hold: true, bounds: { minY: cam.y - 50, maxY: cam.y + 50 }, dt: 1 / 60 }, t);
    expect(cam.peekY).toBe(50);
    expect(cam.renderY).toBe(cam.y + 50);
  });

  it('does the same upwards, without flipping the sign', () => {
    const cam = camAt(270);
    cam.peekY = -200;
    stepPeek(cam, { target: null, hold: true, bounds: { minY: cam.y - 50, maxY: cam.y + 50 }, dt: 1 / 60 }, t);
    expect(cam.peekY).toBe(-50);
  });

  it('never pushes the offset AWAY from zero: a camera outside its own band still draws itself', () => {
    // The camera outran the streamer on a fast fall, so `cam.y` is not inside the legal band at all.
    const cam = camAt(270);
    const bounds = { minY: cam.y + 100, maxY: cam.y + 200 };
    stepPeek(cam, { target: null, hold: false, bounds, dt: 1 / 60 }, t);
    expect(cam.peekY).toBe(0);
    expect(cam.renderY).toBe(cam.y + cam.lookaheadPx);
    // And a small offset is not grown into the band either: the return still owns the way home.
    cam.peekY = 10;
    stepPeek(cam, { target: null, hold: true, bounds, dt: 1 / 60 }, t);
    expect(cam.peekY).toBe(10);
  });
});

describe('stepPeek: total on rubbish input', () => {
  it('treats a non-finite target as no peek instead of poisoning the offset', () => {
    const cam = camAt(270);
    cam.peekX = 100;
    step(cam, { target: { x: Number.NaN, y: 0 } });
    expect(Number.isFinite(cam.peekX)).toBe(true);
    expect(cam.peekX).toBeLessThan(100); // it returned home, it did not chase a NaN
    expect(Number.isFinite(cam.renderX)).toBe(true);
  });

  it('treats a non-finite or negative dt as a step of zero seconds', () => {
    const cam = camAt(270);
    cam.peekX = 100;
    step(cam, { target: null }, Number.NaN);
    expect(cam.peekX).toBe(100);
    step(cam, { target: null }, -1);
    expect(cam.peekX).toBe(100);
  });
});
