/**
 * Contracts of the headless autoplayer (`game/autoPlayer.ts`). The zones use it to prove they can be
 * descended (`z1.world.test.ts`, `z2.play.test.ts`); what is checked here is that it is honest about
 * HOW — it plays through the same pointer the shell sends, obeys D1 and D2, and never reaches past the
 * snapshot for anything.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../tuning';
import { GuidedFinger } from './autoPlayer';
import { POINTER_UP, createTestWorld } from './testHarness';
import type { GameEvent, PointerInput, WorldSnapshot } from '../types';

const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;

/** Steps a fresh Z1 world with the autoplayer, keeping every pointer sample and every event. */
function play(frames: number, cutCorners = false): { snap: WorldSnapshot; events: GameEvent[]; pointers: PointerInput[] } {
  const world = createTestWorld();
  const finger = new GuidedFinger(T, cutCorners);
  const events: GameEvent[] = [];
  const pointers: PointerInput[] = [];
  let snap = world.snapshot();
  for (let i = 0; i < frames; i++) {
    const pointer = finger.next(STEP_MS, snap);
    pointers.push(pointer);
    world.update(STEP_MS, pointer);
    snap = world.snapshot();
    events.push(...snap.events);
    if (snap.phase === 'station') world.continueDescent();
    if (snap.phase === 'dead') world.restart();
  }
  return { snap, events, pointers };
}

describe('the headless autoplayer (§12.3.2)', () => {
  it('plays the D2 slingshot: presses, drags past the cancel radius, lifts', () => {
    const { events, pointers } = play(30 * 60);
    expect(events.filter((e) => e.type === 'launch').length).toBeGreaterThan(3);
    // Every contact opens AT a point and moves away from it: that is what "the power is the drag" means.
    let origin: PointerInput | null = null;
    let dragged = 0;
    for (const p of pointers) {
      if (!p.down) {
        origin = null;
        continue;
      }
      if (origin === null) {
        origin = p;
        continue;
      }
      const d = Math.hypot(p.x - origin.x, p.y - origin.y);
      if (d > T.PULL_CANCEL_PX) dragged++;
      expect(d).toBeLessThanOrEqual(T.PULL_MAX_PX + 1e-9);
    }
    expect(dragged).toBeGreaterThan(0);
  });

  it('never spends the double jump: every shot is taken from a rest (D1)', () => {
    const { events } = play(60 * 60);
    const launches = events.filter((e) => e.type === 'launch');
    expect(launches.length).toBeGreaterThan(5);
    for (const e of launches) expect(e.type === 'launch' && e.airLaunch, JSON.stringify(e)).toBe(false);
    expect(events.some((e) => e.type === 'airLost' && e.reason === 'airLaunch')).toBe(false);
  });

  it('lands the shots it picks: it descends, and it rests where it aimed', () => {
    const { snap, events } = play(60 * 60);
    const rests = events.filter((e) => e.type === 'rest').length;
    const launches = events.filter((e) => e.type === 'launch').length;
    expect(snap.run.maxProgressY).toBeGreaterThan(3 * T.CHUNK_H);
    // A bot that missed most of its shots would show far more launches than rests: every miss is a
    // resaca and a pip. Since D4 that ratio IS the measurement — it is why a metronome no longer works.
    expect(rests / launches).toBeGreaterThan(0.8);
  });

  it('is deterministic: the same world played twice is the same run, frame for frame', () => {
    const a = play(20 * 60);
    const b = play(20 * 60);
    expect(a.pointers).toEqual(b.pointers);
    expect(a.snap.bubble.pos).toEqual(b.snap.bubble.pos);
    expect(a.snap.timeMs).toBe(b.snap.timeMs);
  });

  it('holds the finger up while there is nothing to push off (D1)', () => {
    // The world starts with Bur below the raft, rising: until she rests there is no shot to draw, and a
    // press would be the one metered double jump spent on a shot she did not need.
    const world = createTestWorld();
    const finger = new GuidedFinger(T);
    let snap = world.snapshot();
    let pressedWhileAirborne = 0;
    for (let i = 0; i < 20 * 60; i++) {
      const pointer = finger.next(STEP_MS, snap);
      const airborne = snap.bubble.state === 'IDLE' || snap.bubble.state === 'LAUNCHED';
      if (pointer.down && airborne) pressedWhileAirborne++;
      world.update(STEP_MS, pointer);
      snap = world.snapshot();
    }
    expect(pressedWhileAirborne).toBe(0);
    expect(finger.next(STEP_MS, { ...snap, bubble: { ...snap.bubble, state: 'LAUNCHED' } })).toEqual(POINTER_UP);
  });

  it('cutCorners takes the contested line once, then plays that rung straight (§5 nº 6, nº 7)', () => {
    // Zone 1 has one hazard and it is a rhythm gate, so the interesting assertion here is the shape of
    // the behaviour, not the pip count: `z2.play.test.ts` is where the crowns are. A greedy bot must
    // still descend — a bot that cuts the same corner for ever is a stall, not a player.
    const greedy = play(120 * 60, true);
    const careful = play(120 * 60, false);
    expect(greedy.snap.run.maxProgressY).toBeGreaterThan(5 * T.CHUNK_H);
    expect(careful.snap.run.maxProgressY).toBeGreaterThanOrEqual(greedy.snap.run.maxProgressY);
  });
});
