/**
 * Snapshot → display objects. Keeps a `Map<EntityId, EntityView>`, creates views for ids that appeared,
 * updates the ones that stayed and destroys the ones the streamer dropped. It reads ONLY the snapshot:
 * no game state of its own, no rule, no allocation per frame beyond Phaser's own.
 */
import type * as Phaser from 'phaser';
import { hazardRectAt, solidRectAt } from '@deeply-bubbly/core';
import type { EntityId, Tuning, WorldSnapshot, ZoneIndex } from '@deeply-bubbly/core';
import { DEPTH } from './depth';
import { createEntityView, type EntityView } from './EntityViews';
import { UI } from '../palette';
import { buildZoneTextures } from './textures';

export class WorldRenderer {
  private readonly scene: Phaser.Scene;
  private readonly views = new Map<EntityId, EntityView>();
  /** Reused every frame so `sync` allocates nothing. */
  private readonly seen = new Set<EntityId>();
  private readonly dead: EntityId[] = [];
  private zone: ZoneIndex;
  private readonly tuning: () => Tuning;
  private debug: Phaser.GameObjects.Graphics | null = null;

  /** `tuning` is read per frame, never captured: the §11.6 panel can change it mid-session. */
  constructor(scene: Phaser.Scene, zone: ZoneIndex, tuning: () => Tuning) {
    this.scene = scene;
    this.zone = zone;
    this.tuning = tuning;
  }

  /**
   * A zone change repaints every entity: the palette of a ledge belongs to the zone it is drawn in.
   * Textures for the new zone are built on the spot (idempotent) before any view asks for them.
   */
  setZone(zone: ZoneIndex): void {
    if (zone === this.zone) return;
    this.zone = zone;
    buildZoneTextures(this.scene, zone);
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
  }

  sync(snapshot: WorldSnapshot): void {
    this.seen.clear();
    for (const entity of snapshot.entities) {
      const id = entity.id;
      this.seen.add(id);
      let view = this.views.get(id);
      if (view === undefined) {
        const created = createEntityView(this.scene, entity, this.zone, this.tuning);
        if (created === null) continue; // anchors have no visual of their own
        this.views.set(id, created);
        view = created;
      }
      view.update(entity, snapshot.timeMs);
    }

    this.dead.length = 0;
    for (const id of this.views.keys()) if (!this.seen.has(id)) this.dead.push(id);
    for (const id of this.dead) {
      this.views.get(id)?.destroy();
      this.views.delete(id);
    }

    if (this.debug) this.drawDebug(snapshot);
  }

  /** Debug overlay (key D in GameScene): declared anchors and every hitbox the simulation uses. */
  setDebug(on: boolean): void {
    if (on && !this.debug) {
      this.debug = this.scene.add.graphics().setDepth(DEPTH.debug);
    } else if (!on && this.debug) {
      this.debug.destroy();
      this.debug = null;
    }
  }

  get debugEnabled(): boolean {
    return this.debug !== null;
  }

  private drawDebug(snapshot: WorldSnapshot): void {
    const g = this.debug;
    if (!g) return;
    g.clear();
    for (const e of snapshot.entities) {
      switch (e.type) {
        case 'ceiling':
        case 'wall': {
          const r = solidRectAt(e, snapshot.timeMs);
          g.lineStyle(1, e.type === 'ceiling' && e.capturable ? UI.cyan : UI.dim, 0.8);
          g.strokeRect(r.x, r.y, r.w, r.h);
          break;
        }
        case 'hazard': {
          const r = hazardRectAt(e, snapshot.timeMs);
          g.lineStyle(1, UI.softRed, 0.9);
          g.strokeRect(r.x, r.y, r.w, r.h);
          break;
        }
        case 'forcefield':
          g.lineStyle(1, UI.amber, 0.6);
          g.strokeRect(e.rect.x, e.rect.y, e.rect.w, e.rect.h);
          break;
        case 'pickup':
          g.lineStyle(1, UI.white, 0.6);
          g.strokeCircle(e.pos.x, e.pos.y, e.radius);
          break;
        case 'anchor':
          g.lineStyle(1, UI.amber, 0.9);
          g.strokeCircle(e.pos.x, e.pos.y, 3);
          g.lineBetween(e.pos.x - 5, e.pos.y, e.pos.x + 5, e.pos.y);
          break;
        case 'boya':
        case 'station':
          g.lineStyle(1, UI.cyan, 0.5);
          g.lineBetween(0, e.worldY, this.tuning().WORLD_W, e.worldY);
          break;
      }
    }
    g.lineStyle(1, UI.white, 0.9);
    g.strokeCircle(snapshot.bubble.pos.x, snapshot.bubble.pos.y, snapshot.bubble.radius);
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.debug?.destroy();
    this.debug = null;
  }
}
