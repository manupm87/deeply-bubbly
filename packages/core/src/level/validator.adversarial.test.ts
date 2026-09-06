/**
 * ADVERSARIAL review of `level/validator.ts` (GDD §11.5, §11.7.7).
 *
 * Every test in this file demonstrates a defect in the implementation under review. They are written
 * against the NORMATIVE rule, not against the current behaviour: a green run here means the validator
 * certifies what the GDD says it must certify, not that the assertions were relaxed.
 */
import { describe, expect, it } from 'vitest';
import { launchVelocity } from '../control/aim';
import { impulseMagnitude, zoneRadius } from '../control/charge';
import { degToRad } from '../math/vec';
import { descentDistance } from '../physics/integrator';
import { launchLockSteps, physicsStep } from '../physics/step';
import { createTuning } from '../tuning';
import { ChunkLibrary } from './library';
import {
  REACH_MAX_SECONDS,
  findReachTrajectory,
  sideWalls,
  validateCampaign,
  validateChunk,
  validateSequence,
} from './validator';
import type { Vec2 } from '../math/vec';
import type { Anchor, Ceiling, Chunk, Contact, SolidEntity, Wall, WorldEntity } from '../types';
import type { ValidationIssue } from './validator';

const t = createTuning();
const RADIUS = zoneRadius(0, t);

const errors = (issues: readonly ValidationIssue[]): ValidationIssue[] => issues.filter((i) => i.severity === 'error');
const messages = (issues: readonly ValidationIssue[]): string[] => errors(issues).map((i) => i.message);

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

function ledge(id: string, x: number, y: number, w: number, over: Partial<Ceiling> = {}): Ceiling {
  return {
    type: 'ceiling',
    id,
    rect: { x, y, w, h: 10 },
    kind: 'posadero',
    capturable: true,
    restitution: t.RESTITUTION_ROCK,
    material: 'rock',
    ...over,
  };
}

function anchorOn(id: string, ceilingId: string, x: number, ledgeY: number): Anchor {
  return { type: 'anchor', id, ceilingId, pos: { x, y: ledgeY + 10 + RADIUS } };
}

/** The four-ledge zigzag the Zone 1 chunks are built from: entry top-left, exit bottom-centre. */
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

function playable(id: string, extra: WorldEntity[] = []): Chunk {
  return {
    id,
    zone: 0,
    difficulty: 1,
    verbs: ['reposar'],
    entryAnchorId: 'a-in',
    exitAnchorId: 'a-out',
    airBudget: 0,
    targetTimeS: 8,
    tags: ['adversarial'],
    role: 'playable',
    entities: [...skeleton(), ...extra],
  };
}

/**
 * A rest station shaped like the ones Zone 1 ships: ONE wide shelf and ONE anchor, serving as both entry
 * and exit (§3.1 — crossing a station is a rest, not a descent). It hangs at the TOP of its 240 px band,
 * which is exactly what makes the seam into the next immersion 240 px long, over MAX_HOP_PX[0] = 200.
 * Every WITHIN-immersion pair of a campaign built from these still validates, so the only rule such a
 * campaign can break is the one this block is about: the seam between two immersions.
 *
 * (The published finding called that seam a 310 px drop, reading `st-1`'s exit anchor at world y = 1165.
 * That arithmetic places `st-1` at chunk index 4; it is index 5 of `first`, so with the old four-ledge
 * skeleton its bottom anchor sat at y = 1405 and the seam it opened with `q1`'s entry at 1475 was a
 * legal 70 px. The fixture is given the shape the defect actually has — `z1-station-1`'s — so that the
 * seam breaks §11.5.11 at all. The rule under test and every assertion below are unchanged.)
 */
function stationChunk(id: string): Chunk {
  return {
    ...playable(id),
    role: 'station',
    targetTimeS: 6,
    entryAnchorId: 'a-in',
    exitAnchorId: 'a-in',
    entities: [ledge('shelf', 3, 18, 60), anchorOn('a-in', 'shelf', 30, 18)],
  };
}

// ---------------------------------------------------------------------------------------------
// Replay of a probe shot with the SAME integrator the search claims to use (§10.3, §11.7.7)
// ---------------------------------------------------------------------------------------------

interface Replay {
  /** First contact of the probe shot, or null when it never touched anything. */
  contact: Contact | null;
  /** Bur's velocity at the step that produced that contact (before the bounce response). */
  approachVel: Vec2;
  /** Closest the arc ever came to the target, and whether Bur was ASCENDING at that moment. */
  closest: number;
  ascendingAtClosest: boolean;
}

/**
 * Re-flies one probe shot and reports what actually happened. `findReachTrajectory` only answers
 * "did the polyline pass near the target"; §2.3 says a rest happens when Bur touches the BOTTOM face
 * of a capturable ceiling while MOVING UP at |v| <= REST_CAPTURE_SPEED, so that is what a reachability
 * certificate has to be able to show.
 */
