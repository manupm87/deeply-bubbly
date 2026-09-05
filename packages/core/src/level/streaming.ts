import { clamp } from '../math/vec';
import type { Tuning } from '../tuning';
import type { Boya, PlacedChunk, RestStation, WorldEntity } from '../types';
import type { Campaign } from './campaign';
import { campaignMarkers, chunkIndexAt, instantiateChunk } from './campaign';

/** Chunks kept below the current one (current + next + next+1); the rest of the budget is kept above. */
const CHUNKS_AT_OR_BELOW = 3;

/**
 * Keeps STREAM_CHUNKS (or STREAM_CHUNKS_ASCENSO) chunks instantiated around Bur (§11.5.10):
 * previous, current, next, next+1 (and one more above while ascenso). Entities are created once per
 * placed chunk and cached until the chunk leaves the window; consumed pickups / dissolved snow are tracked
 * by id so they do not reappear when a chunk is re-instantiated (respawn can re-enter a chunk).
 */
export class WorldStreamer {
  private readonly campaign: Campaign;
  private readonly t: Tuning;
  /** Instantiated entities per placed chunk index; dropped when the chunk leaves the window. */
  private readonly cache = new Map<number, WorldEntity[]>();
  /** Ids of pickups collected / snow dissolved: they stay gone across re-instantiation. */
  private readonly consumed = new Set<string>();
  /** Campaign-level markers (boyas, stations); constant for the whole run. */
  private readonly markers: readonly (Boya | RestStation)[];
  private windowIndices: number[] = [];
  private currentIndex = 0;
  private ascenso = false;
  private live: WorldEntity[] = [];
  private liveDirty = true;

  constructor(campaign: Campaign, t: Tuning) {
    this.campaign = campaign;
    this.t = t;
    const { boyas, stations } = campaignMarkers(campaign, t);
    this.markers = [...boyas, ...stations];
    this.rebuild(0, false);
  }

  /** Recompute the window for Bur's position. Cheap when the current chunk did not change. */
  update(burY: number, ascenso: boolean): void {
    const index = chunkIndexAt(this.campaign, burY, this.t);
    if (index === this.currentIndex && ascenso === this.ascenso) return;
    this.rebuild(index, ascenso);
  }

  /** All live entities in world coordinates. */
  entities(): readonly WorldEntity[] {
    if (this.liveDirty) {
      const out: WorldEntity[] = [];
      for (const index of this.windowIndices) {
        for (const e of this.cache.get(index) ?? []) {
          if (!this.consumed.has(e.id)) out.push(e);
        }
      }
      const topY = this.windowTopY();
      const bottomY = this.windowBottomY();
      for (const m of this.markers) {
        if (m.worldY >= topY && m.worldY < bottomY) out.push(m);
      }
      this.live = out;
      this.liveDirty = false;
    }
    return this.live;
  }

  currentChunk(): PlacedChunk {
    const placed = this.campaign.placed[this.currentIndex];
    if (!placed) throw new Error(`no placed chunk at index ${this.currentIndex}`);
    return placed;
  }

  /** Marks an entity as consumed (pickup collected, snow dissolved). */
  consume(entityId: string): void {
    if (this.consumed.has(entityId)) return;
    this.consumed.add(entityId);
    this.liveDirty = true;
  }

  /** Reset consumed state for a fresh run (not on respawn). Also drops the cache so entities are pristine. */
  reset(): void {
    this.consumed.clear();
    this.cache.clear();
    this.rebuild(this.currentIndex, this.ascenso);
  }

  /** Placed indices currently instantiated, ascending (window contents; useful for tests and telemetry). */
  loadedIndices(): readonly number[] {
    return this.windowIndices;
  }

  private rebuild(index: number, ascenso: boolean): void {
    this.currentIndex = index;
    this.ascenso = ascenso;
    const budget = ascenso ? this.t.STREAM_CHUNKS_ASCENSO : this.t.STREAM_CHUNKS;
    const above = Math.max(0, budget - CHUNKS_AT_OR_BELOW);
    const last = this.campaign.placed.length - 1;
    const from = clamp(index - above, 0, last);
    const to = clamp(index + (CHUNKS_AT_OR_BELOW - 1), 0, last);

    const next: number[] = [];
    for (let i = from; i <= to; i++) next.push(i);

    for (const cached of [...this.cache.keys()]) {
      if (cached < from || cached > to) this.cache.delete(cached);
    }
    for (const i of next) {
      if (this.cache.has(i)) continue;
      const placed = this.campaign.placed[i];
      if (!placed) continue;
      this.cache.set(i, instantiateChunk(placed));
    }

    this.windowIndices = next;
    this.liveDirty = true;
  }

  private windowTopY(): number {
    const first = this.windowIndices[0];
    return first === undefined ? 0 : first * this.t.CHUNK_H;
  }

  private windowBottomY(): number {
    const last = this.windowIndices[this.windowIndices.length - 1];
    return last === undefined ? 0 : (last + 1) * this.t.CHUNK_H;
  }
}
