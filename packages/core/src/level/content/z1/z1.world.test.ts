/**
 * Zone 1 against the 540 px world of DECISIONS-v1.2 (D3, D4), and against a bot that plays it.
 *
 * `z1.test.ts` asserts the §11.5 rules and the §5 catalogue; what is checked here is the shape D3 asks
 * for — open water with scattered structures, the reef in its side bands, a ceiling over the point a
 * death respawns at — and the one claim no static rule can make: that the zone can be descended.
 */
import { describe, expect, it } from 'vitest';
import { createTuning } from '../../../tuning';
import { ChunkLibrary } from '../../library';
import { GuidedFinger } from '../../../game/autoPlayer';
import { HARNESS_VIEW_H, createTestWorld } from '../../../game/testHarness';
import { MAX_HOP_X_DESIGN_PX, MIN_HOP_X_PX, SIDE_BAND_L, SIDE_BAND_R } from '../ladder';
import {
  anchorsOf,
  buriedPickups,
  campaignLadder,
  ceilingsOf,
  lateralGaps,
  mercyBagHost,
  pickupsOf,
  respawnCanopy,
  wallsOf,
  widestOpenRunAt,
} from '../layout';
import { Z1_CHUNKS, Z1_SEQUENCES } from './index';
import type { GameEvent } from '../../../types';

const t = createTuning();
const library = new ChunkLibrary([...Z1_CHUNKS]);
const RADIUS = t.RADIUS_BASE * (t.ZONE_RADIUS_PCT[0] ?? 1);
const STEP_MS = t.FIXED_DT * 1000;

