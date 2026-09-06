/**
 * Adversarial review of `camera/peek.ts` (DECISIONS-v1.2 D5).
 *
 * The peek is the one thing in core allowed to move the picture without moving the game, so every
 * test here is an attempt to make it do the opposite: poison the camera with a target the shell had
 * no business sending (NaN out of a zero-sized minimap, a point a thousand screens away), leave the
 * drawn view outside the world column, leave it over water the streamer never instantiated, or make
 * the offset depend on the frame rate. The unit under test is TOTAL: there is no input for which
 * `stepPeek` may leave `renderX`/`renderY` non-finite, and no bounds for which `peekBounds` may
 * return an empty band.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { SeededRNG } from '../ports';
import { peekBounds, peekTopLeft, stepPeek } from './peek';
import type { PeekBounds } from './peek';
import type { Camera } from '../types';

const T = DEFAULT_TUNING;
const DT = T.FIXED_DT;
const X_MAX = T.WORLD_W - T.VIEW_W;

function makeCam(over: Partial<Camera> = {}): Camera {
  return {
    x: 180,
    y: 1000,
    maxY: 1000,
    recallPx: T.CAM_RECALL_PX,
    zoom: 1,
    zoomPunchUntil: 0,
    shakePx: 0,
    shakeUntil: 0,
    viewW: T.VIEW_W,
    viewH: 400,
    lookaheadPx: 0,
    renderY: 1000,
    peekX: 0,
    peekY: 0,
    renderX: 180,
    ...over,
  };
}

/** A band wide enough that only the x clamp can bite. */
function looseBounds(cam: Camera): PeekBounds {
  return { minY: cam.y - 1e6, maxY: cam.y + 1e6 };
}

describe('peekBounds is total: no empty band, no NaN, whatever the window does', () => {
  it('always returns a finite band that contains cam.y, over a randomised sweep of windows', () => {
    const rng = new SeededRNG(20260906);
    for (let i = 0; i < 4000; i++) {
      const y = (rng.next() - 0.5) * 20000;
      const viewH = 80 + rng.next() * 900;
      // Windows of every shape, INCLUDING inverted ones (bottom above top) and windows the camera has
      // already outrun in either direction: the streamer rebuilds on a chunk boundary, not on ours.
      const top = y + (rng.next() - 0.5) * 4000;
      const bottom = top + (rng.next() - 0.5) * 4000;
      const cam = makeCam({ y, viewH });
      const b = peekBounds(cam, top, bottom, T);
      expect(Number.isFinite(b.minY)).toBe(true);
      expect(Number.isFinite(b.maxY)).toBe(true);
      expect(b.minY).toBeLessThanOrEqual(b.maxY);
      // "No peek" must always be a legal peek, or the offset could never come home to zero.
      expect(b.minY).toBeLessThanOrEqual(y);
      expect(b.maxY).toBeGreaterThanOrEqual(y);
    }
  });

  it('degrades to "no peek" when the window itself is not a number', () => {
    const cam = makeCam({ y: 750 });
    for (const [top, bottom] of [
      [NaN, 2000],
      [0, NaN],
      [-Infinity, Infinity],
      [Infinity, -Infinity],
    ] as const) {
      const b = peekBounds(cam, top, bottom, T);
      expect(Number.isFinite(b.minY)).toBe(true);
      expect(Number.isFinite(b.maxY)).toBe(true);
      expect(b.minY).toBeLessThanOrEqual(b.maxY);
    }
  });

  it('keeps the view inside a window that is SHORTER than the view (nothing legal to pick)', () => {
    // 200 px of streamed water under a 400 px view: no top edge is fully legal, so the band collapses
    // on the one that shares the overflow — and it still has to contain cam.y so "no peek" survives.
    const cam = makeCam({ y: 1000, viewH: 400 });
    const b = peekBounds(cam, 900, 1100, T);
    expect(Number.isFinite(b.minY)).toBe(true);
    expect(b.minY).toBeLessThanOrEqual(b.maxY);
    expect(b.minY).toBeLessThanOrEqual(cam.y);
    expect(b.maxY).toBeGreaterThanOrEqual(cam.y);
  });

  it('never lets a DOWNWARD peek reach past the streamed floor', () => {
    // The window ends 300 px below the camera and the view is 400 tall: there is no room to look down
    // at all, so the band may not offer a single px below cam.y.
    const cam = makeCam({ y: 1000, viewH: 400 });
    const b = peekBounds(cam, 700, 1300, T);
    expect(b.maxY).toBeLessThanOrEqual(cam.y);
    expect(b.minY).toBeGreaterThanOrEqual(700);
  });
});

describe('peekTopLeft clamps the finger, however absurd the point is', () => {
  it('pins a view WIDER than the world to the left edge instead of reporting a negative column', () => {
    const cam = makeCam({ x: 0, viewW: T.WORLD_W + 120 });
    const p = peekTopLeft({ x: 5000, y: 1000 }, cam, looseBounds(cam), T);
    expect(p.x).toBe(0);
  });

  it('answers a point a thousand screens away with the edge of the world', () => {
    const cam = makeCam();
    expect(peekTopLeft({ x: 1e9, y: 0 }, cam, looseBounds(cam), T).x).toBe(X_MAX);
    expect(peekTopLeft({ x: -1e9, y: 0 }, cam, looseBounds(cam), T).x).toBe(0);
  });
});

