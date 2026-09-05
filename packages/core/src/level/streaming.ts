import type { Tuning } from '../tuning';
import type { PlacedChunk, WorldEntity } from '../types';
import type { Campaign } from './campaign';

/**
 * Keeps STREAM_CHUNKS (or STREAM_CHUNKS_ASCENSO) chunks instantiated around Bur (§11.5.10):
 * previous, current, next, next+1 (and one more above while ascenso). Entities are created once per
 * placed chunk and cached until the chunk leaves the window; consumed pickups / dissolved snow are tracked
 * by id so they do not reappear when a chunk is re-instantiated (respawn can re-enter a chunk).
 */
export class WorldStreamer {
  constructor(campaign: Campaign, t: Tuning) {
    void campaign; void t;
  }
  /** Recompute the window for Bur's position. Cheap when the current chunk did not change. */
  update(burY: number, ascenso: boolean): void {
    void burY; void ascenso;
    throw new Error('not implemented');
  }
  /** All live entities in world coordinates. */
  entities(): readonly WorldEntity[] {
    throw new Error('not implemented');
  }
  currentChunk(): PlacedChunk {
    throw new Error('not implemented');
  }
  /** Marks an entity as consumed (pickup collected, snow dissolved). */
  consume(entityId: string): void {
    void entityId;
    throw new Error('not implemented');
  }
  /** Reset consumed state for a fresh run (not on respawn). */
  reset(): void {
    throw new Error('not implemented');
  }
}
