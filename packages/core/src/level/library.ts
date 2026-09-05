import type { Chunk } from '../types';

/** Immutable, id-indexed chunk library. Throws on duplicate ids. */
export class ChunkLibrary {
  private readonly byId = new Map<string, Chunk>();
  constructor(chunks: readonly Chunk[]) {
    for (const c of chunks) {
      if (this.byId.has(c.id)) throw new Error(`duplicate chunk id: ${c.id}`);
      this.byId.set(c.id, c);
    }
  }
  get(id: string): Chunk {
    const c = this.byId.get(id);
    if (!c) throw new Error(`unknown chunk id: ${id}`);
    return c;
  }
  has(id: string): boolean {
    return this.byId.has(id);
  }
  all(): Chunk[] {
    return [...this.byId.values()];
  }
  byZone(zone: number): Chunk[] {
    return this.all().filter((c) => c.zone === zone);
  }
}
