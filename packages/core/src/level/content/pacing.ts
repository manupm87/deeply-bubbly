/**
 * The two numbers a player feels and no static rule can see, measured by playing (GDD pillar 3, §3.1,
 * DECISIONS-v1.2 D3): how long a stretch between two checkpoints really takes, and how often the next
 * rest point is out of the view at the moment the shot has to be chosen.
 *
 * `targetTimeS` is a promise an author writes down; this is what the autoplayer of `game/autoPlayer.ts`
 * actually spends, through the real `GameWorld`. Like `zoneReport.ts` it holds no `expect`: each test
 * asserts on the report, and the same report is what a before/after comparison prints.
 *
 * The bot only sets a floor on the clock. It aims in a quarter of a second and never misses on purpose,
 * so a human is slower on any stretch: a stretch that fails here fails for everybody.
 */
import { GuidedFinger, autoPlayerTarget } from '../../game/autoPlayer';
import { buildMvpCampaign, createMvpWorld } from '../../game/testHarness';
import { DEFAULT_TUNING } from '../../tuning';
import { instantiateChunk } from '../campaign';
import { findLandingLines, sideWalls } from '../validator';
import type { Rect, Vec2 } from '../../math/vec';
import type { Tuning } from '../../tuning';
import type { Anchor, Camera, Ceiling, ForceField, Hazard, SolidEntity, WorldSnapshot, ZoneIndex } from '../../types';

/** One stretch between two checkpoints: the clock runs from one to the next, however it was spent. */
export interface Stretch {
  /** `station:N -> boya:N`, `boya:N -> station:N`, or `start -> ...` for the top of the campaign. */
  label: string;
  seconds: number;
  shots: number;
}

export interface ShotView {
  /** Shots the bot chose with a target below it. */
  shots: number;
  /** Of those, how many had the target's rest point outside the view. */
  anchorOffscreen: number;
  /** Of those, how many had no part of the target's ledge in the view: nothing at all to aim at. */
  ledgeOffscreen: number;
}

export interface PacingReport {
  stretches: Stretch[];
  view: ShotView;
  deaths: number;
  /** Air pips lost to every cause over the run: a clean descent loses none. */
  pipsLost: number;
  completed: boolean;
  /** Launches and rests: far more launches than rests would mean the bot is missing. */
  launches: number;
  rests: number;
}

export interface PacingOptions {
  /** Station to start from, as the map does; -1 (default) is the top of the campaign. */
  startStationIndex?: number;
  /** Station whose arrival ends the measurement; default: the whole campaign. */
  untilStationIndex?: number;
  viewH?: number;
  tuning?: Tuning;
  /** Simulated seconds after which the run is declared stuck. */
  budgetS?: number;
}

/** Whether a world point lies inside the view. */
function pointInView(p: Vec2, cam: Camera): boolean {
  return p.x >= cam.x && p.x <= cam.x + cam.viewW && p.y >= cam.y && p.y <= cam.y + cam.viewH;
}

function rectInView(r: Rect, cam: Camera): boolean {
  return r.x + r.w >= cam.x && r.x <= cam.x + cam.viewW && r.y + r.h >= cam.y && r.y <= cam.y + cam.viewH;
}

function ceilingOf(snapshot: WorldSnapshot, anchor: Anchor): Ceiling | undefined {
  return snapshot.entities.find((e): e is Ceiling => e.type === 'ceiling' && e.id === anchor.ceilingId);
}

/** Plays the MVP campaign with the guided bot and reports what the player would have felt. */
export function measurePacing(options: PacingOptions = {}): PacingReport {
  const t = options.tuning ?? DEFAULT_TUNING;
  const start = options.startStationIndex ?? -1;
  const world = createMvpWorld({
    tuning: t,
    ...(options.viewH === undefined ? {} : { viewH: options.viewH }),
    ...(start >= 0 ? { startStationIndex: start } : {}),
  });
  const finger = new GuidedFinger(t);
  const stepMs = t.FIXED_DT * 1000;
  const budget = Math.round((options.budgetS ?? 900) / t.FIXED_DT);

  const report: PacingReport = {
    stretches: [],
    view: { shots: 0, anchorOffscreen: 0, ledgeOffscreen: 0 },
    deaths: 0,
    pipsLost: 0,
    completed: false,
    launches: 0,
    rests: 0,
  };
  let from = start >= 0 ? `station:${start}` : 'start';
  let clockMs = 0;
  let shots = 0;
  let wasDown = false;
  let snap = world.snapshot();

  const close = (to: string): void => {
    report.stretches.push({ label: `${from} -> ${to}`, seconds: clockMs / 1000, shots });
    from = to;
    clockMs = 0;
    shots = 0;
  };

  for (let i = 0; i < budget; i++) {
    const pointer = finger.next(stepMs, snap);
    if (pointer.down && !wasDown && snap.bubble.state === 'RESTING') {
      const target = autoPlayerTarget(snap);
      if (target !== undefined) {
        report.view.shots++;
        if (!pointInView(target.pos, snap.camera)) report.view.anchorOffscreen++;
        const ledge = ceilingOf(snap, target);
        if (ledge === undefined || !rectInView(ledge.rect, snap.camera)) report.view.ledgeOffscreen++;
      }
    }
    wasDown = pointer.down;
    world.update(stepMs, pointer);
    snap = world.snapshot();
    // The summary screen of a station is a pause, not part of the stretch: the clock only runs while
    // there is water to cross, and leaving the station is the player's own decision.
    if (snap.phase === 'playing') clockMs += stepMs;
    for (const e of snap.events) {
      if (e.type === 'launch') {
        report.launches++;
        shots++;
      } else if (e.type === 'rest') report.rests++;
      else if (e.type === 'airLost') report.pipsLost++;
      else if (e.type === 'gameOver') report.deaths++;
      else if (e.type === 'boya') close(e.boyaId);
      else if (e.type === 'stationEnter') close(`station:${e.station.immersionIndex}`);
    }
    if (snap.phase === 'campaignComplete') {
      report.completed = true;
      break;
    }
    if (options.untilStationIndex !== undefined && snap.run.lastStationIndex >= options.untilStationIndex) {
      report.completed = true;
      break;
    }
    if (snap.phase === 'station') world.continueDescent();
    if (snap.phase === 'dead') world.restart();
  }
  return report;
}

