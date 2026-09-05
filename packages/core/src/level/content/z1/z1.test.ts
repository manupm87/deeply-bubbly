import { describe, expect, it } from 'vitest';
import { solidRectAt } from '../../../physics/collision';
import { createTuning } from '../../../tuning';
import { buildCampaign } from '../../campaign';
import { ChunkLibrary } from '../../library';
import { validateCampaign, validateChunk, validateSequence } from '../../validator';
import { Z1_BOSS, Z1_CHUNKS, Z1_SEQUENCES, Z1_STATION_1, Z1_STATION_2 } from './index';
import type { ValidationIssue } from '../../validator';
import type { Anchor, Ceiling, Chunk, Hazard, Pickup, WorldEntity } from '../../../types';

const t = createTuning();
const library = new ChunkLibrary([...Z1_CHUNKS]);

const errors = (issues: readonly ValidationIssue[]): ValidationIssue[] => issues.filter((i) => i.severity === 'error');
const describeIssues = (issues: readonly ValidationIssue[]): string[] =>
  issues.map((i) => `${i.severity} [${i.rule}] ${i.chunkId ?? '-'}: ${i.message}`);

const entitiesOf = <T extends WorldEntity>(type: T['type']): T[] =>
  Z1_CHUNKS.flatMap((c) => c.entities.filter((e): e is T => e.type === type));

