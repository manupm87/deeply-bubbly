/**
 * Keeps one view per streamed entity: creates the new ones, updates the live ones and drops whatever
 * the snapshot no longer lists (a chunk that left the window, a pearl just collected). The snapshot is
 * the only input; nothing here remembers the world.
 */
import * as THREE from 'three';
import { hazardRectAt, solidRectAt } from '@deeply-bubbly/core';
import type { Rect, WorldEntity, WorldSnapshot } from '@deeply-bubbly/core';
import { createEntityView } from './EntityViews';
import type { EntityView, ViewDeps } from './EntityViews';
import { PX } from './Stage';

function collisionRect(e: WorldEntity, timeMs: number): Rect | null {
  switch (e.type) {
    case 'ceiling':
    case 'wall':
      return solidRectAt(e, timeMs);
    case 'hazard':
      return hazardRectAt(e, timeMs);
    case 'pickup':
      return { x: e.pos.x - e.radius, y: e.pos.y - e.radius, w: e.radius * 2, h: e.radius * 2 };
    default:
      return null;
  }
}

function auditTag(e: WorldEntity): string {
  if (e.type === 'ceiling') return e.catalogId === undefined ? `ledge-${e.material}` : `cat${e.catalogId}`;
  if (e.type === 'hazard') return `cat${e.catalogId}`;
  if (e.type === 'pickup') return e.pickupType;
  return e.type;
}

interface Slot {
  view: EntityView | null;
  frame: number;
}

export class WorldView {
  readonly root = new THREE.Group();
  private readonly deps: ViewDeps;
  private readonly slots = new Map<string, Slot>();
  private frame = 0;
  private modelsVersion: number;

  constructor(deps: ViewDeps) {
    this.deps = deps;
    this.modelsVersion = deps.models.version;
  }

  sync(snapshot: WorldSnapshot): void {
    if (this.deps.bank.zone !== snapshot.zone) this.deps.bank.setZone(snapshot.zone);
    // Models arrived after these views were built: rebuild them, so the swap needs no special path.
    if (this.deps.models.version !== this.modelsVersion) {
      this.modelsVersion = this.deps.models.version;
      this.clear();
    }
    const frame = ++this.frame;
    const entities = snapshot.entities;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (!entity) continue;
      let slot = this.slots.get(entity.id);
      if (!slot) {
        const view = createEntityView(this.deps, entity);
        if (view) this.root.add(view.root);
        slot = { view, frame };
        this.slots.set(entity.id, slot);
      }
      slot.frame = frame;
      slot.view?.update(entity, snapshot.timeMs);
    }
    for (const [id, slot] of this.slots) {
      if (slot.frame === frame) continue;
      this.drop(slot);
      this.slots.delete(id);
    }
  }

  /** Bur touched this entity (a `GameEvent`); its view plays its answer. */
  react(id: string, contact: 'bounce' | 'rest'): void {
    this.slots.get(id)?.view?.react?.(contact);
  }

  /**
   * Every live view against core: whether a glb draws it, and how far (design px, worst side) what is
   * drawn sits from the collision box core runs. Entities with no box of their own report no error.
   */
  audit(snapshot: WorldSnapshot): Array<{ id: string; tag: string; model: boolean; error: number | null }> {
    const rows: ReturnType<WorldView['audit']> = [];
    const box = new THREE.Box3();
    for (const entity of snapshot.entities) {
      const view = this.slots.get(entity.id)?.view;
      if (!view) continue;
      const rect = collisionRect(entity, snapshot.timeMs);
      let error: number | null = null;
      if (rect) {
        view.root.updateWorldMatrix(true, true);
        box.setFromObject(view.root, true);
        error = Math.max(
          Math.abs(box.min.x / PX - rect.x),
          Math.abs(box.max.x / PX - (rect.x + rect.w)),
          Math.abs(-box.max.y / PX - rect.y),
          Math.abs(-box.min.y / PX - (rect.y + rect.h)),
        );
      }
      rows.push({ id: entity.id, tag: auditTag(entity), model: view.usesModel, error });
    }
    return rows;
  }

  /** How many entities currently have a visible object; for `__db`. */
  get viewCount(): number {
    return this.root.children.length;
  }

  clear(): void {
    for (const slot of this.slots.values()) this.drop(slot);
    this.slots.clear();
  }

  private drop(slot: Slot): void {
    if (!slot.view) return;
    this.root.remove(slot.view.root);
    slot.view.destroy();
  }
}