function replayProbe(from: Vec2, to: Vec2, power: number, thetaDeg: number, solids: readonly SolidEntity[]): Replay {
  const speed = impulseMagnitude({ power, radius: RADIUS, stunned: false, externalMul: 1 }, t);
  const lockSteps = launchLockSteps(t);
  let pos: Vec2 = { x: from.x, y: from.y };
  let vel: Vec2 = launchVelocity(degToRad(thetaDeg), speed);
  let closest = Math.hypot(from.x - to.x, from.y - to.y);
  let ascendingAtClosest = vel.y < 0;

  // The replay runs the SAME horizon the search flies (`REACH_MAX_SECONDS`, = the 2,5 s guide of §2.7):
  // a Zone 1 hop is a p ≈ 0,1 lob through a buoyant medium and takes up to ~2,3 s to come back up under
  // the ledge, so a shorter budget truncates legal certificates instead of judging them.
  const budget = Math.ceil(REACH_MAX_SECONDS / t.FIXED_DT);
  for (let i = 0; i < budget; i++) {
    const launched = i < lockSteps;
    const approachVel: Vec2 = { x: vel.x, y: vel.y };
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
    const d = Math.hypot(pos.x - to.x, pos.y - to.y);
    if (d < closest) {
      closest = d;
      ascendingAtClosest = approachVel.y < 0;
    }
    const first = stepped.contacts[0];
    if (first !== undefined) return { contact: first, approachVel, closest, ascendingAtClosest };
  }
  return { contact: null, approachVel: vel, closest, ascendingAtClosest };
}

// ---------------------------------------------------------------------------------------------
// BUG 1 — the reach search certifies a DESCENDING FLY-BY, not a landing (§2.3, §11.5.11, §11.7.7)
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — reach certificates must describe a shot Bur can actually land (§11.7.7)', () => {
  const walls: Wall[] = sideWalls(-200, 900, t);
  const from: Vec2 = { x: 30, y: 18 + 10 + RADIUS };
  const to: Vec2 = { x: 150, y: 78 + 10 + RADIUS };
  const solids: SolidEntity[] = [...walls, ledge('src', 3, 18, 36), ledge('dst', 141, 78, 36)];

  it('the certified shot ends on the BOTTOM face of the target ceiling, not on a side wall', () => {
    const found = findReachTrajectory(from, to, 0, solids, t);
    expect(found.ok).toBe(true); // the validator says this hop is reachable…

    const replay = replayProbe(from, to, found.power, found.thetaDeg, solids);
    // …but the arc it certified flies straight past the ledge and slams into the world wall.
    expect(replay.contact?.bodyId, `power ${found.power}, ${found.thetaDeg}°`).toBe('dst');
    expect(replay.contact?.face).toBe('bottom');
  });

  it('the certified shot is MOVING UP at its closest approach (§2.3: rest needs vel.y < 0)', () => {
    const found = findReachTrajectory(from, to, 0, solids, t);
    const replay = replayProbe(from, to, found.power, found.thetaDeg, solids);
    // A trajectory that is still falling when it grazes the anchor never captures: Bur keeps going.
    expect(replay.ascendingAtClosest, `closest ${replay.closest.toFixed(1)} px while falling`).toBe(true);
  });

  it('arrives slowly enough to be captured (§11.4: |vel.y| <= REST_CAPTURE_SPEED)', () => {
    const found = findReachTrajectory(from, to, 0, solids, t);
    const replay = replayProbe(from, to, found.power, found.thetaDeg, solids);
    expect(Math.abs(replay.approachVel.y)).toBeLessThanOrEqual(t.REST_CAPTURE_SPEED);
    expect(replay.approachVel.y).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// BUG 2 — the seam between two immersions is never validated (§11.5.11 "la junta entre chunks")
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — §11.5.11 applies to EVERY chunk seam, immersion boundaries included', () => {
  const first = ['p1', 'p2', 'p3', 'p4', 'p5', 'st-1'];
  const second = ['q1', 'q2', 'q3', 'q4', 'q5', 'st-2'];
  const libraryOf = (overrides: Record<string, Partial<Chunk>> = {}): ChunkLibrary =>
    new ChunkLibrary(
      [...first, ...second].map((id) => {
        const base = id.startsWith('st-') ? stationChunk(id) : playable(id);
        return { ...base, ...overrides[id] };
      }),
    );

  it('is clean inside each immersion, so only the seam between them can be at fault', () => {
    // Guard for the two tests below: every WITHIN-immersion pair of this fixture already validates.
    const library = libraryOf();
    expect(errors(validateCampaign(library, [first], t))).toEqual([]);
    expect(errors(validateCampaign(library, [second], t))).toEqual([]);
  });

  it('flags the over-long drop from the last anchor of an immersion to the first of the next', () => {
    // §11.1 places the immersions in ONE continuous column: `st-1`'s only anchor (local y = 35, world
    // y = 1235) is followed by `q1`'s entry anchor (local y = 35, world y = 1475). MAX_HOP_PX[0] is
    // 110 since D4, so that 240 px seam is over the hard limit of §11.5.11 — and nothing reported it.
    const issues = errors(validateCampaign(libraryOf(), [first, second], t)).filter((i) => i.rule === 'reach');
    expect(issues.map((i) => i.message).join('\n')).toContain('exceeds MAX_HOP_PX 110');
  });
});

