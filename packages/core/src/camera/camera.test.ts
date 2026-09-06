import { describe, expect, it } from 'vitest';
import { SeededRNG } from '../ports';
import { createTuning } from '../tuning';
import type { ZoneIndex } from '../types';
import { createCamera, isAboveView, stepCamera } from './camera';

const VIEW_H = 360;
const t = createTuning();

describe('createCamera', () => {
  it('places Bur at CAM_ANCHOR of the view and starts the ratchet there', () => {
    const cam = createCamera(1000, VIEW_H, t);
    expect(cam.y).toBeCloseTo(1000 - VIEW_H * t.CAM_ANCHOR, 10);
    expect(cam.maxY).toBe(cam.y);
    expect(cam.zoom).toBe(1);
    expect(cam.zoomPunchUntil).toBe(0);
    expect(cam.viewH).toBe(VIEW_H);
    expect(cam.recallPx).toBe(t.CAM_RECALL_PX);
  });
});

describe('dead zone', () => {
  it('does not move while Bur stays inside [0.34, 0.56] of the view', () => {
    const cam = createCamera(1000, VIEW_H, t);
    const y0 = cam.y;
    for (let i = 0; i < 60; i++) {
      // Bur oscillates well inside the band (anchor is 0.45).
      stepCamera(cam, { burY: cam.y + VIEW_H * 0.45, burVelY: 10, zone: 0, ascenso: false, nowMs: i * 16, dt: 1 / 60 }, t);
    }
    expect(cam.y).toBeCloseTo(y0, 10);
  });

  it('moves when Bur leaves the band, faster beyond CAM_FAST_DIST_PX', () => {
    const slow = createCamera(1000, VIEW_H, t);
    const fast = createCamera(1000, VIEW_H, t);
    // Both below the band; `fast` is more than 90 px from its target.
    stepCamera(slow, { burY: slow.y + VIEW_H * 0.62, burVelY: 0, zone: 0, ascenso: false, nowMs: 0, dt: 1 / 60 }, t);
    stepCamera(fast, { burY: fast.y + VIEW_H * 0.45 + 200, burVelY: 0, zone: 0, ascenso: false, nowMs: 0, dt: 1 / 60 }, t);
    const slowStep = slow.y - 1000 + VIEW_H * t.CAM_ANCHOR;
    const fastStep = fast.y - 1000 + VIEW_H * t.CAM_ANCHOR;
    expect(slowStep).toBeGreaterThan(0);
    // Same normalized distance would give the same ratio; the fast lambda covers a bigger fraction.
    expect(fastStep / 200).toBeGreaterThan(slowStep / (VIEW_H * (0.62 - 0.45)));
  });
});