/** Share of the chosen shots whose target was out of the view, 0..1. */
export const anchorOffscreenShare = (view: ShotView): number =>
  view.shots === 0 ? 0 : view.anchorOffscreen / view.shots;

/** Share of the chosen shots with no part of the target's ledge in the view, 0..1. */
export const ledgeOffscreenShare = (view: ShotView): number =>
  view.shots === 0 ? 0 : view.ledgeOffscreen / view.shots;

/** How far from the declared rest point a real landing ends: `reachTolerance`, in practice. */
export const LANDING_POSE_SPREAD_PX = 6;

export interface LandingPoseAudit {
  hops: number;
  /** `chunk: from -> to, pose offset` for every pose with no shot at all: a soft lock in waiting. */
  failures: string[];
  /** The same, for every pose whose only shots touch a crown: it can be paid for, it is not a lock. */
  contested: string[];
}

/**
 * The reach rule certifies a hop from the declared anchor, but `restPose` keeps Bur wherever her arc
 * arrived, a few px either side of it. A hop that only works from the exact anchor is a hop the player
 * cannot repeat, and on the guided bot it shows up as minutes of fallback shots. This re-asks the search
 * from both ends of that spread, with the crowns in, on the same ladder the validator walks.
 */
export function landingPoseAudit(t: Tuning = DEFAULT_TUNING): LandingPoseAudit {
  const campaign = buildMvpCampaign(t);
  const entities = campaign.placed.map((p) => instantiateChunk(p));
  const audit: LandingPoseAudit = { hops: 0, failures: [], contested: [] };
  type Rung = { anchor: Anchor; zone: ZoneIndex; chunkId: string; index: number };
  const rungs: Rung[] = campaign.placed.flatMap((p, index) =>
    (entities[index] ?? [])
      .filter((e): e is Anchor => e.type === 'anchor')
      .sort((a, b) => a.pos.y - b.pos.y)
      .map((anchor) => ({ anchor, zone: p.chunk.zone, chunkId: p.chunk.id, index })),
  );
  for (let i = 0; i < rungs.length - 1; i++) {
    const a = rungs[i];
    const b = rungs[i + 1];
    if (a === undefined || b === undefined || a.anchor.ceilingId === b.anchor.ceilingId) continue;
    audit.hops++;
    const near = [...(entities[a.index] ?? []), ...(a.index === b.index ? [] : (entities[b.index] ?? []))];
    const solids: SolidEntity[] = [
      ...near.filter((e): e is SolidEntity => e.type === 'ceiling' || e.type === 'wall'),
      ...sideWalls(a.anchor.pos.y - 240, b.anchor.pos.y + 400, t),
    ];
    const fields = near.filter((e): e is ForceField => e.type === 'forcefield');
    // A periodic hazard is a matter of when, not of where: only the static crowns contest a line.
    const hazards = near.filter((e): e is Hazard => e.type === 'hazard' && e.periodMs === undefined);
    const leaving = solids.find((s) => s.id === a.anchor.ceilingId);
    const mul = leaving?.type === 'ceiling' && leaving.kind === 'pegajosa' ? t.REST_STICKY_IMPULSE_MUL : 1;
    for (const offset of [-LANDING_POSE_SPREAD_PX, LANDING_POSE_SPREAD_PX]) {
      const from = { x: a.anchor.pos.x + offset, y: a.anchor.pos.y };
      const lines = findLandingLines(from, b.anchor.pos, a.zone, solids, t, b.anchor.ceilingId, fields, hazards, mul);
      const label = `${a.chunkId}: ${a.anchor.id} -> ${b.anchor.id} from x${offset >= 0 ? '+' : ''}${offset}`;
      if (lines.length === 0) audit.failures.push(label);
      else if (!lines.some((l) => !l.touchesHazard)) audit.contested.push(label);
    }
  }
  return audit;
}
