import { describe, expect, it } from 'vitest';
import { launchVelocity } from '../control/aim';
import { impulseMagnitude } from '../control/charge';
import { degToRad } from '../math/vec';
import { launchLockSteps, physicsStep } from '../physics/step';
import { createTuning } from '../tuning';
import { ChunkLibrary } from './library';
import {
  REACH_MAX_SECONDS,
  REACH_POWERS,
  findReachTrajectory,
  reachTolerance,
  restPoseY,
  sideWalls,
  validateCampaign,
  validateChunk,
  validateJunction,
  validateSequence,
} from './validator';
import type { ValidationIssue } from './validator';
import type { Anchor, Ceiling, Chunk, Contact, Hazard, SolidEntity, WorldEntity } from '../types';

const t = createTuning();

const RADIUS = t.RADIUS_BASE * (t.ZONE_RADIUS_PCT[0] ?? 1);

const errors = (issues: readonly ValidationIssue[]): ValidationIssue[] => issues.filter((i) => i.severity === 'error');
const rules = (issues: readonly ValidationIssue[]): string[] => errors(issues).map((i) => i.rule);
const messages = (issues: readonly ValidationIssue[]): string[] => errors(issues).map((i) => i.message);

// ---------------------------------------------------------------------------------------------
// Fixtures. The skeleton is the wide zigzag Zone 1 is actually built from — four ledges alternating
// sides, entry top-left, exit bottom-centre — so a sequence of these chunks is reach-clean and every
// failure a test provokes is the one it provoked.
// ---------------------------------------------------------------------------------------------

function ledge(id: string, x: number, y: number, w: number): Ceiling {
  return {
    type: 'ceiling',
    id,
    rect: { x, y, w, h: 10 },
    kind: 'posadero',
    capturable: true,
    restitution: t.RESTITUTION_ROCK,
    material: 'rock',
  };
}

function anchorOn(id: string, ceilingId: string, x: number, ledgeY: number): Anchor {
  return { type: 'anchor', id, ceilingId, pos: { x, y: ledgeY + 10 + RADIUS } };
}

function skeleton(): WorldEntity[] {
  return [
    ledge('c1', 3, 18, 36),
    anchorOn('a-in', 'c1', 30, 18),
    ledge('c2', 141, 78, 36),
    anchorOn('a-m1', 'c2', 150, 78),
    ledge('c3', 5, 133, 40),
    anchorOn('a-m2', 'c3', 36, 133),
    ledge('c4', 101, 188, 48),
    anchorOn('a-out', 'c4', 110, 188),
  ];
}

/** The entity of a chunk with that id, typed by the caller. Throws rather than returning undefined. */
function entity<T extends WorldEntity>(chunk: Chunk, id: string): T {
  const found = chunk.entities.find((e) => e.id === id);
  if (found === undefined) throw new Error(`fixture has no entity '${id}'`);
  return found as T;
}

interface ChunkOverrides {
  difficulty?: Chunk['difficulty'];
  role?: Chunk['role'];
  targetTimeS?: number;
  airBudget?: number;
  extra?: WorldEntity[];
}

function makeChunk(id: string, o: ChunkOverrides = {}): Chunk {
  return {
    id,
    zone: 0,
    difficulty: o.difficulty ?? 1,
    verbs: ['reposar'],
    entryAnchorId: 'a-in',
    exitAnchorId: 'a-out',
    airBudget: o.airBudget ?? 0,
    targetTimeS: o.targetTimeS ?? 8,
    tags: ['test'],
    role: o.role ?? 'playable',
    entities: [...skeleton(), ...(o.extra ?? [])],
  };
}

function hazard(id: string, catalogId: number, over: Partial<Hazard> = {}): Hazard {
  return {
    type: 'hazard',
    id,
    catalogId,
    shape: { x: 70, y: 100, w: 30, h: 30 },
    airCost: 1,
    pushDir: 'lateral',
    ...over,
  };
}

const SEQ = ['s1', 's2', 's3', 's4', 's5', 's6'];

function makeSequence(overrides: Record<string, ChunkOverrides> = {}): ChunkLibrary {
  return new ChunkLibrary(
    SEQ.map((id) => makeChunk(id, overrides[id] ?? (id === 's6' ? { role: 'station' } : {}))),
  );
}

// ---------------------------------------------------------------------------------------------

