/**
 * Geometry questions a re-authored zone has to answer, in one place (DECISIONS-v1.2 D3, D4).
 *
 * `zoneReport.ts` runs the §11.5 RULES over a zone; this runs the D3 layout claims, which are about
 * shape rather than legality: is there still open water to swim through, is the reef where the reef
 * belongs, does every chunk keep a ceiling over the point §2.4.2 respawns Bur at, is the extra bolsa de
 * aire of §4.2.3 going to land somewhere she can reach it.
 *
 * Like `zoneReport.ts` it holds no `expect`: Zone 1 and Zone 2 ask it the same questions and assert on
 * the answers, so the two zones can never drift into two different definitions of "open water".
 */
import { circleRectOverlap } from '../../math/vec';
import type { Rect, Vec2 } from '../../math/vec';
import type { Anchor, Ceiling, Chunk, Pickup, SolidEntity, Wall } from '../../types';

/** The chunk's ceilings and walls: everything a shot can hit. */
export const solidsOf = (chunk: Chunk): SolidEntity[] =>
  chunk.entities.filter((e): e is SolidEntity => e.type === 'ceiling' || e.type === 'wall');

export const ceilingsOf = (chunk: Chunk): Ceiling[] =>
  chunk.entities.filter((e): e is Ceiling => e.type === 'ceiling');

export const wallsOf = (chunk: Chunk): Wall[] => chunk.entities.filter((e): e is Wall => e.type === 'wall');

export const pickupsOf = (chunk: Chunk): Pickup[] => chunk.entities.filter((e): e is Pickup => e.type === 'pickup');

/** The chunk's declared rest points, top to bottom: the ladder §11.5.11 walks. */
export const anchorsOf = (chunk: Chunk): Anchor[] =>
  chunk.entities.filter((e): e is Anchor => e.type === 'anchor').sort((a, b) => a.pos.y - b.pos.y);

/**
 * Width of the widest unobstructed horizontal run at depth `y`, in px. D3 asks for "agua abierta con
 * estructuras dispersas": a depth where the widest run is narrower than half a screen is a corridor,
 * whatever the map looks like from above.
 */
export function widestOpenRunAt(chunk: Chunk, y: number, worldW: number): number {
  const spans: Array<[number, number]> = [];
  for (const s of solidsOf(chunk)) {
    if (y < s.rect.y || y > s.rect.y + s.rect.h) continue;
    spans.push([Math.max(0, s.rect.x), Math.min(worldW, s.rect.x + s.rect.w)]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let widest = 0;
  let cursor = 0;
  for (const [from, to] of spans) {
    if (from > cursor) widest = Math.max(widest, from - cursor);
    cursor = Math.max(cursor, to);
  }
  return Math.max(widest, worldW - cursor);
}

/**
 * The ceiling a death respawn floats up into, if the chunk has one. §2.4.2 puts the boya respawn at
 * `worldW / 2` on a chunk seam, in open water: the chunk ABOVE that seam must offer a capturable
 * underside over that column, or the respawn is a slow rise into nothing at all.
 */
export function respawnCanopy(chunk: Chunk, worldW: number, chunkH: number): Ceiling | undefined {
  return ceilingsOf(chunk).find(
    (c) => c.capturable && c.rect.x < worldW / 2 && c.rect.x + c.rect.w > worldW / 2 && c.rect.y > (2 * chunkH) / 3,
  );
}

/** Every pickup of the chunk that a body of `radius` could not actually reach, because rock is in it. */
export function buriedPickups(chunk: Chunk, radius: number): Pickup[] {
  const solids = solidsOf(chunk);
  return pickupsOf(chunk).filter((p) => solids.some((s) => circleRectOverlap(p.pos, radius, grow(s.rect, 1))));
}

/** Where `level/mercy.ts` would put the extra bolsa de aire of §4.2.3, if the chunk can host one. */
export function mercyBagHost(chunk: Chunk): Pickup | undefined {
  const pickups = pickupsOf(chunk);
  return pickups.find((p) => p.pickupType === 'perla') ?? pickups.find((p) => p.pickupType === 'aire');
}

/** One rung of the campaign-wide ladder: an anchor with the chunk it belongs to, in campaign order. */
export interface LadderRung {
  chunkId: string;
  anchorId: string;
  ceilingKey: string;
  pos: Vec2;
}

/** Every rest point of a sequence of chunks in descent order, seams included (§11.1: one column). */
export function campaignLadder(chunks: readonly Chunk[]): LadderRung[] {
  const out: LadderRung[] = [];
  for (const chunk of chunks) {
    for (const a of anchorsOf(chunk)) {
      out.push({ chunkId: chunk.id, anchorId: a.id, ceilingKey: `${chunk.id}/${a.ceilingId}`, pos: a.pos });
    }
  }
  return out;
}

/** Lateral gap of every consecutive rung pair that is a real hop (a wide shelf's own anchors are not). */
export function lateralGaps(rungs: readonly LadderRung[]): Array<{ label: string; gap: number }> {
  const out: Array<{ label: string; gap: number }> = [];
  for (let i = 0; i < rungs.length - 1; i++) {
    const a = rungs[i];
    const b = rungs[i + 1];
    if (a === undefined || b === undefined || a.ceilingKey === b.ceilingKey) continue;
    out.push({
      label: `${a.chunkId}/${a.anchorId} -> ${b.chunkId}/${b.anchorId}`,
      gap: Math.abs(b.pos.x - a.pos.x),
    });
  }
  return out;
}

const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });
