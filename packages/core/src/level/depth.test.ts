import { describe, expect, it } from 'vitest';
import { SeededRNG } from '../ports';
import { WORLD_BOTTOM_M, WORLD_BOTTOM_PX, ZONES, metersToPx, pxToMeters, zoneAt } from './depth';

describe('ZONES table (§11.1)', () => {
  it('is contiguous in px and in metres, and ends at the world bottom', () => {
    expect(ZONES).toHaveLength(6);
    for (let i = 0; i < ZONES.length; i++) {
      const z = ZONES[i];
      if (z === undefined) throw new Error('missing zone');
      expect(z.index).toBe(i);
      expect(z.endPx).toBeGreaterThan(z.startPx);
      expect(z.endM).toBeGreaterThan(z.startM);
      // The declared scale is exactly the span ratio: no independent constant to drift.
      expect(z.metersPerPx).toBeCloseTo((z.endM - z.startM) / (z.endPx - z.startPx), 12);
      const prev = ZONES[i - 1];
      if (prev !== undefined) {
        expect(z.startPx).toBe(prev.endPx);
        expect(z.startM).toBe(prev.endM);
      }
    }
    const last = ZONES[ZONES.length - 1];
    if (last === undefined) throw new Error('missing zone');
    expect(last.endPx).toBe(WORLD_BOTTOM_PX);
    expect(last.endM).toBe(WORLD_BOTTOM_M);
    expect(ZONES.reduce((s, z) => s + z.immersions, 0)).toBe(18);
    expect(ZONES.reduce((s, z) => s + (z.endPx - z.startPx) / 240, 0)).toBe(108);
  });
});

describe('zoneAt', () => {
  it('returns the zone that contains worldY, with borders belonging to the deeper zone', () => {
    expect(zoneAt(0).index).toBe(0);
    expect(zoneAt(2879.9).index).toBe(0);
    expect(zoneAt(2880).index).toBe(1);
    expect(zoneAt(7200).index).toBe(2);
    expect(zoneAt(11520).index).toBe(3);
    expect(zoneAt(15840).index).toBe(4);
    expect(zoneAt(20160).index).toBe(5);
    expect(zoneAt(25919).index).toBe(5);
  });

  it('clamps outside the world', () => {
    expect(zoneAt(-5000).index).toBe(0);
    expect(zoneAt(WORLD_BOTTOM_PX).index).toBe(5);
    expect(zoneAt(99999).index).toBe(5);
  });
});

describe('pxToMeters (§11.7.10)', () => {
  it('anchors the world: 0 px = 0 m and 25 920 px = 10 935 m', () => {
    expect(pxToMeters(0)).toBe(0);
    expect(pxToMeters(WORLD_BOTTOM_PX)).toBeCloseTo(WORLD_BOTTOM_M, 9);
  });

  it('is continuous at all six zone borders', () => {
    const eps = 1e-6;
    for (const z of ZONES) {
      expect(pxToMeters(z.startPx)).toBeCloseTo(z.startM, 9);
      expect(pxToMeters(z.endPx - eps)).toBeCloseTo(z.endM, 5);
      expect(pxToMeters(z.endPx)).toBeCloseTo(z.endM, 9);
    }
  });

  it('is strictly increasing across the whole world', () => {
    let prev = -Infinity;
    for (let y = 0; y <= WORLD_BOTTOM_PX; y += 12) {
      const m = pxToMeters(y);
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
    // Also at the borders themselves, where the slope changes.
    for (const z of ZONES) {
      expect(pxToMeters(z.startPx + 0.5)).toBeGreaterThan(pxToMeters(z.startPx));
      expect(pxToMeters(z.endPx)).toBeGreaterThan(pxToMeters(z.endPx - 0.5));
    }
  });

  it('matches the normative per-zone scales of the table (§11.1)', () => {
    expect(pxToMeters(1440)).toBeCloseTo(100, 9); // half of Z1
    expect(pxToMeters(2880 + 4320 / 2)).toBeCloseTo(400, 9); // half of Z2
    expect(pxToMeters(2880 + 1)).toBeCloseTo(200 + 400 / 4320, 9);
  });
});

describe('metersToPx', () => {
  it('round-trips with pxToMeters at every zone border and inside every zone', () => {
    for (const z of ZONES) {
      expect(metersToPx(z.startM)).toBeCloseTo(z.startPx, 6);
      const mid = (z.startPx + z.endPx) / 2;
      expect(metersToPx(pxToMeters(mid))).toBeCloseTo(mid, 6);
    }
    expect(metersToPx(WORLD_BOTTOM_M)).toBeCloseTo(WORLD_BOTTOM_PX, 6);
  });

  it('round-trips both ways on random points', () => {
    const rng = new SeededRNG(1234);
    for (let i = 0; i < 500; i++) {
      const y = rng.next() * WORLD_BOTTOM_PX;
      expect(metersToPx(pxToMeters(y))).toBeCloseTo(y, 6);
      const m = rng.next() * WORLD_BOTTOM_M;
      expect(pxToMeters(metersToPx(m))).toBeCloseTo(m, 6);
    }
  });

  it('clamps to the outer zones outside the world', () => {
    expect(metersToPx(-10)).toBeLessThan(0);
    expect(metersToPx(20000)).toBeGreaterThan(WORLD_BOTTOM_PX);
  });
});