describe('validateChunk', () => {
  it('accepts a well-formed chunk', () => {
    expect(errors(validateChunk(makeChunk('ok'), t))).toEqual([]);
  });

  it('rejects ledges under the §2.3 minimum size', () => {
    const chunk = makeChunk('thin');
    entity<Ceiling>(chunk, 'c1').rect = { x: 20, y: 18, w: 12, h: 4 };
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('12 px wide'))).toBe(true);
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('4 px thick'))).toBe(true);
  });

  it('rejects an anchor that hangs from a non-capturable ceiling (§2.3: no rest there)', () => {
    const chunk = makeChunk('jelly');
    entity<Ceiling>(chunk, 'c1').capturable = false;
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('non-capturable'))).toBe(true);
  });

  it('rejects an anchor that is not exactly one Bur radius under its ceiling', () => {
    const chunk = makeChunk('float');
    entity<Anchor>(chunk, 'a-in').pos.y += 12;
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('centre at y='))).toBe(true);
  });

  it('rejects an anchor placed off the side of its ceiling', () => {
    const chunk = makeChunk('offshelf');
    entity<Anchor>(chunk, 'a-in').pos.x = 90;
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('is not under ceiling'))).toBe(true);
  });

  it('accepts geometry anywhere in the 540 px world, not just the first screen (D3)', () => {
    // The far third of the column: legal since D3, impossible before it.
    const chunk = makeChunk('far-right');
    entity<Ceiling>(chunk, 'c1').rect = { x: 480, y: 18, w: 40, h: 10 };
    entity<Anchor>(chunk, 'a-in').pos.x = 500;
    expect(errors(validateChunk(chunk, t))).toEqual([]);
  });

  it('still rejects geometry that leaves the world on the right', () => {
    const chunk = makeChunk('overhang');
    entity<Ceiling>(chunk, 'c1').rect = { x: t.CHUNK_W - 10, y: 18, w: 40, h: 10 };
    entity<Anchor>(chunk, 'a-in').pos.x = t.CHUNK_W - 5;
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('leaves the'))).toBe(true);
  });

  it('accepts alternative exit anchors, and rejects one that is not an anchor of the chunk (D3)', () => {
    const ok: Chunk = { ...makeChunk('alts'), exitAnchorIds: ['a-out', 'a-m2'] };
    expect(errors(validateChunk(ok, t))).toEqual([]);

    const bogus: Chunk = { ...makeChunk('alts-bad'), exitAnchorIds: ['a-out', 'a-ghost'] };
    expect(messages(validateChunk(bogus, t)).some((m) => m.includes("exitAnchorIds lists 'a-ghost'"))).toBe(true);
  });

  it('rejects entry/exit anchor ids that do not exist', () => {
    const broken: Chunk = { ...makeChunk('missing'), entryAnchorId: 'nope' };
    expect(messages(validateChunk(broken, t)).some((m) => m.includes("'nope'"))).toBe(true);
  });

  it('rejects an entry anchor that is not the topmost one (the reach ladder starts there)', () => {
    const chunk = makeChunk('order');
    chunk.entities.push(ledge('c0', 60, 2, 40), anchorOn('a-top', 'c0', 80, 2));
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('topmost'))).toBe(true);
  });

  it('rejects an exit anchor that is not the bottommost one', () => {
    const chunk = makeChunk('order2');
    chunk.entities.push(ledge('c5', 60, 210, 40), anchorOn('a-low', 'c5', 80, 210));
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('bottommost'))).toBe(true);
  });

  it('rejects duplicate entity ids', () => {
    const chunk = makeChunk('dupe', { extra: [anchorOn('a-in', 'c1', 30, 18)] });
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('duplicate entity id'))).toBe(true);
  });

  it('rejects geometry that leaves the CHUNK_W x CHUNK_H chunk box, oscillation included', () => {
    const chunk = makeChunk('oob');
    entity<Ceiling>(chunk, 'c1').moving = { axis: 'x', speed: 25, range: 120 };
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('leaves the'))).toBe(true);
  });

  it("rejects pushDir 'up' outside catalogId 20 and 21 (§11.7.9)", () => {
    expect(rules(validateChunk(makeChunk('push', { extra: [hazard('h', 3, { pushDir: 'up' })] }), t))).toContain('pushDir');
    expect(rules(validateChunk(makeChunk('metano', { extra: [hazard('h', 20, { pushDir: 'up' })] }), t))).not.toContain('pushDir');
    expect(rules(validateChunk(makeChunk('fumarola', { extra: [hazard('h', 21, { pushDir: 'up' })] }), t))).not.toContain('pushDir');
  });

  it('rejects a hazard that costs more than one Air (§5)', () => {
    const chunk = makeChunk('greedy', { extra: [{ ...hazard('h', 6), airCost: 2 as unknown as 1 }] });
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('costs 2 air'))).toBe(true);
  });

  it('rejects hazards inside a station chunk (§3.3: 4 s without danger)', () => {
    const chunk = makeChunk('st', { role: 'station', extra: [hazard('h', 6)] });
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('station chunk carries'))).toBe(true);
  });

  it('warns (but does not fail) when airBudget disagrees with the air the chunk actually holds', () => {
    const issues = validateChunk(makeChunk('budget', { airBudget: 3 }), t);
    expect(errors(issues)).toEqual([]);
    expect(issues.some((i) => i.severity === 'warning' && i.rule === 'airBudget')).toBe(true);
  });

  it('counts air pickups towards airBudget', () => {
    const chunk = makeChunk('supplied', {
      airBudget: 1,
      extra: [{ type: 'pickup', id: 'air', pos: { x: 90, y: 120 }, pickupType: 'aire', value: 1, radius: 6 }],
    });
    expect(validateChunk(chunk, t).filter((i) => i.rule === 'airBudget')).toEqual([]);
  });
});

