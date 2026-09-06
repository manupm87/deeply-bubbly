/**
 * Zone 2 content contracts (GDD §3.2, §4, §11.5, §12.1). Everything the zone promises that can be
 * checked without a screen is checked here; the end-to-end play of the zone lives in `z2.play.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, createTuning } from '../../../tuning';
import { zoneRadius } from '../../../control/charge';
import { buildCampaign, campaignMarkers, instantiateChunk } from '../../campaign';
import { zoneAt } from '../../depth';
import { ChunkLibrary } from '../../library';
import { findLandingLines, restPoseY, sideWalls, validateCampaign, validateChunk, validateSequence } from '../../validator';
import { MVP_CHUNKS, MVP_SEQUENCES } from '../../../game/testHarness';
import { Z1_SEQUENCES } from '../z1';
import { CURRENT_ACCEL, CURRENT_DRIFT, PULPO_REST_MS, anemona, currentBand } from '../builders';
import { sideOf } from './pieces';
import { Z2, Z2_CHUNKS, Z2_LIBRARY, Z2_LIB_A, Z2_LIB_E, Z2_SEQUENCES, Z2_STATION_1, Z2_STATION_2, Z2_STATION_3, Z2_TUTORIAL } from './index';
import type { ValidationIssue } from '../../validator';
import type { Anchor, Ceiling, Chunk, ForceField, Hazard, Pickup, SolidEntity, WorldEntity } from '../../../types';

const t = createTuning();
const library = new ChunkLibrary([...MVP_CHUNKS]);

const errors = (issues: readonly ValidationIssue[]): ValidationIssue[] => issues.filter((i) => i.severity === 'error');
const describeIssues = (issues: readonly ValidationIssue[]): string[] =>
  issues.map((i) => `${i.severity} [${i.rule}] ${i.chunkId ?? '-'}: ${i.message}`);

const of = <T extends WorldEntity>(chunk: Chunk, type: T['type']): T[] =>
  chunk.entities.filter((e): e is T => e.type === type);

const chunkOf = (id: string): Chunk => library.get(id);
const playable = (): Chunk[] => Z2_CHUNKS.filter((c) => c.role !== 'station');

describe('Zone 2 content', () => {
  it('is the 18 chunks §3.2 asks for: one verb tutorial, fourteen playable, three stations', () => {
    expect(Z2_CHUNKS).toHaveLength(18);
    expect(new Set(Z2_CHUNKS.map((c) => c.id)).size).toBe(18);
    expect(Z2_CHUNKS.filter((c) => c.role === 'tutorial')).toEqual([Z2_TUTORIAL]);
    expect(Z2_CHUNKS.filter((c) => c.role === 'station')).toEqual([Z2_STATION_1, Z2_STATION_2, Z2_STATION_3]);
    expect(Z2_LIBRARY).toHaveLength(14);
    expect(Z2_CHUNKS.every((c) => c.zone === Z2)).toBe(true);
    expect(Z2_CHUNKS.every((c) => c.id.startsWith('z2-'))).toBe(true);
    // §12.1 keeps Pulpa (§5 nº 11) out of the MVP: no boss chunk in this zone.
    expect(Z2_CHUNKS.some((c) => c.role === 'boss')).toBe(false);
  });

  it('gives the H3 selector a chunk of every difficulty (§4.1 histogram)', () => {
    expect(new Set(playable().map((c) => c.difficulty))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('passes validateChunk with no errors and no warnings', () => {
    for (const chunk of Z2_CHUNKS) expect(describeIssues(validateChunk(chunk, t)), chunk.id).toEqual([]);
  });

  it('keeps every chunk inside the 12 s authoring budget', () => {
    for (const chunk of Z2_CHUNKS) {
      expect(chunk.targetTimeS, chunk.id).toBeGreaterThan(0);
      expect(chunk.targetTimeS, chunk.id).toBeLessThanOrEqual(12);
    }
  });

  it('gives every playable chunk one or two air pockets, and the stations none (§2.5, §11.5.7)', () => {
    for (const chunk of Z2_CHUNKS) {
      const air = of<Pickup>(chunk, 'pickup').filter((p) => p.pickupType === 'aire');
      if (chunk.role === 'station') {
        expect(air, chunk.id).toHaveLength(0);
        expect(chunk.airBudget, chunk.id).toBe(0);
        continue;
      }
      expect(air.length, chunk.id).toBeGreaterThanOrEqual(1);
      expect(air.length, chunk.id).toBeLessThanOrEqual(2);
      expect(chunk.airBudget, chunk.id).toBe(air.length);
    }
  });

  it('hangs three shells in every immersion, all of them in playable water (§12.1)', () => {
    for (const sequence of Z2_SEQUENCES) {
      const shells = sequence.flatMap((id) =>
        of<Pickup>(chunkOf(id), 'pickup').filter((p) => p.pickupType === 'concha'),
      );
      expect(shells).toHaveLength(3);
      for (const s of shells) {
        expect(s.pos.x).toBeGreaterThan(0);
        expect(s.pos.x).toBeLessThan(t.WORLD_W);
        expect(s.pos.y).toBeGreaterThan(0);
        expect(s.pos.y).toBeLessThan(t.CHUNK_H);
      }
    }
  });

  it('drops at least one pearl in every playable chunk (§2.5)', () => {
    for (const chunk of playable()) {
      expect(of<Pickup>(chunk, 'pickup').filter((p) => p.pickupType === 'perla').length, chunk.id).toBeGreaterThan(0);
    }
  });

  it('offers more Air than an immersion can hold, which is the 1,15 ratio of §11.5.7 in the safe direction', () => {
    // The zone's capacity is 8 pips (§2.6, ZONE_AIR_MAX[1]); five playable chunks of 1-2 pockets put the
    // supply above it in every immersion, so the ratio can only be tuned DOWN in playtest, never up
    // against a wall of missing content.
    for (const sequence of Z2_SEQUENCES) {
      const supply = sequence.reduce((sum, id) => sum + chunkOf(id).airBudget, 0);
      expect(supply).toBeGreaterThanOrEqual(7);
      expect(supply / (t.ZONE_AIR_MAX[Z2] ?? 8)).toBeGreaterThanOrEqual(0.85);
    }
  });
});

describe('the Zone 2 catalogue (§5 nº 6, 7, 8, 9)', () => {
  const hazards = (): Hazard[] => Z2_CHUNKS.flatMap((c) => of<Hazard>(c, 'hazard'));
  const fields = (): ForceField[] => Z2_CHUNKS.flatMap((c) => of<ForceField>(c, 'forcefield'));
  const ceilings = (): Ceiling[] => Z2_CHUNKS.flatMap((c) => of<Ceiling>(c, 'ceiling'));

  it('uses only catalogue entries the MVP ships (§12.1: nº 1, 2, 3, 5, 6, 7, 8, 9)', () => {
    const used = new Set<number>();
    for (const h of hazards()) used.add(h.catalogId);
    for (const f of fields()) if (f.catalogId !== undefined) used.add(f.catalogId);
    for (const c of ceilings()) if (c.catalogId !== undefined) used.add(c.catalogId);
    expect([...used].sort((a, b) => a - b)).toEqual([6, 7, 8, 9]);
  });

  it('nº 6 Erizo Coralino: static, always active, costs one pip, pushes laterally (§11.7.9)', () => {
    const urchins = hazards().filter((h) => h.catalogId === 6);
    expect(urchins.length).toBeGreaterThanOrEqual(2);
    for (const h of urchins) {
      expect(h.periodMs, h.id).toBeUndefined(); // "nunca se mueve": no duty cycle, no tell, no phase
      expect(h.moving, h.id).toBeUndefined();
      expect(h.trap, h.id).toBeUndefined();
      expect(h.airCost, h.id).toBe(1);
      expect(h.pushDir, h.id).toBe('lateral');
    }
  });

  it('nº 6 and nº 7 grow on a ledge — its shoulder or its lip — and never over its own rest point', () => {
    // Both seats are legal (`builders.CrownGrowth`) and they mean different things: a crown on the
    // SHOULDER (box bottom on the ledge's top face) punishes an overshoot, one on the LIP (box top on
    // the ledge's underside, half of it hanging into the water) contests the landing itself. What is
    // never legal is a crown floating in open water, or one that covers the rest point of its own ledge:
    // a landing that is exactly right must never cost a pip.
    for (const chunk of Z2_CHUNKS) {
      const ledges = of<Ceiling>(chunk, 'ceiling');
      for (const h of of<Hazard>(chunk, 'hazard')) {
        const spansHalf = (c: Ceiling): boolean =>
          Math.min(h.shape.x + h.shape.w, c.rect.x + c.rect.w) - Math.max(h.shape.x, c.rect.x) >= h.shape.w / 2 - 0.01;
        const shoulder = ledges.find((c) => Math.abs(c.rect.y - (h.shape.y + h.shape.h)) < 0.5 && spansHalf(c));
        const lip = ledges.find((c) => Math.abs(c.rect.y + c.rect.h - h.shape.y) < 0.5 && spansHalf(c));
        const seat = shoulder ?? lip;
        expect(seat, `${chunk.id}/${h.id} is not seated on a ledge`).toBeDefined();
        const rest = { x: seat!.rect.x, y: restPoseY(seat!.rect, zoneRadius(Z2, t)) };
        for (const anchor of of<Anchor>(chunk, 'anchor')) {
          if (anchor.ceilingId !== seat!.id) continue;
          const clear =
            anchor.pos.x + zoneRadius(Z2, t) <= h.shape.x ||
            anchor.pos.x - zoneRadius(Z2, t) >= h.shape.x + h.shape.w ||
            rest.y - zoneRadius(Z2, t) >= h.shape.y + h.shape.h;
          expect(clear, `${chunk.id}/${h.id} covers the rest pose of '${anchor.id}'`).toBe(true);
        }
      }
    }
  });

  it('nº 7 Anémona Pegajosa is the only trap, and never a contact hit as well', () => {
    const traps = hazards().filter((h) => h.trap === true);
    expect(traps.length).toBeGreaterThanOrEqual(2);
    for (const h of traps) expect(h.catalogId).toBe(7);
    for (const h of hazards()) expect(h.catalogId === 7).toBe(h.trap === true);
  });

  it('nº 8 Corriente de Arrecife drifts at ±90 px/s, which is ±27 px/s² (v_term = a / DAMPING_X)', () => {
    expect(CURRENT_DRIFT).toBe(90);
    expect(CURRENT_ACCEL).toBeCloseTo(27, 10);
    expect(CURRENT_ACCEL / t.DAMPING_X).toBeCloseTo(CURRENT_DRIFT, 10);
    const bands = fields();
    expect(bands.length).toBeGreaterThanOrEqual(8);
    for (const f of bands) {
      expect(f.fieldType, f.id).toBe('corriente');
      expect(Math.abs(f.vector.x), f.id).toBeCloseTo(CURRENT_ACCEL, 10);
      expect(f.vector.y, f.id).toBe(0); // horizontal band: §5 nº 8 has no vertical component
      expect(f.opensAscenso, f.id).toBe(false); // §4.3: only nº 20 and nº 21 open the ascent window
      expect(f.buoyancyMul, f.id).toBe(1);
      expect(f.impulseMul, f.id).toBe(1);
      expect(f.chargeMul, f.id).toBe(1);
      // A band is never the whole column any more. A review measured what full-width bands did: they
      // narrowed the aim and offered no choice, because there was no water outside them. Every band now
      // leaves a line around it — which is what makes entering one a decision (§5 nº 8, §3.3.3).
      expect(f.rect.w, f.id).toBeLessThan(t.WORLD_W);
      expect(f.rect.w, f.id).toBeGreaterThanOrEqual(60);
    }
    expect(bands.some((f) => f.vector.x > 0)).toBe(true);
    expect(bands.some((f) => f.vector.x < 0)).toBe(true);
  });

  it('nº 9 Pulpo Camuflado is a capturable ledge that runs out at 0,5 s', () => {
    const octopuses = ceilings().filter((c) => c.catalogId === 9);
    expect(octopuses.length).toBeGreaterThanOrEqual(2);
    for (const c of octopuses) {
      expect(c.capturable, c.id).toBe(true);
      expect(c.kind, c.id).toBe('impaciente');
      expect(c.maxRestMs, c.id).toBe(PULPO_REST_MS);
      expect(c.maxRestMs!, c.id).toBeLessThan(t.REST_MAX_MS.impaciente);
      expect(c.restitution, c.id).toBe(t.RESTITUTION_ROCK);
      // How the shell tells him from a rock shelf without knowing a rule (§8: silhouette first).
      expect(c.material, c.id).toBe('creature');
    }
    // He must be indistinguishable from a real rung by every OTHER property, or the trick is not a trick.
    for (const c of octopuses) expect(c.rect.h).toBe(10);
  });

  it('never pushes UP: §11.7.9 allows it to catalogId 20 and 21 only, and neither is in this zone', () => {
    for (const h of hazards()) expect(h.pushDir, h.id).not.toBe('up');
    for (const f of fields()) expect(f.vector.y, f.id).toBeGreaterThanOrEqual(0);
  });
});

describe('Z2_SEQUENCES', () => {
  it('is three immersions of IMMERSION_CHUNKS ids, each closed by a station (§11.1, §3.1)', () => {
    expect(Z2_SEQUENCES).toHaveLength(3);
    for (const sequence of Z2_SEQUENCES) {
      expect(sequence).toHaveLength(t.IMMERSION_CHUNKS);
      for (const id of sequence) expect(library.has(id)).toBe(true);
      expect(chunkOf(sequence[sequence.length - 1]!).role).toBe('station');
    }
    expect(Z2_SEQUENCES[0]?.[0]).toBe(Z2_TUTORIAL.id); // §4.1: the verb tutorial opens the zone
    expect(Z2_SEQUENCES[0]?.[5]).toBe(Z2_STATION_1.id);
    expect(Z2_SEQUENCES[1]?.[5]).toBe(Z2_STATION_2.id);
    expect(Z2_SEQUENCES[2]?.[5]).toBe(Z2_STATION_3.id);
  });

  it('uses every authored chunk exactly once', () => {
    const used = Z2_SEQUENCES.flatMap((s) => [...s]);
    expect(used).toHaveLength(Z2_CHUNKS.length);
    expect(new Set(used).size).toBe(Z2_CHUNKS.length);
  });

  it('walks the difficulty curve of §4.2: 1-3, then 2-4, then up to 5', () => {
    const curve = Z2_SEQUENCES.map((s) => s.map((id) => chunkOf(id).difficulty));
    expect(curve[0]).toEqual([1, 1, 2, 3, 3, 1]);
    expect(curve[1]).toEqual([2, 3, 4, 3, 4, 1]);
    expect(curve[2]).toEqual([3, 3, 4, 3, 5, 1]);
    // §12.1 drops Pulpa, so the zone ends on its hardest playable chunk and then the delivery station.
    expect(chunkOf(Z2_SEQUENCES[2]![4]!).difficulty).toBe(5);
    expect(chunkOf(Z2_SEQUENCES[2]![5]!).role).toBe('station');
  });

  it('respects the breathing rule everywhere (§4.2.2, §11.5.4)', () => {
    for (const sequence of Z2_SEQUENCES) {
      const d = sequence.map((id) => chunkOf(id).difficulty);
      expect(d.filter((x) => x >= 4).length).toBeLessThanOrEqual(2);
      for (let i = 0; i < d.length - 1; i++) if (d[i]! >= 4) expect(d[i + 1]!).toBeLessThanOrEqual(3);
    }
  });

  it('keeps every segment between breath buoys inside MAX_SEGMENT_S (§3.1, §11.7.13)', () => {
    for (const sequence of Z2_SEQUENCES) {
      const times = sequence.map((id) => chunkOf(id).targetTimeS);
      const first = times.slice(0, t.BOYA_AFTER_CHUNK).reduce((a, b) => a + b, 0);
      const second = times.slice(t.BOYA_AFTER_CHUNK).reduce((a, b) => a + b, 0);
      expect(first).toBeLessThanOrEqual(t.MAX_SEGMENT_S);
      expect(second).toBeLessThanOrEqual(t.MAX_SEGMENT_S);
    }
  });

  it('isolates the first two appearances of every new catalogue entry, the current included (§11.5.5)', () => {
    const seen = new Map<number, number>();
    const isolated = new Map<number, string[]>();
    for (const id of Z2_SEQUENCES.flat()) {
      const chunk = chunkOf(id);
      const entries = chunk.entities.flatMap((e) => {
        if (e.type === 'hazard') return [e.catalogId];
        if ((e.type === 'ceiling' || e.type === 'forcefield') && e.catalogId !== undefined) return [e.catalogId];
        return [];
      });
      for (const catalogId of new Set(entries)) {
        const before = seen.get(catalogId) ?? 0;
        if (before < 2) {
          expect(entries, `${id}: appearance ${before + 1} of ${catalogId} is not alone`).toHaveLength(1);
          isolated.set(catalogId, [...(isolated.get(catalogId) ?? []), id]);
        }
        seen.set(catalogId, before + entries.filter((x) => x === catalogId).length);
      }
    }
    expect(isolated.get(8)).toEqual(['z2-tut-corriente', 'z2-lib-a']);
    expect(isolated.get(6)).toEqual(['z2-lib-b', 'z2-lib-c']);
    expect(isolated.get(7)).toEqual(['z2-lib-e', 'z2-lib-f']);
    expect(isolated.get(9)).toEqual(['z2-lib-h', 'z2-lib-i']);
  });

  it('alternates sides at every rung and every seam: a landing is always an underside (§2.3)', () => {
    const ordered = Z2_SEQUENCES.flat().map(chunkOf);
    const rungs: Array<{ chunk: string; x: number }> = [];
    for (const chunk of ordered) {
      const anchors = of<Anchor>(chunk, 'anchor').sort((a, b) => a.pos.y - b.pos.y);
      for (const a of anchors) rungs.push({ chunk: chunk.id, x: a.pos.x });
    }
    for (let i = 0; i < rungs.length - 1; i++) {
      const a = rungs[i]!;
      const b = rungs[i + 1]!;
      expect(sideOf(a.x), `${a.chunk} x=${a.x} -> ${b.chunk} x=${b.x}`).not.toBe(sideOf(b.x));
    }
  });

  it('validates each immersion on its own, threading the isolation counter (§11.5.5)', () => {
    const appearances = new Map<number, number>();
    for (const sequence of [...Z1_SEQUENCES, ...Z2_SEQUENCES]) {
      expect(describeIssues(validateSequence(library, sequence, t, appearances))).toEqual([]);
    }
  });
});

describe('what the zone teaches, flown with the real integrator (§3.3.3, §4.2, §5)', () => {
  /** The chunk placed on its own, plus the world's side walls: what a probe shot inside it can meet. */
  function geometryOf(chunk: Chunk): { solids: SolidEntity[]; fields: ForceField[]; anchors: Anchor[]; hazards: Hazard[] } {
    const entities = instantiateChunk({ chunk, index: 0, worldY: 0, immersionIndex: 0 });
    return {
      solids: [
        ...entities.filter((e): e is SolidEntity => e.type === 'ceiling' || e.type === 'wall'),
        ...sideWalls(-t.CHUNK_H, t.CHUNK_H * 2, t),
      ],
      fields: entities.filter((e): e is ForceField => e.type === 'forcefield'),
      anchors: entities.filter((e): e is Anchor => e.type === 'anchor').sort((a, b) => a.pos.y - b.pos.y),
      hazards: entities.filter((e): e is Hazard => e.type === 'hazard'),
    };
  }

  const key = (l: { power: number; thetaDeg: number }): string => `${l.power}/${l.thetaDeg}`;

  it('the tutorial current is not decoration: it changes WHICH shot lands (§3.3.3, §5 nº 8)', () => {
    // A band is water moving at CURRENT_DRIFT and Bur joins it through the normal horizontal drag, whose
    // time constant is 1 / DAMPING_X ≈ 3,3 s: over one hop that is ~25 px, so no band can ever be a wall.
    // What the tutorial's chute CAN do, and does, is make the still-water aim the wrong aim.
    const geo = geometryOf(Z2_TUTORIAL);
    const from = geo.anchors[1]!;
    const to = geo.anchors[2]!;
    const withCurrent = findLandingLines(from.pos, to.pos, Z2, geo.solids, t, to.ceilingId, geo.fields);
    const stillWater = findLandingLines(from.pos, to.pos, Z2, geo.solids, t, to.ceilingId, []);

    expect(withCurrent.length).toBeGreaterThanOrEqual(4);
    const shared = withCurrent.filter((l) => stillWater.some((o) => key(o) === key(l)));
    expect(shared.length, 'aim as if the water were still and you miss').toBeLessThanOrEqual(1);
    // And reading it is cheaper than fighting it (§5 nº 8: "cabalgarla para alargar el tiro gratis").
    const cheapest = (lines: typeof withCurrent): number => Math.min(...lines.map((l) => l.power));
    expect(cheapest(withCurrent)).toBeLessThanOrEqual(cheapest(stillWater));
  });

  it('puts a hazard on a line that would otherwise have worked, in every immersion (§4.2)', () => {
    // The first version of this zone had 0 of ~900 certified landing lines touching a hazard box: every
    // crown sat on a shoulder no successful arc ever visits, so nothing the zone added made a single hop
    // harder than the same hop in Zone 1. A crown on a lip is met by the line that cuts the corner —
    // and, just as importantly, NOT by all of them: there is always a clean way in.
    for (const sequence of Z2_SEQUENCES) {
      let contested = 0;
      for (const id of sequence) {
        const chunk = chunkOf(id);
        if (of<Hazard>(chunk, 'hazard').length === 0) continue;
        const geo = geometryOf(chunk);
        for (let i = 0; i < geo.anchors.length - 1; i++) {
          const a = geo.anchors[i]!;
          const b = geo.anchors[i + 1]!;
          if (a.ceilingId === b.ceilingId) continue;
          const lines = findLandingLines(a.pos, b.pos, Z2, geo.solids, t, b.ceilingId, geo.fields, geo.hazards);
          const onLine = lines.filter((l) => l.touchesHazard).length;
          if (onLine > 0) contested++;
          expect(onLine, `${id}: ${a.id} -> ${b.id} has no clean line left`).toBeLessThan(lines.length);
        }
      }
      expect(contested, `no hazard in ${sequence.join(', ')} sits on a landing line`).toBeGreaterThan(0);
    }
  });

  it('rejects the crown that shipped: an anemone against a wall has no escape (§2.4.5, §5 nº 7)', () => {
    // The exact geometry a review found lethal: the crown on the SHOULDER of a 36 px rung hard against
    // the right wall. The vent frees Bur a few px above it, the escape is a downward launch, and the
    // anemone is what is below her. `validateChunk` now says so.
    const wallCrown: Chunk = {
      ...Z2_LIB_E,
      id: 'fixture-wall-anemone',
      entities: [
        ...Z2_LIB_E.entities.filter((e) => e.type !== 'hazard'),
        anemona('fixture-anemona', 158, 108),
      ],
    };
    const issues = validateChunk(wallCrown, t);
    expect(issues.filter((i) => i.rule === 'trap').length).toBe(1);
    // ...while the crown the zone actually ships passes.
    expect(validateChunk(Z2_LIB_E, t).filter((i) => i.rule === 'trap')).toEqual([]);
  });

  it('rejects a force field that pushes up outside catalogId 20/21 (§11.7.9)', () => {
    const upward: Chunk = {
      ...Z2_LIB_A,
      id: 'fixture-upward-field',
      entities: [
        ...Z2_LIB_A.entities.filter((e) => e.type !== 'forcefield'),
        { ...currentBand('fixture-band', 0, 52, 120, 38, -1), vector: { x: 0, y: -27 } },
      ],
    };
    expect(validateChunk(upward, t).filter((i) => i.rule === 'pushDir').length).toBe(1);
  });
});

