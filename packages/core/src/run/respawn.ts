import type { Vec2 } from '../math/vec';
import { DEFAULT_TUNING } from '../tuning';
import type { Tuning } from '../tuning';
import type { Anchor, Bubble, Camera, Ceiling, Immersion, RunState, WorldEntity } from '../types';
import type { Campaign } from '../level/campaign';
import { boyaId, chunkIndexAt } from '../level/campaign';

export type RespawnKind = 'ceiling' | 'chunkEntry' | 'boya' | 'station';

export interface RespawnPoint {
  pos: Vec2;
  kind: RespawnKind;
}

/**
 * Depth of the very first spawn of the campaign, a bit under the surface. This is the ONLY situation in
 * which a respawn lands at the start of an immersion (§2.4: "nunca al principio de la Inmersión"): the first
 * immersion before its first boya, where no checkpoint exists yet. It is reported as 'chunkEntry'.
 */
export const CAMPAIGN_START_Y = 40;

/**
 * Resaca respawn chain (§2.4.2): (a) last resting ceiling if still instantiated and within the camera recall band,
 * (b) entry anchor of the current chunk, (c) last boya / station. Never above run.maxProgressY's boya.
 */
export function resacaRespawnPoint(
  bubble: Bubble,
  run: RunState,
  cam: Camera,
  liveEntities: readonly WorldEntity[],
  campaign: Campaign,
  t: Tuning = DEFAULT_TUNING,
): RespawnPoint {
  const candidate =
    restingCeilingPoint(bubble, cam, liveEntities) ??
    chunkEntryPoint(bubble, liveEntities, campaign, t) ??
    lastCheckpoint(run, campaign, t) ??
    campaignStartPoint(t);
  return clampToProgress(candidate, run, campaign, t);
}

/** Death respawn (§2.4): last boya or station reached, whichever is deeper. Never the start of the immersion. */
export function deathRespawnPoint(run: RunState, campaign: Campaign, t: Tuning = DEFAULT_TUNING): RespawnPoint {
  const candidate = lastCheckpoint(run, campaign, t) ?? campaignStartPoint(t);
  return clampToProgress(candidate, run, campaign, t);
}

/** (a) The bottom face of the last ceiling Bur rested on, if it is still live and the camera can reach it. */
function restingCeilingPoint(
  bubble: Bubble,
  cam: Camera,
  liveEntities: readonly WorldEntity[],
): RespawnPoint | null {
  const id = bubble.lastRestingCeilingId;
  if (id === null) return null;
  const ceiling = liveEntities.find((e): e is Ceiling => e.type === 'ceiling' && e.id === id);
  if (!ceiling) return null;

  // The declared Anchor is the authored rest position (§11.2); fall back to the geometric bottom face.
  const anchor = liveEntities.find((e): e is Anchor => e.type === 'anchor' && e.ceilingId === id);
  const pos: Vec2 = anchor
    ? { x: anchor.pos.x, y: anchor.pos.y }
    : { x: ceiling.rect.x + ceiling.rect.w / 2, y: ceiling.rect.y + ceiling.rect.h + bubble.radius };

  // Must be inside what the camera can show: from the top of the recall band to the bottom of the viewport.
  if (pos.y < cam.maxY - cam.recallPx || pos.y > cam.maxY + cam.viewH) return null;
  return { pos, kind: 'ceiling' };
}

/** (b) The declared entry anchor of the chunk Bur is in, if that chunk is instantiated. */
function chunkEntryPoint(
  bubble: Bubble,
  liveEntities: readonly WorldEntity[],
  campaign: Campaign,
  t: Tuning,
): RespawnPoint | null {
  const index = chunkIndexAt(campaign, bubble.pos.y, t);
  const placed = campaign.placed[index];
  if (!placed) return null;
  const anchorId = `${index}:${placed.chunk.entryAnchorId}`;
  const anchor = liveEntities.find((e): e is Anchor => e.type === 'anchor' && e.id === anchorId);
  if (!anchor) return null;
  return { pos: { x: anchor.pos.x, y: anchor.pos.y }, kind: 'chunkEntry' };
}

/** (c) Deeper of the last boya crossed and the last station reached (§3.1). */
function lastCheckpoint(run: RunState, campaign: Campaign, t: Tuning): RespawnPoint | null {
  const boyaImmersion = run.lastBoyaId === null ? undefined : findImmersionByBoyaId(campaign, run.lastBoyaId);
  const stationImmersion = run.lastStationIndex < 0 ? undefined : campaign.immersions[run.lastStationIndex];
  const boya = boyaImmersion ? boyaPoint(boyaImmersion, t) : null;
  const station = stationImmersion ? stationPoint(stationImmersion, t) : null;
  return deeper(boya, station);
}

function findImmersionByBoyaId(campaign: Campaign, id: string): Immersion | undefined {
  return campaign.immersions.find((imm) => boyaId(imm.index) === id);
}

function boyaPoint(imm: Immersion, t: Tuning): RespawnPoint {
  return { pos: { x: t.WORLD_W / 2, y: imm.boyaY }, kind: 'boya' };
}

/** Stations are a 240 px band; Bur reappears in the middle of it. */
function stationPoint(imm: Immersion, t: Tuning): RespawnPoint {
  return { pos: { x: t.WORLD_W / 2, y: imm.stationY + t.CHUNK_H / 2 }, kind: 'station' };
}

function campaignStartPoint(t: Tuning): RespawnPoint {
  return { pos: { x: t.WORLD_W / 2, y: CAMPAIGN_START_Y }, kind: 'chunkEntry' };
}

function deeper(a: RespawnPoint | null, b: RespawnPoint | null): RespawnPoint | null {
  if (!a) return b;
  if (!b) return a;
  return b.pos.y > a.pos.y ? b : a;
}

/**
 * §2.4.2 / §4.3: conquered depth is never given back. The respawn may not land above the deepest checkpoint
 * (boya or station) that run.maxProgressY has already passed, whatever the chain produced.
 */
function clampToProgress(point: RespawnPoint, run: RunState, campaign: Campaign, t: Tuning): RespawnPoint {
  const floor = deepestCheckpointAbove(run.maxProgressY, campaign, t);
  if (floor && point.pos.y < floor.pos.y) return floor;
  return point;
}

/** Deepest boya/station respawn point already reached (its own Y is ≤ maxProgressY, so it never pushes deeper). */
function deepestCheckpointAbove(maxProgressY: number, campaign: Campaign, t: Tuning): RespawnPoint | null {
  let best: RespawnPoint | null = null;
  for (const imm of campaign.immersions) {
    for (const p of [boyaPoint(imm, t), stationPoint(imm, t)]) {
      if (p.pos.y <= maxProgressY) best = deeper(best, p);
    }
  }
  return best;
}
