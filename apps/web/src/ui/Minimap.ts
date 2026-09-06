/**
 * Minimap of the HUD (v1.3, DECISIONS-v1.2 D5 "ojeo"). It is BOTH the map and the camera control.
 *
 * Since D3 the world is three screens wide and a full shot (D4) travels most of one, so the ledge the
 * player is aiming at is off-screen most of the time. A free camera drag is impossible under D2 — any
 * touch on the glass freezes an aim origin — so the look-around lives here: while a finger holds this
 * map, the shell asks `GameWorld.setPeek(worldPoint)` for the view to be CENTRED there, and asks for
 * `null` on release. Everything drawn comes from `snapshot.minimap`, which core rebuilds every frame;
 * this module decides nothing about the world, not even where the marks are.
 *
 * The touch is SWALLOWED exactly like a HUD button's (`ui/swallow.ts`): `PointerAdapter` never sees
 * it, so holding the map starts no slingshot. The swallow is scoped to THIS contact — clearing the
 * shared sample for any finger would release the pull the other one is holding, i.e. fire the shot —
 * and the pointer is then followed BY ID at scene level, so a drag that leaves the map (or the canvas)
 * keeps steering while the other finger pulls the sling (main.ts enables two active pointers).
 */
import type Phaser from 'phaser';
import { minimapToWorld } from '@deeply-bubbly/core';
import type { MinimapMarkKind, MinimapModel, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import type { DebugButtonInfo, DebugButtonSource } from '../debug';
import { effectivelyVisible, registerDebugButton, unregisterDebugButton } from '../debug';
import { UI } from '../palette';
import type { HudLayout } from './layout';
import { PeekKeys } from './peekKeys';
import { swallowPointer } from './swallow';

/** Alpha of the whole map: full while the player is deciding a shot or peeking, faded while flying. */
const ALPHA_ACTIVE = 1;
const ALPHA_IDLE = 0.45;
const FADE_MS = 200;

interface MarkStyle {
  colour: number;
  alpha: number;
}

/** Reserved UI colours only (GDD §8): the map may never introduce a world colour. */
const MARK_STYLES: Readonly<Record<MinimapMarkKind, MarkStyle>> = {
  ledge: { colour: UI.cyan, alpha: 0.95 },
  ledgeNoRest: { colour: UI.cyan, alpha: 0.45 },
  hazard: { colour: UI.amber, alpha: 0.9 },
  pickup: { colour: UI.white, alpha: 0.9 },
  field: { colour: UI.cyan, alpha: 0.18 },
  boya: { colour: UI.amber, alpha: 0.5 },
  station: { colour: UI.amber, alpha: 0.3 },
};

export class Minimap implements DebugButtonSource {
  private readonly scene: Phaser.Scene;
  private readonly ctx: GameContext;
  /** Positioned at the TOP-LEFT of the drawn map; every child is in minimap px. */
  private readonly root: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly zone: Phaser.GameObjects.Zone;
  private layoutRef: HudLayout;
  private w: number;
  private h: number;
  private model: MinimapModel | null = null;
  /** Id of the finger that owns the peek right now, or null. */
  private peekPointer: number | null = null;
  /** Desktop-only aid; on a phone it never fires (`ui/peekKeys.ts`). */
  private readonly keys: PeekKeys;
  private alphaTarget = ALPHA_IDLE;
  private hidden = false;

  private readonly onWindowRelease = (): void => this.release();
  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible') this.release();
  };

  constructor(scene: Phaser.Scene, ctx: GameContext, layout: HudLayout) {
    this.scene = scene;
    this.ctx = ctx;
    this.layoutRef = layout;
    this.w = ctx.tuning.WORLD_W * ctx.tuning.MINIMAP_SCALE;
    this.h = ctx.tuning.MINIMAP_WORLD_H * ctx.tuning.MINIMAP_SCALE;
    this.root = scene.add.container(0, 0);
    this.root.setAlpha(ALPHA_IDLE);
    this.g = scene.add.graphics();
    this.root.add(this.g);
    this.zone = scene.add.zone(0, 0, this.w, this.h);
    this.root.add(this.zone);
    this.place();
    this.bindTouch();
    this.keys = new PeekKeys(scene, {
      origin: () => ctx.snapshot?.bubble.pos ?? null,
      onTarget: (target) => ctx.world.setPeek(target),
      onRelease: () => this.applyPeek(),
      blocked: () => this.hidden,
    });
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onWindowRelease);
    // A cancelled contact (a system gesture, a call) never sends its `pointerup`: without this the
    // view would stay peeked with nobody holding it.
    window.addEventListener('pointercancel', this.onWindowRelease);
    registerDebugButton(this);
  }

  /** Debug-only rect in design px (`debug.ts`): where a synthetic touch has to land to peek. */
  debugInfo(): DebugButtonInfo {
    return {
      id: 'minimap',
      label: 'minimap',
      x: this.root.x + this.w / 2,
      y: this.root.y + this.h / 2,
      w: this.w,
      h: this.h,
      visible: effectivelyVisible(this.root),
    };
  }

  layout(layout: HudLayout): void {
    this.layoutRef = layout;
    this.place();
  }

  /** Top-centre, just under the HUD band; the hit area is never smaller than 44 css pt. */
  private place(): void {
    const l = this.layoutRef;
    this.root.setPosition(Math.round((l.viewW - this.w) / 2), Math.round(l.top + l.bandH + 2));
    this.zone.setSize(Math.max(this.w, l.touch), Math.max(this.h, l.touch));
    this.zone.setPosition(this.w / 2, this.h / 2);
    if (!this.hidden) this.zone.setInteractive();
  }

  sync(snapshot: WorldSnapshot, delta: number): void {
    const m = snapshot.minimap;
    if (m.w !== this.w || m.h !== this.h) {
      this.w = m.w;
      this.h = m.h;
      this.place();
    }
    this.model = m;
    this.draw(m);
    this.fade(snapshot, delta);
  }

  private draw(m: MinimapModel): void {
    const g = this.g;
    g.clear();
    g.fillStyle(UI.panel, 0.55);
    g.fillRect(0, 0, m.w, m.h);
    for (const mark of m.marks) {
      const style = MARK_STYLES[mark.kind];
      g.fillStyle(style.colour, style.alpha);
      g.fillRect(
        Math.round(mark.rect.x),
        Math.round(mark.rect.y),
        Math.max(1, Math.round(mark.rect.w)),
        Math.max(1, Math.round(mark.rect.h)),
      );
    }
    this.drawBur(m);
    this.drawViewFrame(m);
    // Border last: it is what separates the panel from the water behind it.
    g.lineStyle(1, UI.cyan, 0.6);
    g.strokeRect(0.5, 0.5, m.w - 1, m.h - 1);
  }

  /**
   * Bur, and she has to be unmistakable: while the view is peeked to the far side of the world the map
   * is the ONLY place she exists, and a plain white 2x2 reads exactly like the white 1x1 pickups. So
   * she is a white 2x2 core inside a dark keyline — a shape no mark has.
   *
   * Core reports her TRUE centre (the model needs it: `minimapToWorld` is its inverse), and she leaves
   * the map whenever she is more than MINIMAP_ABOVE_PX above the live camera, which the §4.3 ratchet
   * makes routine. So the 4x4 is clamped into the panel here, exactly like the view frame next door:
   * pinned to an edge she still reads as "up there", and no white pixel lands on the HUD band.
   */
  private drawBur(m: MinimapModel): void {
    const g = this.g;
    const x = clamp(Math.round(m.bur.x) - 2, 0, Math.max(0, m.w - 4));
    const y = clamp(Math.round(m.bur.y) - 2, 0, Math.max(0, m.h - 4));
    g.fillStyle(UI.panel, 0.95);
    g.fillRect(x, y, 4, 4);
    g.fillStyle(UI.white, 1);
    g.fillRect(x + 1, y + 1, 2, 2);
  }

  /**
   * The frame of the DRAWN view. Core lets it stick out of the map (a peek down can reach past the
   * bottom edge); it is clipped here so the HUD never paints a white line over the world, and what is
   * left still reads as "the window is at the edge".
   */
  private drawViewFrame(m: MinimapModel): void {
    const x0 = Math.max(0, Math.round(m.view.x));
    const y0 = Math.max(0, Math.round(m.view.y));
    const x1 = Math.min(m.w, Math.round(m.view.x + m.view.w));
    const y1 = Math.min(m.h, Math.round(m.view.y + m.view.h));
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    this.g.lineStyle(1, UI.white, 0.9);
    this.g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  }

  private fade(snapshot: WorldSnapshot, delta: number): void {
    const state = snapshot.bubble.state;
    const deciding = state === 'RESTING' || state === 'AIMING' || this.peeking;
    const target = deciding ? ALPHA_ACTIVE : ALPHA_IDLE;
    if (target === this.alphaTarget && Math.abs(this.root.alpha - target) < 0.001) return;
    this.alphaTarget = target;
    // Hand-rolled instead of a tween: this runs every frame from HudScene, and a tween per state
    // flip would stack up on a bubble that lands and launches twice a second.
    const k = Math.min(1, Math.max(0, delta / FADE_MS));
    this.root.setAlpha(this.root.alpha + (target - this.root.alpha) * k);
  }

  private get peeking(): boolean {
    return this.peekPointer !== null || this.keys.active;
  }

  // ---------------------------------------------------------------------------------------------

  private bindTouch(): void {
    this.zone.setInteractive();
    this.zone.on(
      'pointerdown',
      (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        // Swallowed like a button (D2): the world must never read this touch as an aim. Scoped to
        // THIS contact, so a map finger landing mid-pull cannot release the other one's shot.
        swallowPointer(event, this.ctx, p.id);
        if (this.hidden) return;
        this.peekPointer = p.id;
        this.peekAt(p);
      },
    );
    // Scene level and filtered by id: the finger may drag off the map and must keep steering.
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
    this.scene.input.on('pointerupoutside', this.onPointerUp, this);
    // Deliberately NOT 'gameout': it fires while the finger is still DOWN (a drag that leaves the
    // canvas, which peeking UP does routinely — the map's top edge is 55 design px from it), and
    // releasing the peek there kills the drag for the rest of its life: the id no longer matches, so
    // coming back onto the map does nothing and the player has to lift and touch again. A peek cannot
    // misfire the way a pull can, so there is nothing for GAME_OUT to protect here; every ending that
    // really ends the contact arrives as pointerup / pointerupoutside / pointercancel / blur.
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.peekPointer === null || p.id !== this.peekPointer) return;
    this.peekAt(p);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.peekPointer === null || p.id !== this.peekPointer) return;
    this.peekPointer = null;
    this.applyPeek();
  }

  /** css px → design px → minimap px (clamped to the DRAWN map) → world, then `setPeek`. */
  private peekAt(p: Phaser.Input.Pointer): void {
    const model = this.model;
    if (!model) return;
    const s = this.ctx.scale;
    const mx = clamp((p.x - s.offsetX) / s.zoom - this.root.x, 0, model.w);
    const my = clamp((p.y - s.offsetY) / s.zoom - this.root.y, 0, model.h);
    this.ctx.world.setPeek(minimapToWorld({ x: mx, y: my }, model));
  }

  /** Whatever is holding the peek right now wins; nothing holding it means the view glides back. */
  private applyPeek(): void {
    const key = this.keys.current;
    if (key) {
      this.ctx.world.setPeek(key);
      return;
    }
    if (this.peekPointer === null) this.ctx.world.setPeek(null);
  }

  private release(): void {
    if (!this.peeking) return;
    this.peekPointer = null;
    this.keys.clear();
    this.ctx.world.setPeek(null);
  }

  /** Called every frame by HudScene; only the TRANSITIONS do anything. */
  setVisible(value: boolean): void {
    if (this.hidden === !value) return;
    this.hidden = !value;
    this.root.setVisible(value);
    if (value) {
      this.zone.setInteractive();
      return;
    }
    this.zone.disableInteractive();
    this.release();
    // A screen or the pause menu is taking the glass, and with it the world's step: `setPeek(null)`
    // alone would leave the offset frozen where it was and glide home only after the player resumed.
    // She stopped looking around the moment the menu opened, so the view goes home now.
    this.ctx.world.clearPeek();
  }

  destroy(): void {
    unregisterDebugButton(this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onWindowRelease);
    window.removeEventListener('pointercancel', this.onWindowRelease);
    this.keys.destroy();
    this.release();
    this.root.destroy(true);
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
