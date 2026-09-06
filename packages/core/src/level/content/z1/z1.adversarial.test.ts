/**
 * ADVERSARIAL review of the hand-authored Zone 1 content (GDD §3.2, §4.1, §5, §11.5, §12.1).
 *
 * `z1.test.ts` asserts that `validateCampaign(Z1_SEQUENCES)` is clean. These tests check the same
 * normative rules DIRECTLY against the data — one continuous 25.920 px column (§11.1), not one
 * immersion at a time — and against what Bur can physically do (§2.3), which is what a green
 * §11.7.7 was supposed to mean.
 */
import { describe, expect, it } from 'vitest';
import { launchVelocity } from '../../../control/aim';
import { impulseMagnitude, zoneRadius } from '../../../control/charge';
import { degToRad } from '../../../math/vec';
import { solidRectAt } from '../../../physics/collision';
import { launchLockSteps, physicsStep } from '../../../physics/step';
import { createTuning } from '../../../tuning';
import { buildCampaign, instantiateChunk } from '../../campaign';
import { ChunkLibrary } from '../../library';
import { REACH_MAX_SECONDS, findReachTrajectory, sideWalls } from '../../validator';
import { Z1_CHUNKS, Z1_SEQUENCES } from './index';
import type { Vec2 } from '../../../math/vec';
import type { Anchor, Ceiling, SolidEntity } from '../../../types';

const t = createTuning();
const RADIUS = zoneRadius(0, t);
const library = new ChunkLibrary([...Z1_CHUNKS]);

/** Every anchor of the whole campaign in descent order, in WORLD coordinates (§11.1: one column). */
interface Rung {
  anchorId: string;
  ceilingId: string;
  chunkId: string;
  pos: Vec2;
}

function campaignLadder(): { rungs: Rung[]; solids: SolidEntity[] } {
  const campaign = buildCampaign(library, Z1_SEQUENCES, t);
  const rungs: Rung[] = [];
  const solids: SolidEntity[] = [];
  for (const placed of campaign.placed) {
    const entities = instantiateChunk(placed);
    for (const e of entities) if (e.type === 'ceiling' || e.type === 'wall') solids.push(e);
    const anchors = entities.filter((e): e is Anchor => e.type === 'anchor').sort((a, b) => a.pos.y - b.pos.y);
    for (const a of anchors) {
      rungs.push({ anchorId: a.id, ceilingId: a.ceilingId, chunkId: placed.chunk.id, pos: a.pos });
    }
  }
  return { rungs, solids };
}

