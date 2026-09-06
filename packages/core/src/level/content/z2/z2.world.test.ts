/**
 * Zone 2 against the 540 px world of DECISIONS-v1.2 (D3, D4), and against a bot that plays it.
 *
 * The same questions `z1.world.test.ts` asks, asked of the reef: they are answered by `../layout.ts`
 * once, so "open water" and "the reef's side bands" can never come to mean two different things in the
 * two zones. What is Zone 2's own — currents, crowns, the octopus — lives in `z2.test.ts`, and the
 * end-to-end play of the zone's three creatures in `z2.play.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, createTuning } from '../../../tuning';
import { zoneRadius } from '../../../control/charge';
import { ChunkLibrary } from '../../library';
import { GuidedFinger } from '../../../game/autoPlayer';
import { buildMvpCampaign, createMvpWorld } from '../../../game/testHarness';
import { SIDE_BAND_L, SIDE_BAND_R } from '../ladder';
import {
  anchorsOf,
  buriedPickups,
  ceilingsOf,
  mercyBagHost,
  pickupsOf,
  respawnCanopy,
  wallsOf,
  widestOpenRunAt,
} from '../layout';
import { Z2, Z2_CHUNKS, Z2_SEQUENCES } from './index';
import type { GameEvent, WorldSnapshot } from '../../../types';

const t = createTuning();
const T = DEFAULT_TUNING;
const STEP_MS = T.FIXED_DT * 1000;
const library = new ChunkLibrary([...Z2_CHUNKS]);
const RADIUS = zoneRadius(Z2, t);

describe('Zone 2 in the 540 px world (D3, D4)', () => {
  it('declares 3–5 rest points per chunk, which is the density D4 asks for', () => {
    for (const chunk of Z2_CHUNKS) {
      const anchors = anchorsOf(chunk);
      expect(anchors.length, chunk.id).toBeGreaterThanOrEqual(3);
      expect(anchors.length, chunk.id).toBeLessThanOrEqual(5);
    }
  });

  it('hangs a capturable ceiling over the boya respawn point in every chunk (§2.4.2)', () => {
    for (const chunk of Z2_CHUNKS) {
      expect(respawnCanopy(chunk, t.WORLD_W, t.CHUNK_H), `${chunk.id}: nothing over x=${t.WORLD_W / 2}`).toBeDefined();
    }
  });

  it('keeps the reef in its side bands and the rest of the world open (D3, Hungry Shark)', () => {
    for (const chunk of Z2_CHUNKS) {
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

  it('leaves a lateral detour in every immersion: a pickup a screen off the ladder (D3)', () => {
    // The *Hungry Shark* shape D3 asks for is "coleccionables que invitan a desviarse lateralmente":
    // a shell you can only take by spending seconds on a line that does not descend. So every immersion
    // has to hold at least one pickup further from the ladder than half a screen.
    for (const sequence of Z2_SEQUENCES) {
      let detours = 0;
      for (const id of sequence) {
        const chunk = library.get(id);
        const anchors = anchorsOf(chunk);
        for (const p of pickupsOf(chunk)) {
          const nearest = Math.min(...anchors.map((a) => Math.abs(a.pos.x - p.pos.x)));
          if (nearest >= t.VIEW_W / 2) detours++;
        }
      }
      expect(detours, `no lateral detour in ${sequence.join(', ')}`).toBeGreaterThan(0);
    }
  });

  it('offers 1,05 immersions worth of Air against the zone capacity (§11.5.7)', () => {
    for (const sequence of Z2_SEQUENCES) {
      const supply = sequence.reduce((sum, id) => sum + library.get(id).airBudget, 0);
      expect(supply / (t.ZONE_AIR_MAX[Z2] ?? 8)).toBeGreaterThanOrEqual(1.05);
    }
  });

  it('leaves the mercy bag somewhere Bur can reach it (§4.2.3, §11.5.8)', () => {
    for (const chunk of Z2_CHUNKS) {
      expect(mercyBagHost(chunk), `${chunk.id} has no host for the mercy bag`).toBeDefined();
      expect(buriedPickups(chunk, RADIUS).map((p) => p.id), chunk.id).toEqual([]);
    }
  });

  it('keeps every ledge readable: 24–60 px, bar the terraces and the two shelves that hide a rest point', () => {
    const ceilings = Z2_CHUNKS.flatMap(ceilingsOf);
    for (const c of ceilings) {
      expect(c.rect.w, c.id).toBeGreaterThanOrEqual(20);
      expect(c.rect.h, c.id).toBe(10); // §5 nº 9 only works while every rung is the same slab
    }
    const inBand = ceilings.filter((c) => c.rect.w >= 24 && c.rect.w <= 60);
    expect(inBand.length / ceilings.length).toBeGreaterThan(0.8);
  });
});

// ---------------------------------------------------------------------------------------------
// The zone, played
// ---------------------------------------------------------------------------------------------

describe('Zone 2 is playable (§12.1, §12.3.2)', () => {
  /** Steps the guided autoplayer through the MVP campaign until `stop` says so, or the budget runs out. */
  function playGuided(
    startStationIndex: number,
    budgetFrames: number,
    stop: (s: WorldSnapshot) => boolean,
  ): { snap: WorldSnapshot; events: GameEvent[]; frames: number; deepest: number } {
    const world = createMvpWorld({ startStationIndex });
    const finger = new GuidedFinger(T);
    const events: GameEvent[] = [];
    let snap = world.snapshot();
    let deepest = 0;
    let frames = 0;
    for (; frames < budgetFrames; frames++) {
      world.update(STEP_MS, finger.next(STEP_MS, snap));
      snap = world.snapshot();
      events.push(...snap.events);
      deepest = Math.max(deepest, snap.run.maxProgressY);
      if (stop(snap)) break;
      if (snap.phase === 'station') world.continueDescent();
      if (snap.phase === 'dead') world.restart();
    }
    return { snap, events, frames, deepest };
  }

  it('a bot dropped at the Z1 -> Z2 station reaches the zone`s first station with Air to spare', () => {
    // Since D1 the game is won by CALCULATING the shot, so the bot that measures a zone has to aim:
    // `game/autoPlayer.ts` picks every shot with the validator's own reach search and is naive in every
    // other way (no mid-air correction, no double jump, nothing collected on purpose).
    const campaign = buildMvpCampaign(T);
    const { snap, events, frames } = playGuided(1, 300 * 60, (s) => s.run.lastStationIndex >= 2);

    expect(snap.run.lastStationIndex).toBe(2); // z2-station-1 closes the zone's first immersion
    expect(frames).toBeLessThan(300 * 60);
    expect(snap.zone).toBe(1);
    expect(snap.bubble.pos.y).toBeGreaterThanOrEqual(campaign.immersions[2]!.boyaY);
    expect(snap.bubble.air).toBeGreaterThan(0);
    // It crossed the zone's first breath buoy on the way, and never drowned getting there.
    expect(events.filter((e) => e.type === 'boya').map((e) => (e.type === 'boya' ? e.boyaId : ''))).toEqual(['boya:2']);
    expect(events.some((e) => e.type === 'gameOver')).toBe(false);
    // §11.7.12: the zone change is announced once, and Zone 2's capacity is still 8 pips.
    const zoneChanges = events.filter((e) => e.type === 'zoneChange');
    expect(zoneChanges).toHaveLength(1);
    expect(zoneChanges[0]).toEqual({ type: 'zoneChange', from: 0, to: 1 });
    expect(snap.bubble.airMax).toBe(T.ZONE_AIR_MAX[1]);
    expect(snap.bubble.radius).toBeCloseTo(RADIUS, 10);
  });

  it('the anemone still bites a bot that cuts every corner, and never traps it twice running (§5 nº 7)', () => {
    // The regression this zone was rebuilt around. A review swept a metronome bot over 27 cadences and
    // 9 of them DIED, every death trap-driven: the anemone vented, dropped Bur a few px above her own
    // crown, and the escape — a downward launch — put her straight back in, one pip every TRAP_VENT_MS
    // until the bar was empty. Two things fixed it, and this is what watches both: a vent leaves the
    // crown open for TRAP_REARM_MS (`game/hazards.ts`), and no crown may sit anywhere a 60 % charge
    // cannot leave (`validator.trapEscapes`, checked per chunk in `z2.test.ts`).
    //
    // The bot is the guided one with `cutCorners`: on the first try at every rung it deliberately picks
    // the line a crown is ON, pays for it, and plays that rung straight from then on. That is the player
    // the zone is built to punish, and it is the only bot that can still meet a crown at all — since D4 a
    // fixed-cadence finger misses every hop, so its depth and its pip count would both measure the
    // gesture and not the level.
    const world = createMvpWorld({ startStationIndex: 1 });
    const finger = new GuidedFinger(T, true);
    let snap = world.snapshot();
    let trapPips = 0;
    let hits = 0;
    let streak = 0;
    let worstStreak = 0;
    for (let i = 0; i < 600 * 60; i++) {
      world.update(STEP_MS, finger.next(STEP_MS, snap));
      snap = world.snapshot();
      for (const e of snap.events) {
        if (e.type === 'airLost' && e.reason === 'trap') {
          trapPips++;
          streak++;
          worstStreak = Math.max(worstStreak, streak);
        } else if (e.type === 'airLost' && e.reason === 'hit') {
          hits++;
        } else if (e.type === 'rest' || e.type === 'launch') {
          streak = 0;
        }
      }
      if (snap.phase === 'campaignComplete') break;
      if (snap.phase === 'station') world.continueDescent();
      if (snap.phase === 'dead') world.restart();
    }
    expect(trapPips, 'the anemone must still cost pips: a harmless trap is not a fix').toBeGreaterThan(0);
    expect(hits, 'and so must the urchin (§5 nº 6)').toBeGreaterThan(0);
    expect(worstStreak, 'a crown must never take two pips without letting Bur move in between').toBe(1);
    // Paying is not the same as being stuck: the corner-cutter still gets to the bottom of the zone.
    expect(snap.phase, 'a crown that a player can pay for must never be a soft lock').toBe('campaignComplete');
  });

  it('a bot that keeps going crosses the whole zone and ends the campaign at the delivery station', () => {
    const { snap, events, deepest } = playGuided(1, 600 * 60, (s) => s.phase === 'campaignComplete');
    const zones = new Set(events.flatMap((e) => (e.type === 'zoneChange' ? [e.to] : [])));

    expect(snap.phase).toBe('campaignComplete');
    // The column ends exactly on the Z2/Z3 border (§11.1), and the last fall crosses it before
    // `campaignComplete` fires. The run must never announce a zone it does not contain: a naive bot used
    // to report a `zoneChange` into Zone 3 and the shell repainted to its palette for a frame.
    expect(zones.has(2)).toBe(false);
    expect(zones.has(1)).toBe(true);
    expect(deepest).toBeGreaterThanOrEqual(6960); // into the last station band of the zone
    expect(snap.run.lastStationIndex).toBe(4);
    expect(events.some((e) => e.type === 'gameOver')).toBe(false);
  });

  it('never leaves the 540 px column, and progress never goes backwards (§4.3, D3)', () => {
    const world = createMvpWorld({ startStationIndex: 1 });
    const finger = new GuidedFinger(T);
    let snap = world.snapshot();
    let previous = -Infinity;
    let monotonic = true;
    for (let i = 0; i < 600 * 60; i++) {
      world.update(STEP_MS, finger.next(STEP_MS, snap));
      snap = world.snapshot();
      if (snap.run.maxProgressY < previous) monotonic = false;
      previous = snap.run.maxProgressY;
      if (snap.phase === 'campaignComplete') break;
      if (snap.phase === 'station') world.continueDescent();
      if (snap.phase === 'dead') world.restart();
      expect(snap.bubble.pos.x).toBeGreaterThanOrEqual(0);
      expect(snap.bubble.pos.x).toBeLessThanOrEqual(T.WORLD_W);
    }
    expect(monotonic).toBe(true);
    expect(snap.phase).toBe('campaignComplete');
  });
});
