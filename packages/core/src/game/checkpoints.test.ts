/**
 * §3.1 (boyas), §3.3 (rest stations) and the capacity half of §11.7.12: "ningún cambio de capacidad
 * ocurre fuera de una RestStation", and no zone transition may reduce the Air Bur is carrying.
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../tuning';
import { createBubble } from '../bubble/bubbleStep';
import { createRunState } from '../run/runState';
import { advanceZone, createCheckpointState, crossBoyas, enterStation, reachedStation } from './checkpoints';
import type { Tuning } from '../tuning';
import type { Boya, RestStation, ZoneIndex } from '../types';

const T: Tuning = createTuning();

const boya = (id: string, worldY: number, immersionIndex = 0): Boya => ({ type: 'boya', id, worldY, immersionIndex });

function station(over: Partial<RestStation> = {}): RestStation {
  return {
    type: 'station',
    id: 'station:0',
    worldY: 1200,
    zoneFrom: 0,
    zoneTo: 0,
    isDelivery: false,
    immersionIndex: 0,
    ...over,
  };
}

describe('boyas (§3.1)', () => {
  it('is crossed by depth and only once per run', () => {
    const bubble = createBubble({ x: 90, y: 700 }, 0, T);
    const run = createRunState(1, 'expedicion');
    const state = createCheckpointState(0);
    const markers = [boya('boya:0', 720)];

    expect(crossBoyas(bubble, run, markers, state)).toHaveLength(0);
    expect(run.lastBoyaId).toBeNull();

    bubble.pos.y = 720;
    const first = crossBoyas(bubble, run, markers, state);
    expect(first).toEqual([{ type: 'boya', boyaId: 'boya:0' }]);
    expect(run.lastBoyaId).toBe('boya:0');

    bubble.pos.y = 900;
    expect(crossBoyas(bubble, run, markers, state)).toHaveLength(0);
    bubble.pos.y = 700;
    expect(crossBoyas(bubble, run, markers, state)).toHaveLength(0);
  });

  it('takes a boya a fast shot flew straight past, deeper down', () => {
    const bubble = createBubble({ x: 90, y: 1100 }, 0, T);
    const run = createRunState(1, 'expedicion');
    const events = crossBoyas(bubble, run, [boya('boya:0', 720)], createCheckpointState(0));
    expect(events).toHaveLength(1);
  });
});

describe('rest stations (§3.3)', () => {
  it('reaching the top of the band is the trigger, once per immersion', () => {
    const bubble = createBubble({ x: 90, y: 1199 }, 0, T);
    const state = createCheckpointState(0);
    expect(reachedStation(bubble, [station()], state)).toBeNull();
    bubble.pos.y = 1200;
    expect(reachedStation(bubble, [station()], state)?.id).toBe('station:0');
    state.completedStations.add(0);
    expect(reachedStation(bubble, [station()], state)).toBeNull();
  });

  it('recharges to the capacity of the zone being entered and closes the immersion', () => {
    const bubble = createBubble({ x: 90, y: 1200 }, 0, T);
    const run = createRunState(1, 'expedicion');
    bubble.air = 2;
    const events = enterStation(bubble, run, station(), createCheckpointState(0), T);

    expect(bubble.airMax).toBe(T.ZONE_AIR_MAX[0]);
    expect(bubble.air).toBe(bubble.airMax);
    expect(events[0]).toEqual({ type: 'stationEnter', station: station() });
    expect(events.some((e) => e.type === 'airGained' && e.reason === 'station')).toBe(true);
    expect(run.lastStationIndex).toBe(0);
    expect(run.immersionIndex).toBe(1);
  });

  it('a capacity step DOWN clamps and refills, so the bar is full and legal (§2.6, §11.7.12)', () => {
    const bubble = createBubble({ x: 90, y: 1200 }, 1, T);
    const run = createRunState(1, 'expedicion');
    bubble.airMax = T.ZONE_AIR_MAX[1] ?? 8;
    bubble.air = bubble.airMax; // 8 pips of Z2 arriving at a Z3 station whose capacity is 7
    enterStation(bubble, run, station({ zoneFrom: 1, zoneTo: 2 }), createCheckpointState(1), T);

    expect(bubble.airMax).toBe(T.ZONE_AIR_MAX[2]);
    expect(bubble.air).toBe(T.ZONE_AIR_MAX[2]);
    expect(bubble.air).toBeLessThanOrEqual(bubble.airMax);
  });

  it('never reduces the Air Bur is carrying when capacity stays or grows (§11.7.12)', () => {
    const bubble = createBubble({ x: 90, y: 1200 }, 0, T);
    const run = createRunState(1, 'expedicion');
    bubble.air = 5;
    enterStation(bubble, run, station(), createCheckpointState(0), T);
    expect(bubble.air).toBeGreaterThanOrEqual(5);
  });
});

describe('zones (§2.5, §2.6)', () => {
  it('announces a deeper zone once and re-arms the shell shield with it', () => {
    const run = createRunState(1, 'expedicion');
    const state = createCheckpointState(0);
    run.shieldAvailable = false;

    expect(advanceZone(run, 1, state)).toEqual([{ type: 'zoneChange', from: 0, to: 1 }]);
    expect(run.shieldAvailable).toBe(true);

    run.shieldAvailable = false;
    expect(advanceZone(run, 1, state)).toHaveLength(0);
    expect(run.shieldAvailable).toBe(false);
  });

  it('floating back up to the previous zone is not a zone change', () => {
    const run = createRunState(1, 'expedicion');
    const state = createCheckpointState(0);
    advanceZone(run, 2, state);
    run.shieldAvailable = false;
    for (const zone of [1, 0, 2] as ZoneIndex[]) expect(advanceZone(run, zone, state)).toHaveLength(0);
    expect(run.shieldAvailable).toBe(false);
  });
});

describe('modo Abismo has no checkpoints (§3.1)', () => {
  it('does not cross boyas, so branch (c) of the respawn chain never resolves there', () => {
    const bubble = createBubble({ x: 90, y: 800 }, 0, T);
    const state = createCheckpointState(0);
    const markers = [boya('boya:0', 720)];

    const abismo = createRunState(1, 'abismo');
    expect(crossBoyas(bubble, abismo, markers, state)).toHaveLength(0);
    expect(abismo.lastBoyaId).toBeNull();

    // The very same marker and the very same depth are a checkpoint in the campaign mode.
    const expedicion = createRunState(1, 'expedicion');
    expect(crossBoyas(bubble, expedicion, markers, createCheckpointState(0))).toHaveLength(1);
    expect(expedicion.lastBoyaId).toBe('boya:0');
  });
});