describe('ratchet and recall band (§11.7.5)', () => {
  it('keeps maxY non-decreasing and y in [maxY - recall, maxY] over 10 000 random ticks', () => {
    const rng = new SeededRNG(0xc0ffee);
    const cam = createCamera(500, VIEW_H, t);
    let burY = 500;
    let prevMaxY = cam.maxY;
    for (let i = 0; i < 10_000; i++) {
      // Violent, unrealistic motion on purpose: the invariant must not depend on the physics.
      burY += (rng.next() - 0.45) * 900 * (1 / 60);
      const ascenso = rng.next() < 0.25;
      const zone = rng.int(0, 6) as ZoneIndex;
      const burVelY = (rng.next() - 0.5) * 1400;
      stepCamera(cam, { burY, burVelY, zone, ascenso, nowMs: i * (1000 / 60), dt: 1 / 60 }, t);
      const recall = ascenso ? t.CAM_RECALL_ASCENSO_PX : t.CAM_RECALL_PX;
      expect(cam.maxY).toBeGreaterThanOrEqual(prevMaxY);
      expect(cam.y).toBeLessThanOrEqual(cam.maxY + 1e-9);
      expect(cam.y).toBeGreaterThanOrEqual(cam.maxY - recall - 1e-9);
      expect(cam.recallPx).toBe(recall);
      prevMaxY = cam.maxY;
    }
  });

  it('keeps maxY monotonic with ASCENSO forced on for the whole run', () => {
    const rng = new SeededRNG(7);
    const cam = createCamera(500, VIEW_H, t);
    let burY = 500;
    let prevMaxY = cam.maxY;
    for (let i = 0; i < 2000; i++) {
      burY += (rng.next() - 0.8) * 900 * (1 / 60); // strong upward bias
      stepCamera(cam, { burY, burVelY: -600, zone: 4, ascenso: true, nowMs: i * 16, dt: 1 / 60 }, t);
      expect(cam.maxY).toBeGreaterThanOrEqual(prevMaxY);
      expect(cam.y).toBeGreaterThanOrEqual(cam.maxY - t.CAM_RECALL_ASCENSO_PX - 1e-9);
      prevMaxY = cam.maxY;
    }
  });

  it('the recall band lets the view rise exactly 96 px above the ratchet and no further', () => {
    const cam = createCamera(1000, VIEW_H, t);
    const maxY = cam.maxY;
    for (let i = 0; i < 600; i++) {
      stepCamera(cam, { burY: 0, burVelY: -100, zone: 0, ascenso: false, nowMs: i * 16, dt: 1 / 60 }, t);
    }
    expect(cam.maxY).toBe(maxY);
    expect(cam.y).toBeCloseTo(maxY - t.CAM_RECALL_PX, 6);
  });

  it('opens the band to 640 px during ascenso and re-clamps to 96 px when it ends', () => {
    const cam = createCamera(2000, VIEW_H, t);
    const maxY = cam.maxY;
    for (let i = 0; i < 600; i++) {
      stepCamera(cam, { burY: 0, burVelY: -100, zone: 0, ascenso: true, nowMs: i * 16, dt: 1 / 60 }, t);
    }
    expect(cam.y).toBeCloseTo(maxY - t.CAM_RECALL_ASCENSO_PX, 6);
    stepCamera(cam, { burY: 0, burVelY: -100, zone: 0, ascenso: false, nowMs: 10_000, dt: 1 / 60 }, t);
    expect(cam.y).toBeCloseTo(maxY - t.CAM_RECALL_PX, 6);
    expect(cam.maxY).toBe(maxY);
  });
});

describe('minimum current', () => {
  it('scrolls at CAM_MIN_SCROLL px/s from zone index 2 when the camera would otherwise be still', () => {
    const cam = createCamera(1000, VIEW_H, t);
    const y0 = cam.y;
    const burY = cam.y + VIEW_H * 0.45; // inside the dead zone: no follow contribution
    for (let i = 0; i < 60; i++) {
      stepCamera(cam, { burY, burVelY: 0, zone: 2, ascenso: false, nowMs: i * 16, dt: 1 / 60 }, t);
    }
    expect(cam.y - y0).toBeCloseTo(t.CAM_MIN_SCROLL, 6);
    expect(cam.maxY).toBeCloseTo(cam.y, 10);
  });

  it('does not scroll below zone index 2, nor while ascenso is active', () => {
    for (const [zone, ascenso] of [
      [1, false],
      [5, true],
    ] as const) {
      const cam = createCamera(1000, VIEW_H, t);
      const y0 = cam.y;
      const burY = cam.y + VIEW_H * 0.45;
      for (let i = 0; i < 60; i++) {
        stepCamera(cam, { burY, burVelY: 0, zone, ascenso, nowMs: i * 16, dt: 1 / 60 }, t);
      }
      expect(cam.y).toBeCloseTo(y0, 10);
    }
  });
});

describe('zoom punch', () => {
  it('fires once above CAM_ZOOM_PUNCH_SPEED in either direction and returns to 1 after CAM_ZOOM_PUNCH_MS', () => {
    const cam = createCamera(1000, VIEW_H, t);
    const step = (nowMs: number, vy: number) =>
      stepCamera(cam, { burY: 1000, burVelY: vy, zone: 0, ascenso: false, nowMs, dt: 1 / 60 }, t);

    expect(step(0, 400)).toHaveLength(0);
    expect(cam.zoom).toBe(1);

    const ev = step(16, 500);
    expect(ev).toEqual([{ type: 'zoomPunch', pct: t.CAM_ZOOM_PUNCH_PCT, ms: t.CAM_ZOOM_PUNCH_MS }]);
    expect(cam.zoom).toBeCloseTo(1 - t.CAM_ZOOM_PUNCH_PCT, 10);
    expect(cam.zoomPunchUntil).toBe(16 + t.CAM_ZOOM_PUNCH_MS);

    // No re-trigger while a punch is active.
    expect(step(100, 900)).toHaveLength(0);
    expect(cam.zoom).toBeCloseTo(1 - t.CAM_ZOOM_PUNCH_PCT, 10);

    // Expires: zoom back to 1, and a new punch may start.
    expect(step(16 + t.CAM_ZOOM_PUNCH_MS, 100)).toHaveLength(0);
    expect(cam.zoom).toBe(1);
    expect(cam.zoomPunchUntil).toBe(0);
    expect(step(1000, -500)).toHaveLength(1); // upward speed punches too
    expect(cam.zoom).toBeCloseTo(1 - t.CAM_ZOOM_PUNCH_PCT, 10);
  });
});