describe('validateSequence', () => {
  it('accepts a well-formed immersion', () => {
    expect(errors(validateSequence(makeSequence(), SEQ, t))).toEqual([]);
  });

  it('reports an unknown chunk id instead of throwing', () => {
    const issues = validateSequence(makeSequence(), ['s1', 'ghost', 's3', 's4', 's5', 's6'], t);
    expect(issues.some((i) => i.message.includes("unknown chunk id 'ghost'"))).toBe(true);
  });

  it('requires the last chunk to be the station and no other (§3.1)', () => {
    const library = makeSequence({ s6: {}, s3: { role: 'station' } });
    const found = messages(validateSequence(library, SEQ, t));
    expect(found.some((m) => m.includes("must have role 'station'"))).toBe(true);
    expect(found.some((m) => m.includes('only the last one may be'))).toBe(true);
  });

  it('enforces the breathing rule (§11.5.4)', () => {
    expect(rules(validateSequence(makeSequence({ s2: { difficulty: 4 }, s3: { difficulty: 4 } }), SEQ, t))).toContain('breathing');
    expect(rules(validateSequence(makeSequence({ s2: { difficulty: 4 }, s4: { difficulty: 5 } }), SEQ, t))).not.toContain('breathing');

    const tooMany = makeSequence({ s1: { difficulty: 4 }, s3: { difficulty: 4 }, s5: { difficulty: 4 } });
    expect(messages(validateSequence(tooMany, SEQ, t)).some((m) => m.includes('3 chunks of difficulty >= 4'))).toBe(true);
  });

  it('enforces the didactic isolation rule over the first two appearances (§11.5.5)', () => {
    const crowded = makeSequence({
      s2: { extra: [hazard('h1', 6), hazard('h2', 7, { shape: { x: 20, y: 60, w: 20, h: 20 } })] },
    });
    expect(rules(validateSequence(crowded, SEQ, t))).toContain('isolation');
    expect(rules(validateSequence(makeSequence({ s2: { extra: [hazard('h1', 6)] } }), SEQ, t))).not.toContain('isolation');
  });

  it('lets a hazard share a chunk from its THIRD appearance on', () => {
    const library = makeSequence({
      s2: { extra: [hazard('h1', 6)] },
      s3: { extra: [hazard('h1', 6)] },
      s4: { extra: [hazard('h1', 6), hazard('h2', 9, { shape: { x: 20, y: 60, w: 20, h: 20 } })] },
    });
    // Catalog 9 is still on its first appearance and is NOT alone, so exactly one isolation error.
    const isolation = errors(validateSequence(library, SEQ, t)).filter((i) => i.rule === 'isolation');
    expect(isolation).toHaveLength(1);
    expect(isolation[0]?.message).toContain('catalogId 9');
  });

  it('carries hazard appearances across immersions through the shared map', () => {
    const library = makeSequence({ s2: { extra: [hazard('h1', 6)] } });
    const seen = new Map<number, number>([[6, 2]]);
    expect(rules(validateSequence(library, SEQ, t, seen))).not.toContain('isolation');
    expect(seen.get(6)).toBe(3);
  });

  it('enforces MAX_SEGMENT_S between breath buoys (§11.7.13)', () => {
    const library = makeSequence({ s1: { targetTimeS: 20 }, s2: { targetTimeS: 20 } });
    const issues = errors(validateSequence(library, SEQ, t)).filter((i) => i.rule === 'segmentTime');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('chunks 0..2');
  });

  it('rejects a sequence whose length is not IMMERSION_CHUNKS', () => {
    expect(messages(validateSequence(makeSequence(), ['s1', 's6'], t)).some((m) => m.includes('IMMERSION_CHUNKS'))).toBe(true);
  });
});