describe('the MVP campaign (Z1 + Z2)', () => {
  it('validates with zero errors and zero warnings, Z1 -> Z2 seam included (§11.5, §11.7.7)', () => {
    expect(describeIssues(validateCampaign(library, MVP_SEQUENCES, t))).toEqual([]);
  });

  it('never requires more than an 80 % charge anywhere in Zone 2 (§2.2)', () => {
    const capped = createTuning({ IMPULSE_MAX: t.IMPULSE_MIN + 0.8 * (t.IMPULSE_MAX - t.IMPULSE_MIN) });
    expect(errors(validateCampaign(library, MVP_SEQUENCES, capped))).toEqual([]);
  });

  it('is one continuous column whose chunk zones agree with the §11.1 depth table', () => {
    const campaign = buildCampaign(library, MVP_SEQUENCES, DEFAULT_TUNING);
    expect(campaign.placed).toHaveLength(30);
    expect(campaign.bottomY).toBe(7200); // exactly the end of "Borde de arrecife" (§11.1)
    for (const placed of campaign.placed) {
      expect(zoneAt(placed.worldY).index, placed.chunk.id).toBe(placed.chunk.zone);
    }
  });

  it('turns the last station of Zone 1 into the Z2 transition and the last of Z2 into a delivery (§3.3)', () => {
    const campaign = buildCampaign(library, MVP_SEQUENCES, DEFAULT_TUNING);
    const { stations } = campaignMarkers(campaign, DEFAULT_TUNING);
    expect(stations).toHaveLength(5);

    const toZ2 = stations[1]!;
    expect(toZ2.zoneFrom).toBe(0);
    expect(toZ2.zoneTo).toBe(1);
    expect(toZ2.isDelivery).toBe(true); // last station of Zone 1
    // §11.7.12: capacity moves only in a station, and Z1 -> Z2 does not move it at all (8 -> 8).
    expect(DEFAULT_TUNING.ZONE_AIR_MAX[toZ2.zoneFrom]).toBe(DEFAULT_TUNING.ZONE_AIR_MAX[toZ2.zoneTo]);

    expect(stations[2]!.zoneTo).toBe(1);
    expect(stations[2]!.isDelivery).toBe(false);
    expect(stations[3]!.isDelivery).toBe(false);
    expect(stations[4]!.isDelivery).toBe(true); // z2-station-3 closes the zone and the campaign
  });

  it('shrinks Bur to the Zone 2 radius of §2.6 and nothing else', () => {
    expect(zoneRadius(Z2, DEFAULT_TUNING)).toBeCloseTo(6.44, 10);
    expect(DEFAULT_TUNING.MAX_HOP_PX[Z2]).toBe(195);
  });
});