describe('Zone 1 content', () => {
  it('holds exactly the pieces §12.1 asks for', () => {
    const ids = Z1_CHUNKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'z1-open-1',
        'z1-open-2',
        'z1-open-3',
        'z1-lib-a',
        'z1-lib-b',
        'z1-lib-c',
        'z1-lib-d',
        'z1-lib-e',
        'z1-lib-f',
        'z1-boss',
        'z1-station-1',
        'z1-station-2',
      ]),
    );
    expect(Z1_CHUNKS.filter((c) => c.role === 'opening')).toHaveLength(3);
    expect(Z1_CHUNKS.filter((c) => c.role === 'station')).toHaveLength(2);
    expect(Z1_CHUNKS.filter((c) => c.role === 'boss')).toHaveLength(1);
    expect(Z1_CHUNKS.every((c) => c.zone === 0)).toBe(true);
  });

  it('gives the H3 selector a chunk of every difficulty (§4.1 histogram)', () => {
    const libraryChunks = Z1_CHUNKS.filter((c) => c.id.startsWith('z1-lib-'));
    expect(libraryChunks).toHaveLength(6);
    expect(new Set(libraryChunks.map((c) => c.difficulty))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('keeps every chunk inside the 12 s authoring budget', () => {
    for (const chunk of Z1_CHUNKS) {
      expect(chunk.targetTimeS, chunk.id).toBeGreaterThan(0);
      expect(chunk.targetTimeS, chunk.id).toBeLessThanOrEqual(12);
    }
  });

  it('passes validateChunk with no errors', () => {
    for (const chunk of Z1_CHUNKS) {
      expect(describeIssues(errors(validateChunk(chunk, t))), chunk.id).toEqual([]);
    }
  });

  it('passes validateChunk with no warnings either (airBudget matches the air actually placed)', () => {
    for (const chunk of Z1_CHUNKS) {
      expect(describeIssues(validateChunk(chunk, t)), chunk.id).toEqual([]);
    }
  });

  it('gives every playable chunk one or two air pockets (§2.5)', () => {
    for (const chunk of Z1_CHUNKS) {
      if (chunk.role === 'station') continue;
      const air = chunk.entities.filter((e): e is Pickup => e.type === 'pickup' && e.pickupType === 'aire');
      expect(air.length, chunk.id).toBeGreaterThanOrEqual(1);
      expect(air.length, chunk.id).toBeLessThanOrEqual(2);
      expect(chunk.airBudget, chunk.id).toBe(air.length);
    }
  });
});

describe('Z1_SEQUENCES', () => {
  it('is two immersions of IMMERSION_CHUNKS ids, each closed by a station (§11.1, §3.1)', () => {
    expect(Z1_SEQUENCES).toHaveLength(2);
    for (const sequence of Z1_SEQUENCES) {
      expect(sequence).toHaveLength(t.IMMERSION_CHUNKS);
      for (const id of sequence) expect(library.has(id)).toBe(true);
      const last = sequence[sequence.length - 1];
      expect(last !== undefined && library.get(last).role).toBe('station');
    }
    expect(Z1_SEQUENCES[0]?.[5]).toBe(Z1_STATION_1.id);
    expect(Z1_SEQUENCES[1]?.[5]).toBe(Z1_STATION_2.id);
    expect(Z1_SEQUENCES[1]).toContain(Z1_BOSS.id);
  });

  it('uses every authored chunk exactly once', () => {
    const used = Z1_SEQUENCES.flatMap((s) => [...s]);
    expect(used).toHaveLength(Z1_CHUNKS.length);
    expect(new Set(used).size).toBe(Z1_CHUNKS.length);
  });

  it('validates with zero errors as a campaign (§11.5, §11.7.7)', () => {
    expect(describeIssues(validateCampaign(library, Z1_SEQUENCES, t))).toEqual([]);
  });

  it('never requires more than an 80 % charge: the 362 px full shot is always headroom (§2.2)', () => {
    // Capping IMPULSE_MAX so that a full hold delivers exactly what p = 0.8 delivers today re-runs the
    // whole reach search with the top fifth of the charge curve amputated. Still clean = never required.
    const capped = createTuning({ IMPULSE_MAX: t.IMPULSE_MIN + 0.8 * (t.IMPULSE_MAX - t.IMPULSE_MIN) });
    expect(describeIssues(validateCampaign(library, Z1_SEQUENCES, capped))).toEqual([]);
  });

  it('validates each immersion on its own too', () => {
    // §11.5.5 counts a catalogId's appearances over the WHOLE game ("en toda la partida"), so the
    // counter is threaded from one immersion to the next exactly as `validateCampaign` threads it.
    const appearances = new Map<number, number>();
    for (const sequence of Z1_SEQUENCES) {
      expect(describeIssues(validateSequence(library, sequence, t, appearances))).toEqual([]);
    }
  });

  it('gives each Zone 1 creature its first two chunks to itself (§11.5.5)', () => {
    const seen = new Map<number, number>();
    for (const id of Z1_SEQUENCES.flatMap((s) => [...s])) {
      const chunk = library.get(id);
      const catalogued = chunk.entities.filter(
        (e) => e.type === 'hazard' || (e.type === 'ceiling' && e.catalogId !== undefined),
      );
      const ids = new Set(
        catalogued.map((e) => (e.type === 'hazard' ? e.catalogId : e.type === 'ceiling' ? e.catalogId : undefined)),
      );
      for (const catalogId of ids) {
        if (catalogId === undefined) continue;
        const before = seen.get(catalogId) ?? 0;
        if (before < 2) expect(catalogued.length, `${id} / catalogId ${catalogId}`).toBe(1);
      }
      for (const e of catalogued) {
        const catalogId = e.type === 'hazard' ? e.catalogId : e.type === 'ceiling' ? e.catalogId : undefined;
        if (catalogId !== undefined) seen.set(catalogId, (seen.get(catalogId) ?? 0) + 1);
      }
    }
    // Medusa (1), alga (2), tortuga (3) and Don Hinchón (5) all show up: the rule is not vacuous here.
    expect([...seen.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 5]);
  });

  it('respects the breathing rule (§11.5.4)', () => {
    for (const sequence of Z1_SEQUENCES) {
      const difficulties = sequence.map((id) => library.get(id).difficulty);
      expect(difficulties.filter((d) => d >= 4).length).toBeLessThanOrEqual(2);
      for (let i = 0; i < difficulties.length - 1; i++) {
        const current = difficulties[i];
        const next = difficulties[i + 1];
        if (current !== undefined && current >= 4 && next !== undefined) expect(next).toBeLessThanOrEqual(3);
      }
    }
  });

  it('keeps every boya segment inside MAX_SEGMENT_S (§11.7.13)', () => {
    for (const sequence of Z1_SEQUENCES) {
      const times = sequence.map((id) => library.get(id).targetTimeS);
      const beforeBoya = times.slice(0, t.BOYA_AFTER_CHUNK).reduce((a, b) => a + b, 0);
      const afterBoya = times.slice(t.BOYA_AFTER_CHUNK).reduce((a, b) => a + b, 0);
      expect(beforeBoya).toBeLessThanOrEqual(t.MAX_SEGMENT_S);
      expect(afterBoya).toBeLessThanOrEqual(t.MAX_SEGMENT_S);
    }
  });

  it('builds a campaign whose boyas and stations land where §3.1 puts them', () => {
    const campaign = buildCampaign(library, Z1_SEQUENCES, t);
    expect(campaign.placed).toHaveLength(12);
    expect(campaign.bottomY).toBe(12 * t.CHUNK_H);
    for (const immersion of campaign.immersions) {
      expect(immersion.boyaY).toBe(immersion.startY + t.BOYA_AFTER_CHUNK * t.CHUNK_H);
      expect(immersion.stationY).toBe(immersion.startY + 5 * t.CHUNK_H);
    }
  });
});

describe('Zone 1 catalogue invariants (§11.7.9, §5)', () => {
  const hazards = entitiesOf<Hazard>('hazard');

  it("has no Hazard with pushDir 'up' outside catalogId 20 and 21", () => {
    for (const h of hazards) {
      if (h.pushDir === 'up') expect([20, 21], h.id).toContain(h.catalogId);
    }
    expect(hazards.some((h) => h.pushDir === 'up')).toBe(false);
  });

  it('never costs more than 1 Air per contact', () => {
    for (const h of hazards) expect(h.airCost, h.id).toBe(1);
  });

  it('keeps every hazard inside the §5 catalogue range', () => {
    for (const h of hazards) {
      expect(h.catalogId, h.id).toBeGreaterThanOrEqual(1);
      expect(h.catalogId, h.id).toBeLessThanOrEqual(25);
    }
  });

  it('puts Don Hinchón alone in the boss chunk, resolved by passing (§5 nº 5)', () => {
    expect(hazards).toHaveLength(1);
    const boss = hazards[0];
    expect(boss?.catalogId).toBe(5);
    expect(boss?.periodMs).toBe(3000);
    expect(boss?.activeFraction).toBeCloseTo(0.6, 5);
    expect(boss?.pushImpulse).toBe(200);
    expect(boss?.pushDir).toBe('lateral');
    expect(Z1_BOSS.entities.filter((e) => e.type === 'hazard')).toHaveLength(1);
  });

  it('models the Medusa Farolillo as a non-capturable jelly ceiling that deflates (§5 nº 1)', () => {
    const medusas = entitiesOf<Ceiling>('ceiling').filter((c) => c.material === 'jelly');
    expect(medusas.length).toBeGreaterThan(0);
    for (const m of medusas) {
      expect(m.capturable, m.id).toBe(false);
      expect(m.restitution, m.id).toBe(t.RESTITUTION_JELLY);
      expect(m.bounceCooldownMs, m.id).toBe(t.BOUNCE_COOLDOWN_MS);
    }
  });

  it('hangs every Medusa Farolillo on the line Bur flies, so she meets it from BELOW (§5 nº 1)', () => {
    // §5: "se coloca siempre como cara inferior, de modo que Bur la golpea subiendo y sale disparada
    // hacia abajo". A jellyfish parked above the entry anchor is scenery; one sitting on the straight
    // line between the two anchors of a hop, at the depth of the landing, is the lesson.
    let checked = 0;
    for (const chunk of Z1_CHUNKS) {
      const anchors = chunk.entities.filter((e): e is Anchor => e.type === 'anchor').sort((x, y) => x.pos.y - y.pos.y);
      for (const jelly of chunk.entities.filter((e): e is Ceiling => e.type === 'ceiling' && e.material === 'jelly')) {
        const midY = jelly.rect.y + jelly.rect.h / 2;
        const above = [...anchors].reverse().find((a) => a.pos.y < jelly.rect.y);
        const below = anchors.find((a) => a.pos.y > jelly.rect.y + jelly.rect.h);
        expect(above, jelly.id).toBeDefined();
        expect(below, jelly.id).toBeDefined();
        if (above === undefined || below === undefined) continue;
        const u = (midY - above.pos.y) / (below.pos.y - above.pos.y);
        const onLine = above.pos.x + (below.pos.x - above.pos.x) * u;
        expect(onLine, `${chunk.id}/${jelly.id}`).toBeGreaterThanOrEqual(jelly.rect.x);
        expect(onLine, `${chunk.id}/${jelly.id}`).toBeLessThanOrEqual(jelly.rect.x + jelly.rect.w);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it('models the Alga Cinta as a soft posadero (§5 nº 2)', () => {
    const kelps = entitiesOf<Ceiling>('ceiling').filter((c) => c.material === 'kelp');
    expect(kelps.length).toBeGreaterThan(0);
    for (const k of kelps) {
      expect(k.capturable, k.id).toBe(true);
      expect(k.kind, k.id).toBe('posadero');
      expect(k.restitution, k.id).toBe(t.RESTITUTION_SOFT);
    }
  });

  it('models the Tortuga Paseante as a slow lateral moving ceiling (§5 nº 3)', () => {
    const turtles = entitiesOf<Ceiling>('ceiling').filter((c) => c.material === 'creature');
    expect(turtles.length).toBeGreaterThan(0);
    for (const turtle of turtles) {
      expect(turtle.moving?.axis, turtle.id).toBe('x');
      expect(turtle.moving?.speed, turtle.id).toBe(25);
      expect(turtle.capturable, turtle.id).toBe(true);
    }
  });

  it('leaves the stations free of hazards, with one wide shelf and a couple of pearls (§3.3)', () => {
    for (const station of [Z1_STATION_1, Z1_STATION_2]) {
      const ceilings = station.entities.filter((e): e is Ceiling => e.type === 'ceiling');
      const pearls = station.entities.filter((e): e is Pickup => e.type === 'pickup' && e.pickupType === 'perla');
      expect(station.entities.some((e) => e.type === 'hazard'), station.id).toBe(false);
      expect(ceilings, station.id).toHaveLength(1);
      expect(ceilings[0]?.capturable, station.id).toBe(true);
      expect(ceilings[0]?.rect.w, station.id).toBeGreaterThanOrEqual(80);
      expect(['foam', 'coral']).toContain(ceilings[0]?.material);
      expect(pearls, station.id).toHaveLength(2);
      expect(station.entryAnchorId, station.id).toBe(station.exitAnchorId);
    }
  });
});

describe('Zone 1 geometry', () => {
  it('keeps every ledge over the §2.3 minimum and mostly in the 24–60 px band', () => {
    const ceilings = entitiesOf<Ceiling>('ceiling');
    for (const c of ceilings) {
      expect(c.rect.w, c.id).toBeGreaterThanOrEqual(20);
      expect(c.rect.h, c.id).toBeGreaterThanOrEqual(8);
    }
    const inBand = ceilings.filter((c) => c.rect.w >= 24 && c.rect.w <= 60);
    expect(inBand.length / ceilings.length).toBeGreaterThan(0.7);
  });

  it('hangs every anchor exactly one Bur radius under a capturable ceiling', () => {
    const radius = t.RADIUS_BASE * (t.ZONE_RADIUS_PCT[0] ?? 1);
    for (const chunk of Z1_CHUNKS) {
      const ceilings = new Map(chunk.entities.filter((e): e is Ceiling => e.type === 'ceiling').map((c) => [c.id, c]));
      for (const a of chunk.entities.filter((e): e is Anchor => e.type === 'anchor')) {
        const ceiling = ceilings.get(a.ceilingId);
        expect(ceiling, a.id).toBeDefined();
        expect(ceiling?.capturable, a.id).toBe(true);
        expect(a.pos.y, a.id).toBeCloseTo((ceiling?.rect.y ?? 0) + (ceiling?.rect.h ?? 0) + radius, 6);
      }
    }
  });

  it('never asks for a hop over MAX_HOP_PX, seams included (§11.5.11)', () => {
    // §11.1 assembles the whole campaign as ONE continuous column, so the ladder does NOT restart at
    // each immersion: the seam from a station's anchor to the first anchor of the next immersion is a
    // hop like any other, and it is precisely the one a per-immersion walk cannot see.
    const maxHop = t.MAX_HOP_PX[0] ?? 200;
    const chunks: Chunk[] = Z1_SEQUENCES.flatMap((s) => [...s]).map((id) => library.get(id));
    let previousY: number | null = null;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk === undefined) continue;
      const anchors = chunk.entities.filter((e): e is Anchor => e.type === 'anchor').sort((a, b) => a.pos.y - b.pos.y);
      for (const a of anchors) {
        const worldY = i * t.CHUNK_H + a.pos.y;
        if (previousY !== null) expect(worldY - previousY, `${chunk.id}/${a.id}`).toBeLessThanOrEqual(maxHop);
        previousY = worldY;
      }
    }
  });

  it('keeps every moving ceiling under its own Anchor for the whole walk (§11.2, §5 nº 3)', () => {
    for (const chunk of Z1_CHUNKS) {
      const ceilings = new Map(chunk.entities.filter((e): e is Ceiling => e.type === 'ceiling').map((c) => [c.id, c]));
      for (const a of chunk.entities.filter((e): e is Anchor => e.type === 'anchor')) {
        const ceiling = ceilings.get(a.ceilingId);
        const moving = ceiling?.moving;
        if (ceiling === undefined || moving === undefined) continue;
        const periodMs = ((2 * moving.range) / moving.speed) * 1000;
        for (let k = 0; k < 128; k++) {
          const rect = solidRectAt(ceiling, (k / 128) * periodMs);
          expect(a.pos.x, `${chunk.id}/${a.id} at phase ${k}/128`).toBeGreaterThanOrEqual(rect.x);
          expect(a.pos.x, `${chunk.id}/${a.id} at phase ${k}/128`).toBeLessThanOrEqual(rect.x + rect.w);
        }
      }
    }
  });
});