describe('reach rule (§11.5.11, §11.7.7)', () => {
  /** A two-anchor chunk: entry top-left, exit `gap` px lower at `exitX`. Only that pair is asserted on. */
  function twoStep(id: string, gap: number, exitX: number): Chunk {
    const bottomY = 18 + gap;
    const arriveFromLeft = exitX > 30;
    return {
      ...makeChunk(id),
      entities: [
        ledge('c1', 3, 18, 36),
        anchorOn('a-in', 'c1', 30, 18),
        ledge('c2', arriveFromLeft ? exitX - 9 : Math.max(0, exitX + 9 - 48), bottomY, 48),
        anchorOn('a-out', 'c2', exitX, bottomY),
      ],
    };
  }

  /** Reach issues for the pair inside the first chunk of the sequence (seams are a separate concern). */
  function inChunkReach(chunk: Chunk): ValidationIssue[] {
    const library = new ChunkLibrary([chunk, makeChunk('tail', { role: 'station' })]);
    return errors(validateSequence(library, [chunk.id, 'tail'], t)).filter(
      (i) => i.rule === 'reach' && i.message.startsWith("'0:a-in' -> '0:a-out'"),
    );
  }

  it('flags two anchors 300 px apart: past MAX_HOP_PX for Zone 1 (110 since D4)', () => {
    const issues = inChunkReach(twoStep('tall', 300, 110));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('vertical gap 300 px exceeds MAX_HOP_PX 110');
  });

  it('flags a lateral gap past MAX_HOP_X_PX even when the drop is legal (D4, 2D reach)', () => {
    // 60 px down — well inside MAX_HOP_PX — but 470 px sideways in a 540 px world. Before D3 no such
    // pair could be authored at all; now it can, and only the second half of the rule catches it.
    const issues = inChunkReach(twoStep('wide', 60, 500));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain(`lateral gap 470 px exceeds MAX_HOP_X_PX ${t.MAX_HOP_X_PX[0]}`);
  });

  it('reports the lateral gap INSTEAD of flying every doomed probe', () => {
    // The cheap box comes first: a pair outside it never reaches the ballistic search, so the author
    // gets the geometric reason and not "no shot in the ±90° cone".
    expect(inChunkReach(twoStep('wide2', 60, 500))[0]?.message).not.toContain('no shot in the');
  });

  it('is deterministic: the same chunk validated twice gives the same issues, in the same order', () => {
    // §11.7.14. The reach search flies hundreds of probe shots through the real integrator; nothing in
    // it may read a clock or an RNG, or a level would validate on one machine and fail on another.
    const chunk = twoStep('repeat', 300, 500);
    expect(inChunkReach(chunk)).toEqual(inChunkReach(chunk));
    const clean = twoStep('repeat-ok', 60, 110);
    expect(inChunkReach(clean)).toEqual(inChunkReach(clean));
  });

  it('accepts a wide hop that stays inside MAX_HOP_X_PX', () => {
    // 60 px down and 140 px across: a real Zone 1 traverse in the 540 px world, and a legal one.
    expect(inChunkReach(twoStep('reach-across', 60, 170))).toEqual([]);
  });

  it('flags a pair that is inside MAX_HOP_PX but ballistically impossible', () => {
    // 30 px straight below the source: the target ledge itself blocks every descent line into it.
    const issues = inChunkReach(twoStep('blocked', 30, 30));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain(`no shot in the ±${t.AIM_CONE_DEG}° cone`);
  });

  it('accepts a hop the ballistic search can actually fly', () => {
    expect(inChunkReach(twoStep('fine', 60, 110))).toEqual([]);
    expect(inChunkReach(twoStep('wide', 90, 150))).toEqual([]);
  });

  it('rejects a target anchor placed ABOVE the previous one (§2.1: never launch upward)', () => {
    const up = twoStep('up', 90, 110);
    entity<Ceiling>(up, 'c2').rect.y = 4;
    entity<Anchor>(up, 'a-out').pos.y = 4 + 10 + RADIUS;
    expect(inChunkReach(up)[0]?.message).toContain('ABOVE the previous one');
  });

  describe('findReachTrajectory', () => {
    const walls: SolidEntity[] = sideWalls(-200, 900, t);

    it('finds a line for a plausible zigzag hop and reports which shot flies it', () => {
      const from = { x: 30, y: 18 + 10 + RADIUS };
      const to = { x: 150, y: from.y + 60 };
      const solids = [...walls, ledge('src', 3, 18, 36), ledge('dst', 141, to.y - 10 - RADIUS, 36)];
      const found = findReachTrajectory(from, to, 0, solids, t);
      expect(found.ok).toBe(true);
      expect(found.bestDistance).toBeLessThanOrEqual(reachTolerance(0, t));
      expect(Math.abs(found.thetaDeg)).toBeLessThanOrEqual(t.AIM_CONE_DEG);
      expect(found.power).toBeGreaterThanOrEqual(REACH_POWERS[0] ?? 0);
      expect(found.power).toBeLessThanOrEqual(1);
    });

    it('fails, with a finite closest approach, when nothing in the cone gets there', () => {
      const from = { x: 30, y: 35 };
      const to = { x: 30, y: 35 + 380 };
      const solids = [...walls, ledge('src', 3, 18, 36), ledge('dst', 3, 398, 36)];
      const found = findReachTrajectory(from, to, 0, solids, t);
      expect(found.ok).toBe(false);
      expect(Number.isFinite(found.bestDistance)).toBe(true);
      expect(found.bestDistance).toBeGreaterThan(reachTolerance(0, t));
    });

    it('is deterministic: the same inputs give the same shot twice', () => {
      const from = { x: 30, y: 35 };
      const to = { x: 150, y: 95 };
      const solids = [...walls, ledge('src', 3, 18, 36), ledge('dst', 141, 78, 36)];
      expect(findReachTrajectory(from, to, 0, solids, t)).toEqual(findReachTrajectory(from, to, 0, solids, t));
    });

    it('puts the world walls outside the 180 px column, never inside it', () => {
      for (const wall of sideWalls(0, 240, t)) {
        expect(wall.rect.x + wall.rect.w <= 0 || wall.rect.x >= t.WORLD_W).toBe(true);
        expect(wall.restitution).toBe(t.RESTITUTION_ROCK);
      }
    });
  });
});