// ---------------------------------------------------------------------------------------------
// BUG 1 — the seam between immersion 1 and immersion 2 breaks the reach rule (§11.5.11)
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — the reach ladder does not stop at the end of an immersion (§11.1, §11.5.11)', () => {
  it('keeps every consecutive anchor within MAX_HOP_PX over the WHOLE campaign', () => {
    const maxHop = t.MAX_HOP_PX[0] ?? 200;
    const { rungs } = campaignLadder();
    const overshoot: string[] = [];
    for (let i = 0; i < rungs.length - 1; i++) {
      const a = rungs[i];
      const b = rungs[i + 1];
      if (a === undefined || b === undefined || a.ceilingId === b.ceilingId) continue;
      const dy = b.pos.y - a.pos.y;
      if (dy > maxHop) overshoot.push(`${a.anchorId} -> ${b.anchorId}: ${dy} px (max ${maxHop})`);
    }
    // z1-station-1 declares ONE anchor, at the top of its 240 px band, and it is both entry and exit;
    // the next immersion's entry anchor is 240 px below it. `validateCampaign` never looks at that
    // pair because `validateSequence` only walks the chunks of one immersion.
    expect(overshoot).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// BUG 2 — no certified hop of Zone 1 corresponds to a shot Bur can land (§2.3, §11.7.7)
// ---------------------------------------------------------------------------------------------

/** Re-flies one probe shot with the same integrator and reports its first contact. */
function landsOn(from: Vec2, power: number, thetaDeg: number, solids: readonly SolidEntity[]): string | null {
  const speed = impulseMagnitude({ power, radius: RADIUS, stunned: false, externalMul: 1 }, t);
  const lockSteps = launchLockSteps(t);
  let pos: Vec2 = { x: from.x, y: from.y };
  let vel: Vec2 = launchVelocity(degToRad(thetaDeg), speed);

  // Same horizon the search flies (`REACH_MAX_SECONDS`, = the 2,5 s guide of §2.7): a Zone 1 hop is a
  // p ≈ 0,1 lob through a buoyant medium and takes up to ~2,3 s to float back up under the ledge.
  const budget = Math.ceil(REACH_MAX_SECONDS / t.FIXED_DT);
  for (let i = 0; i < budget; i++) {
    const launched = i < lockSteps;
    const approachVy = vel.y;
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
    if (first === undefined) continue;
    // §11.4 rest capture: bottom face of a capturable ceiling, ascending, within REST_CAPTURE_SPEED.
    const body = first.body;
    const captures =
      first.face === 'bottom' &&
      body.type === 'ceiling' &&
      body.capturable &&
      approachVy < 0 &&
      Math.abs(approachVy) <= t.REST_CAPTURE_SPEED;
    return captures ? first.bodyId : `${first.bodyId}(no capture)`;
  }
  return null;
}

describe('ADVERSARIAL — a green §11.7.7 must mean Bur can land on the next anchor', () => {
  it('lands the certified shot under the target ceiling for every Zone 1 hop', () => {
    const { rungs, solids } = campaignLadder();
    const flyBys: string[] = [];
    for (let i = 0; i < rungs.length - 1; i++) {
      const a = rungs[i];
      const b = rungs[i + 1];
      if (a === undefined || b === undefined || a.ceilingId === b.ceilingId) continue;
      const context = [...sideWalls(a.pos.y - 60, b.pos.y + 400, t), ...solids];
      const found = findReachTrajectory(a.pos, b.pos, 0, context, t);
      if (!found.ok) continue; // the unreachable seam is BUG 1's business
      const landing = landsOn(a.pos, found.power, found.thetaDeg, context);
      if (landing !== b.ceilingId) {
        flyBys.push(`${a.anchorId} -> ${b.anchorId}: certified by p=${found.power} ${found.thetaDeg}°, which ends on ${landing ?? 'nothing'}`);
      }
    }
    // Today every single Zone 1 hop is certified by an arc that grazes the anchor on the way DOWN and
    // then hits a side wall: the search only asks "did the polyline pass within 10 px", never "did Bur
    // arrive under the ceiling moving up" (§2.3). The zone is playable, but not because of this rule.
    expect(flyBys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// BUG 3 — the turtles slide out from under their own Anchor (§11.2, §2.4.2, §5 nº 3)
// ---------------------------------------------------------------------------------------------

describe('ADVERSARIAL — a moving ceiling must carry its Anchor (§11.2)', () => {
  it('keeps every Anchor under its ceiling through the whole oscillation', () => {
    const drifting: string[] = [];
    for (const chunk of Z1_CHUNKS) {
      const ceilings = new Map(chunk.entities.filter((e): e is Ceiling => e.type === 'ceiling').map((c) => [c.id, c]));
      for (const a of chunk.entities.filter((e): e is Anchor => e.type === 'anchor')) {
        const ceiling = ceilings.get(a.ceilingId);
        const moving = ceiling?.moving;
        if (ceiling === undefined || moving === undefined) continue;
        const periodMs = ((2 * moving.range) / moving.speed) * 1000;
        for (let k = 0; k < 64; k++) {
          const rect = solidRectAt(ceiling, (k / 64) * periodMs);
          if (a.pos.x < rect.x || a.pos.x > rect.x + rect.w) {
            drifting.push(`${chunk.id}/${a.id} (x=${a.pos.x}) is off '${ceiling.id}' at phase ${k}/64`);
            break;
          }
        }
      }
    }
    // §11.2 defines an Anchor as "Bur's centre when resting under the ceiling" and §2.4.2 respawns her
    // exactly there; a rest point that the turtle walks away from is neither.
    expect(drifting).toEqual([]);
  });
});