// ---------------------------------------------------------------------------------------------
// BUG 3 — a moving ceiling's Anchor is only checked at the base position (§11.2, §2.4.2)
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — an Anchor must stay under its ceiling for the whole oscillation', () => {
  it('rejects an anchor the moving ceiling slides out from under', () => {
    // The ceiling oscillates ±20 px around x ∈ [60, 96]; at the left end of the travel it spans
    // [40, 76] and the declared rest point at x = 94 hangs in open water. §11.2 defines an Anchor as
    // "Bur's centre when resting under the ceiling", and §2.4.2 respawns her exactly there.
    const chunk: Chunk = {
      id: 'drifting-anchor',
      zone: 0,
      difficulty: 1,
      verbs: ['reposar'],
      entryAnchorId: 'm-a',
      exitAnchorId: 'a-out',
      airBudget: 0,
      targetTimeS: 8,
      tags: ['adversarial'],
      role: 'playable',
      entities: [
        ledge('m', 60, 18, 36, { moving: { axis: 'x', speed: 25, range: 40 } }),
        anchorOn('m-a', 'm', 94, 18),
        ledge('c4', 101, 150, 48),
        anchorOn('a-out', 'c4', 110, 150),
      ],
    };
    expect(messages(validateChunk(chunk, t)).join('\n')).toContain('m-a');
  });
});


// ---------------------------------------------------------------------------------------------
// BUG 4 — the reach certificate ignores the sticky ledge it launches from (§2.3, §11.5.11)
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — a hop taken from a PEGAJOSA ledge only gets REST_STICKY_IMPULSE_MUL of it', () => {
  /**
   * §2.3 gives the sticky ceiling its whole character in one number: leaving it costs
   * `REST_STICKY_IMPULSE_MUL` of the impulse (0,6). §11.5.11 says the reach rule is certified "con el
   * MISMO integrador" the player runs, from rest — and the player launching off a pegajosa anchor
   * never gets more than 0,6 × IMPULSE_MAX out of it.
   *
   * `findReachTrajectory` probes with `externalMul: 1` and never looks at the ceiling kind, so the
   * certificate is written for a shot that cannot be taken from that rung. The gap is not marginal:
   * at full power a Zone 1 shot descends ≈193 px, and the same shot off a sticky ledge ≈86 px. The
   * fixture below drops 100 px — comfortably inside MAX_HOP_PX[0] = 110, comfortably inside the
   * certified reach, and past everything the player can actually produce from that ledge. A chunk like
   * this ships as valid and dead-ends the run.
   */
  it('rejects a drop no sticky-ledge shot can make, even though a full-impulse one could', () => {
    const drop = 100;
    const stickyReach = descentDistance(
      impulseMagnitude({ power: 1, radius: RADIUS, stunned: false, externalMul: t.REST_STICKY_IMPULSE_MUL }, t),
      t,
    );
    // The premise of the test, asserted rather than assumed: no shot off this ledge gets that deep.
    expect(stickyReach).toBeLessThan(drop);
    expect(drop).toBeLessThanOrEqual(t.MAX_HOP_PX[0] ?? 110);

    const chunk: Chunk = {
      id: 'sticky-dead-end',
      zone: 0,
      difficulty: 1,
      verbs: ['reposar'],
      entryAnchorId: 'sticky-a',
      exitAnchorId: 'a-out',
      airBudget: 0,
      targetTimeS: 8,
      tags: ['adversarial'],
      role: 'playable',
      entities: [
        ledge('sticky', 240, 18, 60, { kind: 'pegajosa' }),
        anchorOn('sticky-a', 'sticky', 270, 18),
        ledge('below', 240, 18 + drop, 60),
        anchorOn('a-out', 'below', 270, 18 + drop),
      ],
    };
    // The reach ladder is a SEQUENCE rule (`validateChunk` only checks a chunk's schema), so the
    // chunk is walked the way the campaign walks it, as a one-chunk immersion.
    const library = new ChunkLibrary([chunk]);
    expect(messages(validateSequence(library, [chunk.id], t)).join('\n')).toMatch(/reach|sticky-a/);
  });
});