describe('validateCampaign', () => {
  const first = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];

  it('runs every sequence in order and shares the isolation counter', () => {
    const second = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
    const build = (ids: readonly string[]): Chunk[] =>
      ids.map((id) => makeChunk(id, id.endsWith('6') ? { role: 'station' } : { extra: [hazard(`${id}-h`, 6)] }));
    const library = new ChunkLibrary([...build(first), ...build(second)]);
    // Catalog 6 appears alone every time, so the isolation rule never fires...
    expect(errors(validateCampaign(library, [first, second], t)).filter((i) => i.rule === 'isolation')).toEqual([]);
  });

  it('fires the isolation rule on a first appearance that shares its chunk', () => {
    const crowded = new ChunkLibrary(
      first.map((id) =>
        makeChunk(
          id,
          id === 'a6'
            ? { role: 'station' }
            : id === 'a1'
              ? { extra: [hazard('x', 6), hazard('y', 7, { shape: { x: 20, y: 60, w: 20, h: 20 } })] }
              : {},
        ),
      ),
    );
    expect(rules(validateCampaign(crowded, [first], t))).toContain('isolation');
  });

  it('schema-validates each distinct chunk exactly once', () => {
    const broken = makeChunk('a1');
    entity<Ceiling>(broken, 'c1').rect.h = 2;
    const library = new ChunkLibrary([
      broken,
      ...first.slice(1).map((id) => makeChunk(id, id === 'a6' ? { role: 'station' } : {})),
    ]);
    expect(errors(validateCampaign(library, [first, first], t)).filter((i) => i.message.includes('px thick'))).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// §2.3 is the whole reach rule: a certificate names a LANDING, never a fly-by
// ---------------------------------------------------------------------------------------------

describe('a reach certificate describes a rest Bur can actually take (§2.3, §11.7.7)', () => {
  const walls: SolidEntity[] = sideWalls(-200, 900, t);
  const from = { x: 30, y: 18 + 10 + RADIUS };
  const to = { x: 150, y: 78 + 10 + RADIUS };

  it('refuses a target no capturable ceiling hangs over: proximity is not a rest', () => {
    // The same point, the same arcs — but nothing to hold on to. Arcs still fly within a pixel of it.
    const open = findReachTrajectory(from, to, 0, [...walls, ledge('src', 3, 18, 36)], t);
    expect(open.ok).toBe(false);
    expect(open.bestDistance).toBeLessThan(reachTolerance(0, t)); // it is REACHED, and still not a rest

    const withLedge = findReachTrajectory(from, to, 0, [...walls, ledge('src', 3, 18, 36), ledge('dst', 141, 78, 36)], t);
    expect(withLedge.ok).toBe(true);
  });

  it('refuses a trampoline ceiling (§2.3: only a capturable bottom face captures)', () => {
    const jelly: Ceiling = { ...ledge('dst', 141, 78, 36), capturable: false, restitution: t.RESTITUTION_JELLY };
    expect(findReachTrajectory(from, to, 0, [...walls, ledge('src', 3, 18, 36), jelly], t).ok).toBe(false);
  });

  it('lands the shot it certifies on the bottom face of the target, moving up and slowly enough', () => {
    const solids = [...walls, ledge('src', 3, 18, 36), ledge('dst', 141, 78, 36)];
    const found = findReachTrajectory(from, to, 0, solids, t);
    expect(found.ok).toBe(true);

    // Replay the certified shot with the same fixed step and the same horizon the search flies.
    const speed = impulseMagnitude({ power: found.power, radius: RADIUS, stunned: false, externalMul: 1 }, t);
    const lockSteps = launchLockSteps(t);
    let pos = { ...from };
    let vel = launchVelocity(degToRad(found.thetaDeg), speed);
    let contact: Contact | null = null;
    let step = -1;
    for (let i = 0; i < Math.ceil(REACH_MAX_SECONDS / t.FIXED_DT); i++) {
      const launched = i < lockSteps;
      const stepped = physicsStep(
        { pos, vel, radius: RADIUS, state: launched ? 'LAUNCHED' : 'IDLE' },
        { solids, fields: [] },
        {
          dt: t.FIXED_DT,
          timeMs: i * t.FIXED_DT * 1000,
          lateralFriction: t.LATERAL_FRICTION,
          dampingMul: launched ? t.LAUNCH_DAMPING_MUL : 1,
          maxIterations: 1,
        },
        t,
      );
      pos = stepped.pos;
      vel = stepped.vel;
      const first = stepped.contacts[0];
      if (first !== undefined) {
        contact = first;
        step = i;
        break;
      }
    }

    expect(contact?.bodyId).toBe('dst');
    expect(contact?.face).toBe('bottom');
    expect(contact?.approachSpeed ?? 0).toBeGreaterThan(0); // moving UP at the touch
    expect(contact?.approachSpeed ?? Infinity).toBeLessThanOrEqual(t.REST_CAPTURE_SPEED);
    expect(step).toBeGreaterThanOrEqual(lockSteps); // §11.3 ignores rest inside the launch lock
    expect(Math.hypot(pos.x - to.x, pos.y - to.y)).toBeLessThanOrEqual(reachTolerance(0, t));
  });

  it('probes every pull the slingshot can fire, from the cancel radius to a full commit (D2, D4)', () => {
    // Below PULL_CANCEL_PX / PULL_MAX_PX there is no shot at all, so that ratio is the honest floor.
    const floor = t.PULL_CANCEL_PX / t.PULL_MAX_PX;
    expect(REACH_POWERS[0] ?? 1).toBeGreaterThanOrEqual(floor);
    expect(REACH_POWERS[0] ?? 1).toBe(0.2);
    expect(REACH_POWERS[REACH_POWERS.length - 1]).toBe(1);
    expect(REACH_POWERS).toHaveLength(9); // 0,2 .. 1,0 in tenths
  });
});

describe('restPoseY / reachTolerance', () => {
  it('puts Bur exactly one radius under the bottom face (§2.3)', () => {
    expect(restPoseY({ x: 0, y: 100, w: 40, h: 10 }, RADIUS)).toBe(117);
  });

  it('sizes the landing window as radius + REACH_TOLERANCE_PX', () => {
    expect(reachTolerance(0, t)).toBeCloseTo(RADIUS + 6, 6);
    expect(reachTolerance(5, t)).toBeLessThan(reachTolerance(0, t)); // Bur shrinks with pressure (§2.6)
  });
});

// ---------------------------------------------------------------------------------------------
// §11.2: an Anchor is a rest pose, so a moving ceiling has to carry it for the whole travel
// ---------------------------------------------------------------------------------------------

describe('anchors under moving ceilings (§11.2, §5 nº 3)', () => {
  const walker = (range: number, anchorX: number): Chunk => {
    const chunk = makeChunk('walker');
    entity<Ceiling>(chunk, 'c1').rect = { x: 52, y: 18, w: 76, h: 10 };
    entity<Ceiling>(chunk, 'c1').moving = { axis: 'x', speed: 25, range };
    const anchor = entity<Anchor>(chunk, 'a-in');
    anchor.pos.x = anchorX;
    return chunk;
  };

  it('accepts an anchor at the centre of a shell wider than its own walk', () => {
    expect(messages(validateChunk(walker(60, 90), t)).filter((m) => m.includes('a-in'))).toEqual([]);
  });

  it('rejects an anchor the shell slides out from under', () => {
    // Base span [52, 128]; at the left end of a ±30 px walk it is [22, 98], and x = 120 is open water.
    expect(messages(validateChunk(walker(60, 120), t)).some((m) => m.includes('somewhere in its travel'))).toBe(true);
  });

  it('rejects a ceiling that oscillates on y: its rest pose is not a point at all', () => {
    const chunk = makeChunk('lift');
    entity<Ceiling>(chunk, 'c1').moving = { axis: 'y', speed: 20, range: 16 };
    expect(messages(validateChunk(chunk, t)).some((m) => m.includes('oscillates on y'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// §11.5.5 counts INSTANCES, and §5 fauna that is a Ceiling counts too
// ---------------------------------------------------------------------------------------------

describe('didactic isolation counts catalogue instances (§11.5.5)', () => {
  it('spends both didactic slots on a chunk that holds two of the same catalogId', () => {
    const library = makeSequence({
      s2: { extra: [hazard('h1', 6), hazard('h2', 6, { shape: { x: 20, y: 60, w: 20, h: 20 } })] },
      s4: { extra: [hazard('h3', 6), hazard('h4', 9, { shape: { x: 20, y: 60, w: 20, h: 20 } })] },
    });
    const isolation = errors(validateSequence(library, SEQ, t)).filter((i) => i.rule === 'isolation');
    // s2 breaks the rule for catalogId 6 (two instances at once); by s4 the player has met it twice,
    // so only the FIRST appearance of catalogId 9 is reported there.
    expect(isolation.map((i) => i.message)).toEqual([
      expect.stringContaining('appearance 1 of catalogId 6'),
      expect.stringContaining('appearance 1 of catalogId 9'),
    ]);
  });

  it('sees §5 fauna authored as a Ceiling (the medusa, the alga, the tortuga)', () => {
    const medusa: Ceiling = { ...ledge('medusa', 60, 100, 40), capturable: false, catalogId: 1 };
    const library = makeSequence({ s2: { extra: [medusa, hazard('h', 6)] } });
    const isolation = errors(validateSequence(library, SEQ, t)).filter((i) => i.rule === 'isolation');
    expect(isolation).toHaveLength(2); // catalogId 1 and catalogId 6, neither of them alone
    expect(errors(validateSequence(makeSequence({ s2: { extra: [medusa] } }), SEQ, t)).filter((i) => i.rule === 'isolation')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// §11.5.2, reported as warnings because §11.5.12 (b) and (c) relax exactly this rule
// ---------------------------------------------------------------------------------------------

describe('anti-repetition (§11.5.2)', () => {
  const rotations = (issues: readonly ValidationIssue[]): ValidationIssue[] => issues.filter((i) => i.rule === 'rotation');

  it('warns when a tag chains three times, and never errors', () => {
    const issues = validateSequence(makeSequence(), SEQ, t); // every fixture chunk is tagged 'test'
    const warned = rotations(issues);
    expect(warned.length).toBeGreaterThan(0);
    expect(warned.every((i) => i.severity === 'warning')).toBe(true);
    expect(warned[0]?.message).toContain("chain the tag 'test'");
    expect(errors(issues).filter((i) => i.rule === 'rotation')).toEqual([]);
  });

  it('warns when a chunk id reappears inside CHUNK_REPEAT_WINDOW', () => {
    const library = makeSequence();
    const repeated = ['s1', 's2', 's3', 's1', 's5', 's6'];
    const warned = rotations(validateSequence(library, repeated, t));
    expect(warned.some((i) => i.message.includes("chunk 's1' repeats 3 chunks later"))).toBe(true);
  });

  it('reports a window that straddles two immersions exactly once', () => {
    // 's5' closes the first immersion's playable run and opens the second: two chunks apart, inside the
    // window of 6, and invisible to either immersion on its own.
    const second = ['s5', 's1', 's2', 's3', 's4', 's6'];
    const spanning = rotations(validateCampaign(makeSequence(), [SEQ, second], t)).filter((i) =>
      i.message.includes('repeats'),
    );
    expect(spanning).toHaveLength(1);
    expect(spanning[0]?.message).toContain("chunk 's5' repeats 2 chunks later");
  });
});

// ---------------------------------------------------------------------------------------------
// §11.5.11 "la regla se aplica también a la junta entre chunks" — including immersion boundaries
// ---------------------------------------------------------------------------------------------

describe('validateJunction (§11.5.11, §11.1)', () => {
  /** A station-shaped chunk: one wide shelf, one anchor, both entry and exit, hung at height `y`. */
  function shelfStation(id: string, y: number): Chunk {
    return {
      ...makeChunk(id, { role: 'station' }),
      entryAnchorId: 'a-in',
      exitAnchorId: 'a-in',
      entities: [ledge('shelf', 3, y, 60), anchorOn('a-in', 'shelf', 30, y)],
    };
  }

  /** The skeleton with its entry ledge (and entry anchor) moved to `x`. */
  function entryAt(id: string, x: number): Chunk {
    const chunk = makeChunk(id);
    entity<Ceiling>(chunk, 'c1').rect = { x: x - 27, y: 18, w: 36, h: 10 };
    const anchor = entity<Anchor>(chunk, 'a-in');
    anchor.pos.x = x;
    return chunk;
  }

  it('accepts a seam whose drop is inside MAX_HOP_PX and lands', () => {
    // Station anchor at local y = 187; the next chunk's entry anchor is at world y = 275, 88 px lower
    // and 80 px to the right — inside MAX_HOP_PX (110) and MAX_HOP_X_PX (200) both, since D4.
    expect(errors(validateJunction(shelfStation('st', 170), entryAt('next', 110), t))).toEqual([]);
  });

  it('flags a seam over MAX_HOP_PX', () => {
    // The same station parked at the TOP of its 240 px band: its anchor is now 240 px above the next
    // immersion's entry anchor, which is the defect §11.5.11 exists to catch.
    const issues = errors(validateJunction(shelfStation('st', 18), entryAt('next', 110), t));
    expect(issues.map((i) => i.message).join('\n')).toContain('vertical gap 240 px exceeds MAX_HOP_PX 110');
  });

  it('is what validateCampaign runs between two immersions, and only it can see that seam', () => {
    const first = ['a1', 'a2', 'a3', 'a4', 'a5', 'a-st'];
    const second = ['b1', 'b2', 'b3', 'b4', 'b5', 'b-st'];
    const library = new ChunkLibrary([
      ...first.map((id) => (id.endsWith('-st') ? shelfStation(id, 18) : makeChunk(id))),
      ...second.map((id) => (id.endsWith('-st') ? shelfStation(id, 18) : makeChunk(id))),
    ]);

    // Each immersion on its own is reach-clean: its station is 70 px below the last playable anchor.
    expect(errors(validateSequence(library, first, t)).filter((i) => i.rule === 'reach')).toEqual([]);
    expect(errors(validateSequence(library, second, t)).filter((i) => i.rule === 'reach')).toEqual([]);

    // The column they form together is not: 'a-st' -> 'b1' is a 240 px drop (§11.1, §11.5.11).
    const reach = errors(validateCampaign(library, [first, second], t)).filter((i) => i.rule === 'reach');
    expect(reach.map((i) => i.message).join('\n')).toContain('vertical gap 240 px exceeds MAX_HOP_PX 110');
  });
});

// ---------------------------------------------------------------------------------------------
// §11.5.11 — a shelf that declares more than one anchor
// ---------------------------------------------------------------------------------------------

describe('the reach ladder and a shelf with two anchors', () => {
  /**
   * Anchors that share a ceiling are ONE rest, not a hop — but they are a rest Bur reaches at
   * whichever of them her arc arrived on: `bubbleStep.restPose` clamps her x to where she came in and
   * never slides her along to the declared anchor. So the hop out of that shelf has to be certified
   * from every one of them. Walking the ladder as consecutive pairs certifies only the last, and a
   * wide shelf then ships with one of its two exits never checked.
   */
  function twoAnchorShelf(): Chunk {
    return {
      ...makeChunk('shelf-2a'),
      exitAnchorId: 'a-out',
      entities: [
        ledge('c1', 20, 18, 280),
        anchorOn('a-in', 'c1', 40, 18),
        anchorOn('a-b', 'c1', 280, 18),
        ledge('c2', 480, 78, 40),
        anchorOn('a-out', 'c2', 500, 78),
      ],
    };
  }

  it('certifies the hop out of EVERY anchor of the shelf, not just the last one', () => {
    const chunk = twoAnchorShelf();
    const issues = errors(validateSequence(new ChunkLibrary([chunk]), [chunk.id], t)).filter((i) => i.rule === 'reach');
    const text = issues.map((i) => i.message).join('\n');
    // 460 px and 220 px of lateral gap: both are past MAX_HOP_X_PX (200), and both must be said.
    expect(text).toContain("'0:a-in' -> '0:a-out'");
    expect(text).toContain("'0:a-b' -> '0:a-out'");
  });

  it('still treats the two anchors themselves as one rest, never as a hop', () => {
    const chunk = twoAnchorShelf();
    const issues = errors(validateSequence(new ChunkLibrary([chunk]), [chunk.id], t)).filter((i) => i.rule === 'reach');
    expect(issues.map((i) => i.message).join('\n')).not.toContain("'0:a-in' -> '0:a-b'");
  });
});