describe('Zone 1 in the 540 px world (D3, D4)', () => {
  it('declares 3–5 rest points per chunk, which is the density D4 asks for', () => {
    for (const chunk of Z1_CHUNKS) {
      const anchors = anchorsOf(chunk);
      expect(anchors.length, chunk.id).toBeGreaterThanOrEqual(3);
      expect(anchors.length, chunk.id).toBeLessThanOrEqual(5);
    }
  });

  it('keeps every lateral gap inside the band a shot can actually cross, seams included', () => {
    // Both ends of the band are physics, not taste (`level/content/ladder.ts`): under MIN_HOP_X_PX Bur
    // meets the next ledge's TOP face and bounces off it, over MAX_HOP_X_DESIGN_PX no shot in the ±90°
    // cone arrives. §11.1 makes the campaign one column, so the seams are rungs like any other.
    const chunks = Z1_SEQUENCES.flatMap((s) => [...s]).map((id) => library.get(id));
    const gaps = lateralGaps(campaignLadder(chunks));
    expect(gaps.length).toBeGreaterThan(30);
    for (const { label, gap } of gaps) {
      expect(gap, label).toBeGreaterThanOrEqual(MIN_HOP_X_PX);
      expect(gap, label).toBeLessThanOrEqual(MAX_HOP_X_DESIGN_PX);
    }
    // ...and the ladder really does use the width: a zone that never leaves one screen is not D3.
    const xs = campaignLadder(chunks).map((r) => r.pos.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(2 * t.VIEW_W);
  });

  it('hangs a capturable ceiling over the boya respawn point in every chunk (§2.4.2)', () => {
    // A death sends Bur to the last boya, and §2.4.2 puts that respawn at WORLD_W / 2 on a chunk seam,
    // in open water, where she floats up. Without a ceiling over that column she rises out of the world
    // instead of coming to rest — so the exit cornice of every chunk spans the middle of it.
    for (const chunk of Z1_CHUNKS) {
      expect(respawnCanopy(chunk, t.WORLD_W, t.CHUNK_H), `${chunk.id}: nothing over x=${t.WORLD_W / 2}`).toBeDefined();
    }
  });

  it('keeps the reef in its side bands and the rest of the world open (D3, Hungry Shark)', () => {
    for (const chunk of Z1_CHUNKS) {
      for (const w of wallsOf(chunk)) {
        const inBand = w.rect.x + w.rect.w <= SIDE_BAND_L || w.rect.x >= SIDE_BAND_R;
        expect(inBand, `${chunk.id}/${w.id} is not in a side band`).toBe(true);
      }
      for (const c of ceilingsOf(chunk)) {
        expect(c.rect.x, `${chunk.id}/${c.id}`).toBeGreaterThanOrEqual(SIDE_BAND_L);
        expect(c.rect.x + c.rect.w, `${chunk.id}/${c.id}`).toBeLessThanOrEqual(SIDE_BAND_R);
      }
      for (let y = 0; y < t.CHUNK_H; y += 10) {
        expect(widestOpenRunAt(chunk, y, t.WORLD_W), `${chunk.id} at y=${y}`).toBeGreaterThanOrEqual(t.VIEW_W / 2);
      }
    }
  });

  it('keeps every ledge readable: 24–60 px, bar the raft, the turtles and the terraces', () => {
    const ceilings = Z1_CHUNKS.flatMap(ceilingsOf);
    for (const c of ceilings) {
      expect(c.rect.w, c.id).toBeGreaterThanOrEqual(20);
      expect(c.rect.h, c.id).toBeGreaterThanOrEqual(8);
    }
    const inBand = ceilings.filter((c) => c.rect.w >= 24 && c.rect.w <= 60);
    expect(inBand.length / ceilings.length).toBeGreaterThan(0.8);
  });

  it('hangs three shells in every immersion and a pearl in every playable chunk (§12.1, §2.5)', () => {
    for (const sequence of Z1_SEQUENCES) {
      const shells = sequence.flatMap((id) => pickupsOf(library.get(id)).filter((p) => p.pickupType === 'concha'));
      expect(shells).toHaveLength(3);
    }
    for (const chunk of Z1_CHUNKS) {
      if (chunk.role === 'station') continue;
      expect(pickupsOf(chunk).filter((p) => p.pickupType === 'perla').length, chunk.id).toBeGreaterThan(0);
    }
  });

  it('offers 1,15 immersions worth of Air against the zone capacity (§11.5.7)', () => {
    for (const sequence of Z1_SEQUENCES) {
      const supply = sequence.reduce((sum, id) => sum + library.get(id).airBudget, 0);
      expect(supply / (t.ZONE_AIR_MAX[0] ?? 8)).toBeGreaterThanOrEqual(1.15);
    }
  });

  it('leaves the mercy bag somewhere Bur can reach it (§4.2.3, §11.5.8)', () => {
    // `level/mercy.ts` puts the extra bolsa de aire on top of a pickup the author already declared —
    // "un punto de este chunk que se sabe agua libre". That is only true if the authored pickups ARE in
    // free water, which is a content contract and belongs here.
    for (const chunk of Z1_CHUNKS) {
      expect(mercyBagHost(chunk), `${chunk.id} has no host for the mercy bag`).toBeDefined();
      expect(buriedPickups(chunk, RADIUS).map((p) => p.id), chunk.id).toEqual([]);
    }
  });
});

describe('Zone 1, played (§12.3.2)', () => {
  it('a bot that aims reaches the first boya and the first station with Air to spare', () => {
    // The autoplayer of `game/autoPlayer.ts`: it picks each shot with the validator's own search and is
    // naive in every other way. Since D1/D4 that is the minimum a bot has to do — the reward is for
    // CALCULATING the shot, so a fixed-cadence finger measures nothing about the level any more.
    const world = createTestWorld({ viewH: HARNESS_VIEW_H });
    const finger = new GuidedFinger(t);
    const events: GameEvent[] = [];
    let snap = world.snapshot();
    let frames = 0;
    for (; frames < 200 * 60; frames++) {
      world.update(STEP_MS, finger.next(STEP_MS, snap));
      snap = world.snapshot();
      events.push(...snap.events);
      if (snap.run.lastStationIndex >= 0) break;
      if (snap.phase === 'station') world.continueDescent();
      if (snap.phase === 'dead') world.restart();
    }

    // `run.lastBoyaId` is the LIVE checkpoint and the station supersedes it, so the boya is asserted
    // on the event that announced it, not on the state left behind once the station took over (§3.1).
    expect(events.filter((e) => e.type === 'boya').map((e) => (e.type === 'boya' ? e.boyaId : ''))).toEqual(['boya:0']);
    expect(snap.run.lastStationIndex).toBe(0);
    expect(frames).toBeLessThan(200 * 60);
    expect(snap.bubble.air).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'gameOver')).toBe(false);
    // It got there by playing the zone, not by falling through it: every landing is a rest (§2.3).
    expect(events.filter((e) => e.type === 'rest').length).toBeGreaterThanOrEqual(20);
    expect(events.filter((e) => e.type === 'launch').length).toBeGreaterThanOrEqual(20);
  });

  it('crosses the whole zone: both immersions, both stations, no death', () => {
    const world = createTestWorld({ viewH: HARNESS_VIEW_H });
    const finger = new GuidedFinger(t);
    let snap = world.snapshot();
    let deaths = 0;
    let deepest = 0;
    for (let i = 0; i < 400 * 60; i++) {
      world.update(STEP_MS, finger.next(STEP_MS, snap));
      snap = world.snapshot();
      for (const e of snap.events) if (e.type === 'gameOver') deaths++;
      deepest = Math.max(deepest, snap.run.maxProgressY);
      if (snap.phase === 'campaignComplete') break;
      if (snap.phase === 'station') world.continueDescent();
      if (snap.phase === 'dead') world.restart();
      expect(snap.bubble.pos.x).toBeGreaterThanOrEqual(0);
      expect(snap.bubble.pos.x).toBeLessThanOrEqual(t.WORLD_W);
    }
    expect(snap.phase).toBe('campaignComplete');
    expect(snap.run.lastStationIndex).toBe(1);
    expect(deepest).toBeGreaterThanOrEqual(11 * t.CHUNK_H);
    expect(deaths).toBe(0);
  });
});