describe('frame-rate independence (§11.4)', () => {
  it('60 steps of 1/60 s and 30 steps of 1/30 s reach the same camera position within 1 px', () => {
    // The dead zone is a hard stop, not a smoothing term: it would freeze both runs at different
    // points. Disable it so the test measures what it claims to measure — the exponential follow.
    const tt = createTuning({ CAM_DEADZONE: [0, 0] });
    const burY = 1000;
    const target = burY - VIEW_H * tt.CAM_ANCHOR;
    const mk = () => {
      const cam = createCamera(burY, VIEW_H, tt);
      cam.y = target - 60; // < CAM_FAST_DIST_PX, so a single lambda governs the whole approach
      cam.maxY = cam.y; // the ratchet follows the downward approach; the band never binds
      return cam;
    };
    const a = mk();
    const b = mk();
    for (let i = 0; i < 60; i++) {
      stepCamera(a, { burY, burVelY: 0, zone: 0, ascenso: false, nowMs: i * (1000 / 60), dt: 1 / 60 }, tt);
    }
    for (let i = 0; i < 30; i++) {
      stepCamera(b, { burY, burVelY: 0, zone: 0, ascenso: false, nowMs: i * (1000 / 30), dt: 1 / 30 }, tt);
    }
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(Math.abs(a.y - target)).toBeLessThan(1);
    // Analytic check: after 1 s the residual is 60 * exp(-12).
    expect(a.y - target).toBeCloseTo(-60 * Math.exp(-tt.CAM_LAMBDA), 6);
  });
});

describe('lookahead (§7)', () => {
  const run = (burVelY: number, steps: number): ReturnType<typeof createCamera> => {
    const cam = createCamera(1000, VIEW_H, t);
    for (let i = 0; i < steps; i++) {
      stepCamera(cam, { burY: 1000, burVelY, zone: 0, ascenso: false, nowMs: i * (1000 / 60), dt: 1 / 60 }, t);
    }
    return cam;
  };

  it('starts at zero and never leads the view by more than CAM_LOOKAHEAD_PX', () => {
    expect(createCamera(1000, VIEW_H, t).lookaheadPx).toBe(0);
    const down = run(t.MAX_FALL_SPEED * 4, 240); // clamped: four times terminal is still 20 px
    expect(down.lookaheadPx).toBeCloseTo(t.CAM_LOOKAHEAD_PX, 3);
    const up = run(-t.MAX_FALL_SPEED * 4, 240);
    expect(up.lookaheadPx).toBeCloseTo(-t.CAM_LOOKAHEAD_PX, 3);
  });

  it('approaches the target with CAM_LOOKAHEAD_LERP and reports it in renderY', () => {
    const one = run(t.MAX_FALL_SPEED, 1);
    expect(one.lookaheadPx).toBeCloseTo(t.CAM_LOOKAHEAD_PX * t.CAM_LOOKAHEAD_LERP, 9);
    expect(one.renderY).toBeCloseTo(one.y + one.lookaheadPx, 9);
  });

  it('is presentation only: the ratchet position and the recall band ignore it', () => {
    const cam = run(t.MAX_FALL_SPEED, 240);
    const still = createCamera(1000, VIEW_H, t);
    for (let i = 0; i < 240; i++) {
      stepCamera(still, { burY: 1000, burVelY: 0, zone: 0, ascenso: false, nowMs: i * (1000 / 60), dt: 1 / 60 }, t);
    }
    expect(cam.y).toBeCloseTo(still.y, 9);
    expect(cam.maxY).toBeCloseTo(still.maxY, 9);
  });
});

