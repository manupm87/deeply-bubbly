/**
 * The mercy rule as content (GDD §4.2.3, §11.5.8, §11.7.8). When it FIRES is `run/runState.test.ts`;
 * what it does to a chunk is here, and the fact that a real `GameWorld` applies it is at the bottom.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, createTuning } from '../tuning';
import { createRunState, registerFailure } from '../run/runState';
import { buildCampaign, instantiateChunk } from './campaign';
import { ChunkLibrary } from './library';
import { applyMercy } from './mercy';
import { MVP_CHUNKS, MVP_SEQUENCES, POINTER_UP, createMvpWorld } from '../game/testHarness';
import type { Hazard, Pickup, RunState, WorldEntity } from '../types';

const t = DEFAULT_TUNING;
const library = new ChunkLibrary([...MVP_CHUNKS]);
const campaign = buildCampaign(library, MVP_SEQUENCES, t);

/** A run at the given mercy level, reached the way the game reaches it: by failing. */
function runAtLevel(level: 0 | 1 | 2): RunState {
  const run = createRunState(1, 'expedicion');
  const fails = level === 0 ? 0 : (t.MERCY_FAILS[level - 1] ?? 2);
  for (let i = 0; i < fails; i++) registerFailure(run, t);
  expect(run.mercyLevel).toBe(level);
  return run;
}

const hazardsOf = (entities: readonly WorldEntity[]): Hazard[] => entities.filter((e): e is Hazard => e.type === 'hazard');
const airOf = (entities: readonly WorldEntity[]): Pickup[] =>
  entities.filter((e): e is Pickup => e.type === 'pickup' && e.pickupType === 'aire');

/** Every placed chunk of the campaign, instantiated at `level`. */
function campaignAt(level: 0 | 1 | 2): WorldEntity[][] {
  const run = runAtLevel(level);
  return campaign.placed.map((placed) => {
    const first = (campaign.immersions[placed.immersionIndex]?.startY ?? 0) / t.CHUNK_H;
    return applyMercy(instantiateChunk(placed), run, {
      chunkIndex: placed.index,
      positionInImmersion: placed.index - first,
    }, t);
  });
}

describe('the mercy rule thins the world (§4.2.3, §11.5.8)', () => {
  it('is a no-op at level 0, and in abismo mode at any fail count (§4.2.3)', () => {
    const honest = createRunState(1, 'abismo');
    for (let i = 0; i < 6; i++) registerFailure(honest, t);
    expect(honest.mercyLevel).toBe(0);
    for (const placed of campaign.placed) {
      const plain = instantiateChunk(placed);
      const helped = applyMercy(plain, honest, { chunkIndex: placed.index, positionInImmersion: 0 }, t);
      expect(helped.map((e) => e.id)).toEqual(plain.map((e) => e.id));
    }
  });

  it('removes 20 % of the hazards at level 1 and 35 % at level 2 (MERCY_DENSITY_MUL)', () => {
    const nominal = campaignAt(0).flatMap(hazardsOf).length;
    const level1 = campaignAt(1).flatMap(hazardsOf).length;
    const level2 = campaignAt(2).flatMap(hazardsOf).length;
    expect(nominal).toBeGreaterThan(10);
    // The removal is a low-discrepancy sequence over a finite population, not a shuffle: the ratio is
    // the target, and a couple of hazards of slack is what "densidad" can mean at this population size.
    expect(level1 / nominal).toBeCloseTo(t.MERCY_DENSITY_MUL[0] ?? 0.8, 1);
    expect(level2 / nominal).toBeCloseTo(t.MERCY_DENSITY_MUL[1] ?? 0.65, 1);
  });

  it('is deterministic and monotone: level 2 removes a superset of level 1', () => {
    const first = campaignAt(1).flatMap(hazardsOf).map((h) => h.id);
    expect(campaignAt(1).flatMap(hazardsOf).map((h) => h.id)).toEqual(first);
    const second = new Set(campaignAt(2).flatMap(hazardsOf).map((h) => h.id));
    for (const id of second) expect(first).toContain(id);
    expect(second.size).toBeLessThan(first.length);
  });

  it('adds one air bag per immersion at level 1 and two at level 2, on water the author certified', () => {
    for (const level of [1, 2] as const) {
      const chunks = campaignAt(level);
      for (const immersion of campaign.immersions) {
        const before = immersion.chunkIds.reduce((sum, id) => sum + airOf(instantiateChunk({ chunk: library.get(id), index: 0, worldY: 0, immersionIndex: 0 })).length, 0);
        const after = campaign.placed
          .filter((p) => p.immersionIndex === immersion.index)
          .reduce((sum, p) => sum + airOf(chunks[p.index] ?? []).length, 0);
        expect(after - before, `immersion ${immersion.index} at mercy ${level}`).toBe(level);
      }
      // Every bag sits exactly on a pickup the chunk already declared: never a new coordinate.
      for (const entities of chunks) {
        for (const bag of entities.filter((e) => e.id.includes('mercy-air'))) {
          if (bag.type !== 'pickup') continue;
          const host = entities.some((e) => e.type === 'pickup' && e.id !== bag.id && e.pos.x === bag.pos.x && e.pos.y === bag.pos.y);
          expect(host).toBe(true);
        }
      }
    }
  });

  it('reaches the live world: two failures of an immersion thin the chunks Bur is standing in (§11.7.8)', () => {
    // The same trick `GameWorld.test.ts` uses to die on demand: a tuning where one hold vents the bar.
    const lethal = createTuning({
      OVERCHARGE_MS: 60,
      OVERCHARGE_MS_RESTING: 60,
      OVERCHARGE_DRAIN_MS: 60,
      OVERCHARGE_MIN_AIR: 0,
      OVERCHARGE_MAX_DRAIN: 32,
      AUTO_RELEASE_MS: 60_000,
    });
    const world = createMvpWorld({ startStationIndex: 1 });
    const before = world.snapshot().entities.filter((e) => e.type === 'hazard').length;
    world.setTuning(lethal);
    const held = { down: true, x: 90, y: 200 };
    for (let i = 0; i < 2; i++) {
      for (let f = 0; f < 10; f++) world.update(t.FIXED_DT * 1000, POINTER_UP);
      for (let f = 0; f < 60 * 20 && world.snapshot().phase !== 'dead'; f++) world.update(t.FIXED_DT * 1000, held);
      expect(world.snapshot().phase).toBe('dead');
      world.restart();
    }
    const snap = world.snapshot();
    expect(snap.run.failCountThisImmersion).toBe(2);
    expect(snap.run.mercyLevel).toBe(1);
    const after = snap.entities.filter((e) => e.type === 'hazard').length;
    expect(after).toBeLessThanOrEqual(before);
    // ...and the help is silent: nothing in the event stream or the HUD says a word about it.
    expect(snap.events.some((e) => e.type === 'airGained')).toBe(false);
  });
});
