/**
 * The row of worlds at the top of the map (WORLD-MAP.md §2): the amber ocean, lit, and the two future
 * worlds as locked silhouettes with a padlock. They are structure and promise, nothing else — tapping
 * a locked one wobbles and says no, exactly like a locked level, and no modal ever opens.
 */
import type Phaser from 'phaser';
import type { WorldDef, WorldId } from '@deeply-bubbly/core';
import type { DebugButtonInfo, DebugButtonSource } from '../../debug';
import { effectivelyVisible, registerDebugButton, unregisterDebugButton } from '../../debug';
import { UI, ZONE_PALETTES } from '../../palette';
import { pixelText, wrapLabel } from '../text';
import { strings } from '../strings';
import type { IslandSlot } from './geometry';
import { MAP_TEX } from './mapTextures';

/** Characters that fit on one line of 8 px text inside an island column. */
const LABEL_CHARS = 9;

export interface IslandDeps {
  /** True while THAT contact (by pointer id) was a scroll of the map, not a tap. */
  dragging: (pointerId: number) => boolean;
  /** True while this y is inside the scrolled view; an island scrolled away is not tappable. */
  onScreen: (y: number) => boolean;
}

export function worldName(id: WorldId): string {
  const s = strings();
  if (id === 'amber-ocean') return s.worldAmberOcean;
  if (id === 'volcano') return s.worldVolcano;
  return s.worldLochNess;
}

/** One island: art, name, padlock and its own touch target. */
class Island implements DebugButtonSource {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly world: WorldDef;
  private readonly slot: IslandSlot;
  private readonly deps: IslandDeps;
  private readonly zone: Phaser.GameObjects.Zone;
  private armed = false;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    world: WorldDef,
    slot: IslandSlot,
    layout: { zoom: number; touch: number },
    deps: IslandDeps,
  ) {
    this.scene = scene;
    this.world = world;
    this.slot = slot;
    this.deps = deps;
    this.root = scene.add.container(slot.x, slot.y);
    parent.add(this.root);

    const lit = world.playable;
    const island = scene.add
      .image(0, 0, MAP_TEX.island)
      .setTint(lit ? ZONE_PALETTES[0].kelp : UI.dim)
      .setAlpha(lit ? 1 : 0.5);
    this.root.add(island);
    if (!lit) {
      this.root.add(scene.add.image(0, 0, MAP_TEX.lock).setTint(UI.white).setAlpha(0.75));
    }
    this.root.add(
      pixelText(scene, {
        x: 0,
        y: slot.labelY - slot.y,
        text: wrapLabel(worldName(world.id), LABEL_CHARS),
        size: 8,
        zoom: layout.zoom,
        color: lit ? UI.white : UI.dim,
        originX: 0.5,
        originY: 0,
      }),
    );

    const zone = scene.add
      .zone(0, 0, Math.max(slot.w, layout.touch), Math.max(slot.h, layout.touch))
      .setInteractive();
    this.zone = zone;
    this.root.add(zone);
    zone.on('pointerdown', () => {
      this.armed = true;
    });
    zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      const fire = this.armed && !this.deps.dragging(p.id);
      this.armed = false;
      // The playable world is the map you are already looking at: tapping it has nothing to do.
      if (fire && !this.world.playable) this.refuse();
    });
    const cancel = (): void => {
      this.armed = false;
    };
    zone.on('pointerout', cancel);
    zone.on('pointerupoutside', cancel);
    registerDebugButton(this);
  }

  private refuse(): void {
    this.scene.tweens.killTweensOf(this.root);
    this.root.x = this.slot.x;
    this.scene.tweens.add({
      targets: this.root,
      x: this.slot.x + 3,
      duration: 50,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.root.x = this.slot.x;
      },
    });
  }

  debugInfo(): DebugButtonInfo {
    const m = this.root.getWorldTransformMatrix();
    return {
      id: `map.world.${this.world.id}`,
      label: worldName(this.world.id),
      state: this.world.playable ? 'available' : 'locked',
      x: m.tx,
      y: m.ty,
      w: this.zone.width,
      h: this.zone.height,
      visible: effectivelyVisible(this.root) && this.deps.onScreen(this.slot.y),
    };
  }

  destroy(): void {
    unregisterDebugButton(this);
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy(true);
  }
}

export class WorldIslands {
  private readonly islands: Island[] = [];

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    worlds: readonly WorldDef[],
    slots: readonly IslandSlot[],
    layout: { zoom: number; touch: number },
    deps: IslandDeps,
  ) {
    for (let i = 0; i < worlds.length; i++) {
      const world = worlds[i];
      const slot = slots[i];
      if (!world || !slot) continue;
      this.islands.push(new Island(scene, parent, world, slot, layout, deps));
    }
  }

  destroy(): void {
    for (const island of this.islands) island.destroy();
    this.islands.length = 0;
  }
}