describe('stepPeek is total: no input leaves the camera unusable', () => {
  const ABSURD = [
    { x: NaN, y: NaN },
    { x: NaN, y: 1000 },
    { x: 270, y: NaN },
    { x: Infinity, y: -Infinity },
    { x: 1e9, y: -1e9 },
    { x: -1e300, y: 1e300 },
  ];

  it('never poisons the offset with a non-finite target', () => {
    for (const target of ABSURD) {
      const cam = makeCam();
      for (let i = 0; i < 120; i++) {
        stepPeek(cam, { target, hold: false, bounds: peekBounds(cam, 0, 2400, T), dt: DT }, T);
      }
      expect(Number.isFinite(cam.peekX)).toBe(true);
      expect(Number.isFinite(cam.peekY)).toBe(true);
      expect(Number.isFinite(cam.renderX)).toBe(true);
      expect(Number.isFinite(cam.renderY)).toBe(true);
      expect(cam.renderX).toBeGreaterThanOrEqual(0);
      expect(cam.renderX).toBeLessThanOrEqual(X_MAX);
    }
  });

  it('recovers: an absurd target followed by a real one still peeks where the finger asks', () => {
    const cam = makeCam();
    const bounds = (): PeekBounds => peekBounds(cam, 0, 2400, T);
    for (let i = 0; i < 30; i++) stepPeek(cam, { target: { x: NaN, y: NaN }, hold: false, bounds: bounds(), dt: DT }, T);
    for (let i = 0; i < 120; i++) stepPeek(cam, { target: { x: 520, y: 1000 }, hold: false, bounds: bounds(), dt: DT }, T);
    expect(cam.renderX).toBeCloseTo(X_MAX, 6);
  });

  it('survives a non-finite dt and a negative one (a stalled tab, a clock that went backwards)', () => {
    const cam = makeCam();
    const bounds = peekBounds(cam, 0, 2400, T);
    for (const dt of [NaN, Infinity, -1, -Infinity]) {
      const before = { x: cam.peekX, y: cam.peekY };
      stepPeek(cam, { target: { x: 520, y: 1000 }, hold: false, bounds, dt }, T);
      expect(Number.isFinite(cam.peekX)).toBe(true);
      // A dt that is not a duration buys no movement at all.
      expect(cam.peekX).toBe(before.x);
      expect(cam.peekY).toBe(before.y);
    }
  });

  it('does not overshoot on a monstrous dt: k saturates at 1, it never exceeds 1', () => {
    const cam = makeCam();
    const bounds = peekBounds(cam, 0, 2400, T);
    stepPeek(cam, { target: { x: 520, y: 1000 }, hold: false, bounds, dt: 100 }, T);
    expect(cam.renderX).toBeLessThanOrEqual(X_MAX + 1e-9);
    expect(cam.renderX).toBeCloseTo(X_MAX, 6);
  });

  it('keeps the DRAWN column inside the world for any random sequence of targets and releases', () => {
    const rng = new SeededRNG(4242);
    const cam = makeCam();
    for (let i = 0; i < 3000; i++) {
      // The camera keeps living underneath: it follows Bur sideways and ratchets down.
      cam.x = Math.min(X_MAX, Math.max(0, cam.x + (rng.next() - 0.5) * 12));
      cam.y += rng.next() * 4;
      const roll = rng.next();
      const target =
        roll < 0.5 ? { x: rng.next() * T.WORLD_W, y: cam.y + (rng.next() - 0.5) * 1200 } : roll < 0.6 ? { x: NaN, y: 0 } : null;
      const window = { top: cam.y - 600, bottom: cam.y + 900 };
      stepPeek(
        cam,
        { target, hold: roll > 0.9, bounds: peekBounds(cam, window.top, window.bottom, T), dt: DT },
        T,
      );
      expect(cam.renderX).toBeGreaterThanOrEqual(-1e-9);
      expect(cam.renderX).toBeLessThanOrEqual(X_MAX + 1e-9);
      expect(Number.isFinite(cam.renderY)).toBe(true);
      // Never over water the streamer has not instantiated (the band always contains cam.y, so the
      // un-peeked view is the escape hatch when the camera itself has outrun the window).
      expect(cam.y + cam.peekY).toBeGreaterThanOrEqual(Math.min(window.top, cam.y) - 1e-9);
      expect(cam.y + cam.peekY + cam.viewH).toBeLessThanOrEqual(Math.max(window.bottom, cam.y + cam.viewH) + 1e-9);
    }
  });

  it('writes NOTHING but the four presentation fields', () => {
    const cam = makeCam({ lookaheadPx: 13, maxY: 1200, zoom: 0.9, shakePx: 3 });
    const before = { ...cam };
    for (let i = 0; i < 200; i++) {
      stepPeek(cam, { target: { x: 500, y: 1400 }, hold: false, bounds: peekBounds(cam, 0, 2400, T), dt: DT }, T);
    }
    expect(cam.x).toBe(before.x);
    expect(cam.y).toBe(before.y);
    expect(cam.maxY).toBe(before.maxY);
    expect(cam.lookaheadPx).toBe(before.lookaheadPx);
    expect(cam.viewW).toBe(before.viewW);
    expect(cam.viewH).toBe(before.viewH);
    expect(cam.zoom).toBe(before.zoom);
    expect(cam.shakePx).toBe(before.shakePx);
    expect(cam.recallPx).toBe(before.recallPx);
    expect(cam.renderY).toBeCloseTo(cam.y + cam.lookaheadPx + cam.peekY, 9);
    expect(cam.renderX).toBe(cam.x + cam.peekX);
  });

  it('a held pull freezes the offset to the BIT for as long as the finger is down', () => {
    const cam = makeCam();
    const bounds = (): PeekBounds => peekBounds(cam, 0, 2400, T);
    for (let i = 0; i < 60; i++) stepPeek(cam, { target: { x: 520, y: 1000 }, hold: false, bounds: bounds(), dt: DT }, T);
    const frozen = cam.peekX;
    expect(frozen).toBeGreaterThan(100);
    for (let i = 0; i < 2000; i++) stepPeek(cam, { target: null, hold: true, bounds: bounds(), dt: DT }, T);
    expect(cam.peekX).toBe(frozen);
    expect(cam.renderX).toBe(cam.x + frozen);
  });

  it('the return is monotone and lands on exactly zero (no exponential tail, no overshoot)', () => {
    const cam = makeCam();
    const bounds = (): PeekBounds => peekBounds(cam, 0, 2400, T);
    for (let i = 0; i < 60; i++) stepPeek(cam, { target: { x: 520, y: 1300 }, hold: false, bounds: bounds(), dt: DT }, T);
    let prevX = Math.abs(cam.peekX);
    let prevY = Math.abs(cam.peekY);
    expect(prevX).toBeGreaterThan(100);
    for (let i = 0; i < 200; i++) {
      stepPeek(cam, { target: null, hold: false, bounds: bounds(), dt: DT }, T);
      expect(Math.abs(cam.peekX)).toBeLessThanOrEqual(prevX + 1e-12);
      expect(Math.abs(cam.peekY)).toBeLessThanOrEqual(prevY + 1e-12);
      prevX = Math.abs(cam.peekX);
      prevY = Math.abs(cam.peekY);
    }
    expect(cam.peekX).toBe(0);
    expect(cam.peekY).toBe(0);
    expect(cam.renderX).toBe(cam.x);
  });

  it('is frame-rate independent on the way OUT, not only on the way home (§11.7.5)', () => {
    const fast = makeCam();
    const slow = makeCam();
    const target = { x: 520, y: 1300 };
    for (let i = 0; i < 120; i++) {
      stepPeek(fast, { target, hold: false, bounds: peekBounds(fast, 0, 2400, T), dt: 1 / 120 }, T);
    }
    for (let i = 0; i < 30; i++) {
      stepPeek(slow, { target, hold: false, bounds: peekBounds(slow, 0, 2400, T), dt: 1 / 30 }, T);
    }
    expect(fast.peekX).toBeCloseTo(slow.peekX, 6);
    expect(fast.peekY).toBeCloseTo(slow.peekY, 6);
  });

  it('a zero dt publishes renderX/renderY anyway (a shell that resized between two steps)', () => {
    const cam = makeCam({ peekX: 40, peekY: -10, renderX: 0, renderY: 0, lookaheadPx: 7 });
    stepPeek(cam, { target: null, hold: true, bounds: peekBounds(cam, 0, 2400, T), dt: 0 }, T);
    expect(cam.peekX).toBe(40);
    expect(cam.renderX).toBe(cam.x + 40);
    expect(cam.renderY).toBe(cam.y + 7 - 10);
  });

  it('re-clamping the offset may only ever shrink it towards zero', () => {
    // The camera has outrun the streamer (it sits BELOW the legal band). A clamp that could grow the
    // offset would answer that by shoving the drawn view even further off the camera, forever.
    const cam = makeCam({ y: 2000, peekY: -50 });
    stepPeek(cam, { target: null, hold: true, bounds: { minY: 1000, maxY: 1200 }, dt: DT }, T);
    expect(cam.peekY).toBeLessThanOrEqual(0);
    expect(cam.peekY).toBeGreaterThanOrEqual(-50);
    const stranded = makeCam({ y: 2000, peekY: 0 });
    stepPeek(stranded, { target: null, hold: true, bounds: { minY: 1000, maxY: 1200 }, dt: DT }, T);
    expect(stranded.peekY).toBe(0);
    expect(stranded.renderY).toBe(stranded.y + stranded.lookaheadPx);
  });
});