describe('isAboveView', () => {
  it('is true only when the whole circle is above the top edge', () => {
    const cam = createCamera(1000, VIEW_H, t);
    expect(isAboveView(cam, cam.y - 8, 7)).toBe(true);
    expect(isAboveView(cam, cam.y - 7, 7)).toBe(false); // tangent: still visible
    expect(isAboveView(cam, cam.y, 7)).toBe(false);
    expect(isAboveView(cam, cam.y + 100, 7)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// DECISIONS-v1.2 D3: the world is WORLD_W (540) px wide and the view only VIEW_W (180) of it, so the
// camera follows Bur in X as well. Y is untouched by every test below.
// ---------------------------------------------------------------------------------------------

const VIEW_W = t.VIEW_W;

/** A camera looking at Bur at (burX, 1000), the way `GameWorld` builds it. */
const camAt = (burX: number, tt = t): ReturnType<typeof createCamera> =>
  createCamera(1000, VIEW_H, tt, burX, VIEW_W);

/** Steps `cam` `n` times with Bur parked at `burX` (and inside the Y dead zone, so Y never moves). */
function follow(cam: ReturnType<typeof createCamera>, burX: number, n: number, dt = 1 / 60, tt = t): void {
  for (let i = 0; i < n; i++) {
    const burY = cam.y + VIEW_H * 0.45;
    stepCamera(cam, { burX, burY, burVelY: 0, zone: 0, ascenso: false, nowMs: i * dt * 1000, dt }, tt);
  }
}

describe('horizontal follow (D3)', () => {
  it('centres the view on Bur when the camera is created', () => {
    expect(camAt(t.WORLD_W / 2).x).toBeCloseTo(t.WORLD_W / 2 - VIEW_W / 2, 10);
    expect(camAt(t.WORLD_W / 2).viewW).toBe(VIEW_W);
  });

  it('clamps the initial centring to [0, WORLD_W - viewW]', () => {
    expect(camAt(10).x).toBe(0);
    expect(camAt(t.WORLD_W - 10).x).toBe(t.WORLD_W - VIEW_W);
  });

  it('does not move while Bur stays inside the CAM_DEADZONE_X band', () => {
    const cam = camAt(270);
    const x0 = cam.x;
    const [lo, hi] = t.CAM_DEADZONE_X;
    // Both ends of the band, and the middle: none of them may nudge the view.
    for (const f of [lo + 0.01, 0.5, hi - 0.01]) follow(cam, cam.x + VIEW_W * f, 60);
    expect(cam.x).toBeCloseTo(x0, 10);
  });

  it('follows Bur once she leaves the band, and stops with her back on its edge', () => {
    const cam = camAt(270);
    const [lo, hi] = t.CAM_DEADZONE_X;
    const burX = cam.x + VIEW_W * 0.95;
    follow(cam, burX, 240);
    expect(burX - cam.x).toBeCloseTo(VIEW_W * hi, 3);

    const back = cam.x + VIEW_W * 0.05;
    follow(cam, back, 240);
    expect(back - cam.x).toBeCloseTo(VIEW_W * lo, 3);
  });

  it('never leaves the world column, however hard Bur pushes at either wall', () => {
    const left = camAt(270);
    follow(left, -400, 600);
    expect(left.x).toBe(0);

    const right = camAt(270);
    follow(right, t.WORLD_W + 400, 600);
    expect(right.x).toBe(t.WORLD_W - VIEW_W);
  });

  it('is frame-rate independent: 240 steps of 1/60 s land where 120 of 1/30 s do', () => {
    const fine = camAt(90);
    const coarse = camAt(90);
    follow(fine, 470, 240, 1 / 60);
    follow(coarse, 470, 120, 1 / 30);
    expect(coarse.x).toBeCloseTo(fine.x, 3);
  });

  it('is deterministic: the same walk twice gives the same x, bit for bit', () => {
    const walk = (): number => {
      const cam = camAt(270);
      for (const x of [400, 120, 500, 60, 300, 539, 1]) follow(cam, x, 37);
      return cam.x;
    };
    expect(walk()).toBe(walk());
  });

  it('leaves the §4.3 ratchet alone: a step with no burX moves neither x nor maxY', () => {
    const cam = camAt(270);
    const x0 = cam.x;
    const maxY0 = cam.maxY;
    stepCamera(cam, { burY: cam.y + VIEW_H * 0.45, burVelY: 0, zone: 0, ascenso: false, nowMs: 0, dt: 1 / 60 }, t);
    expect(cam.x).toBe(x0);
    expect(cam.maxY).toBe(maxY0);
  });

  it('has no ratchet of its own: X is free in both directions, unlike Y', () => {
    const cam = camAt(270);
    follow(cam, 500, 300);
    const deepest = cam.x;
    follow(cam, 40, 300);
    expect(cam.x).toBeLessThan(deepest); // Y could never come back like this
  });
});
