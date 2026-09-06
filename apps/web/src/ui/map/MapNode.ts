/**
 * One level of the world map: the bubble on the path, in the state `core` says it is in
 * (`levelStatuses`, WORLD-MAP.md §4). It decides nothing — not the state, not the checkpoint the run
 * would start from — it only paints and reports the tap.
 *
 * It is NOT a `ui/Button`: a button swallows its pointer (D2's rule for the HUD, where every touch is
 * an aim), and on the map that swallow would eat the drag that scrolls it — a finger that lands on a
 * node and pulls is the most natural way to move a map there is. So the node keeps its touch quiet,
 * lets the scene see it too, and refuses to fire when the scene says that contact turned into a drag.
 */
import type Phaser from 'phaser';
import type { LevelStatus } from '@deeply-bubbly/core';
import type { DebugButtonInfo, DebugButtonSource } from '../../debug';
import { effectivelyVisible, registerDebugButton, unregisterDebugButton } from '../../debug';
import { UI } from '../../palette';
import { pixelText } from '../text';
import { MAP_TEX } from './mapTextures';
import { NODE_R } from './geometry';

/** Distance below the bubble where the earned shells sit. */
const SHELL_Y = NODE_R + 5;
const SHELL_STEP = 6;
const MAX_SHELLS = 3;
const PULSE_MS = 720;

export interface MapNodeDeps {
  /** True while THAT contact (by pointer id) was a scroll, not a tap: a second finger is not judged
   * by what the first one did. */
  dragging: (pointerId: number) => boolean;
  /** True while this y is inside the scrolled view: a node off screen is not tappable. */
  onScreen: (y: number) => boolean;
  /** Enter the level. Only wired for 'available' and 'completed'. */
  onEnter: (status: LevelStatus) => void;
}

interface Skin {
  fill: number;
  fillAlpha: number;
  edge: number;
  label: number;
}

/** Node skins. Same tones as `ui/Button` so the map does not invent a second visual language. */
const SKINS: Readonly<Record<LevelStatus['state'], Skin>> = {
  noContent: { fill: UI.dim, fillAlpha: 0.45, edge: UI.dim, label: UI.white },
  locked: { fill: UI.panel, fillAlpha: 0.85, edge: UI.dim, label: UI.white },
  available: { fill: UI.cyan, fillAlpha: 0.95, edge: UI.white, label: UI.panel },
  completed: { fill: UI.amber, fillAlpha: 0.95, edge: UI.white, label: UI.panel },
};

export class MapNode implements DebugButtonSource {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly status: LevelStatus;
  private readonly deps: MapNodeDeps;
  private readonly x: number;
  private readonly y: number;
  private readonly zoom: number;
  private armed = false;

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    status: LevelStatus,
    at: { x: number; y: number },
    layout: { zoom: number; touch: number; nodeGap: number },
    deps: MapNodeDeps,
  ) {
    this.scene = scene;
    this.status = status;
    this.deps = deps;
    this.x = at.x;
    this.y = at.y;
    this.zoom = layout.zoom;
    this.root = scene.add.container(at.x, at.y);
    parent.add(this.root);

    const skin = SKINS[status.state];
    if (status.current) this.addGlow();
    const body = scene.add.image(0, 0, MAP_TEX.bubble).setTint(skin.fill).setAlpha(skin.fillAlpha);
    const edge = scene.add.image(0, 0, MAP_TEX.bubbleRing).setTint(skin.edge).setAlpha(status.state === 'noContent' ? 0.6 : 1);
    this.root.add([body, edge]);

    this.addFace(skin);
    if (status.state === 'completed') this.addShells();

    // The hit area is always 44 css pt, whatever the 19 px bubble measures (§8) — but never taller
    // than the path's own spacing, or this node would take contacts meant for the one below it.
    const side = Math.max(NODE_R * 2, layout.touch);
    this.zone = scene.add.zone(0, 0, side, Math.min(side, layout.nodeGap)).setInteractive();
    this.root.add(this.zone);
    this.bind();
    registerDebugButton(this);
  }

  /** The number, the "?" of a level with no content yet, or the padlock. */
  private addFace(skin: Skin): void {
    if (this.status.state === 'locked') {
      this.root.add(this.scene.add.image(0, 0, MAP_TEX.lock).setTint(UI.white).setAlpha(0.85));
      return;
    }
    const text = this.status.state === 'noContent' ? '?' : String(this.status.level.index + 1);
    this.root.add(
      pixelText(this.scene, {
        x: 0,
        y: 0,
        text,
        size: 8,
        zoom: this.zoom,
        color: skin.label,
        originX: 0.5,
        originY: 0.5,
      }),
    );
  }

  /** 0–3 conchas under a finished level, the missing ones dimmed: Mario's stars (WORLD-MAP.md §2). */
  private addShells(): void {
    for (let i = 0; i < MAX_SHELLS; i++) {
      const won = i < this.status.shells;
      this.root.add(
        this.scene.add
          .image((i - 1) * SHELL_STEP, SHELL_Y, MAP_TEX.shell)
          .setTint(won ? UI.amber : UI.dim)
          .setAlpha(won ? 1 : 0.5),
      );
    }
  }

  /** The deepest node the player can enter breathes, so the map answers "where was I?" by itself. */
  private addGlow(): void {
    const glow = this.scene.add.image(0, 0, MAP_TEX.glow).setTint(UI.white).setAlpha(0.3);
    this.root.add(glow);
    this.scene.tweens.add({
      targets: glow,
      alpha: 0.95,
      duration: PULSE_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private get enterable(): boolean {
    return this.status.state === 'available' || this.status.state === 'completed';
  }

  private bind(): void {
    this.zone.on('pointerdown', () => {
      this.armed = true;
    });
    this.zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      const fire = this.armed && !this.deps.dragging(p.id);
      this.armed = false;
      if (!fire) return;
      if (this.enterable) this.deps.onEnter(this.status);
      else this.refuse();
    });
    const cancel = (): void => {
      this.armed = false;
    };
    this.zone.on('pointerout', cancel);
    this.zone.on('pointerupoutside', cancel);
  }

  /** A locked level says no with a wobble and nothing else — no modal (WORLD-MAP.md §2). */
  refuse(): void {
    this.scene.tweens.killTweensOf(this.root);
    this.root.x = this.x;
    this.scene.tweens.add({
      targets: this.root,
      x: this.x + 3,
      duration: 50,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.root.x = this.x;
      },
    });
  }

  /** Debug-only rect in design px (`debug.ts`), with the node state a map test needs to assert. */
  debugInfo(): DebugButtonInfo {
    const m = this.root.getWorldTransformMatrix();
    return {
      id: `map.level.${this.status.level.index + 1}`,
      label: String(this.status.level.index + 1),
      state: this.status.state,
      x: m.tx,
      y: m.ty,
      // The zone, not the bubble: the registry is the only place a test can measure the 44 pt rule.
      w: this.zone.width,
      h: this.zone.height,
      visible: effectivelyVisible(this.root) && this.deps.onScreen(this.y),
    };
  }

  destroy(): void {
    unregisterDebugButton(this);
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy(true);
  }
}
