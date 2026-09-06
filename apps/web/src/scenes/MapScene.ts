/**
 * The world map, which IS the main menu (docs/design/WORLD-MAP.md). A scene of its own, not an
 * overlay: nothing of the game is running behind it — `main.ts` stops Game and Hud before starting
 * this — so it owns the whole screen, its own scroll and nothing else.
 *
 * What it knows: `worlds()` + `levelStatuses()` from core decide every node's state from the save
 * (§4: "es la ÚNICA fuente de verdad del desbloqueo; el mapa solo la pinta"). What it does: emits
 * 'newRun' with the checkpoint that level starts from, exactly as the old start screen did.
 *
 * Scrolling is a container offset, not a camera scroll: the sound button has to stay put while the
 * ocean moves under it, and one moving container is cheaper to reason about than two cameras. The
 * drag is read at SCENE level so a finger may start it anywhere — on the water or on a node — and
 * the nodes ask `dragging(id)` before firing, which is what tells a tap from a scroll.
 */
import Phaser from 'phaser';
import { levelStatuses, worlds } from '@deeply-bubbly/core';
import type { LevelStatus } from '@deeply-bubbly/core';
import { getContext } from '../context';
import type { GameContext } from '../context';
import { UI, ZONE_PALETTES, css } from '../palette';
import { layoutCamera } from '../scale';
import { Button } from '../ui/Button';
import { MapNode } from '../ui/map/MapNode';
import { MapPath } from '../ui/map/MapPath';
import { WorldIslands } from '../ui/map/WorldIslands';
import { mapGeometry } from '../ui/map/geometry';
import type { MapGeometry } from '../ui/map/geometry';
import { ensureMapTextures } from '../ui/map/mapTextures';
import type { HudLayout } from '../ui/layout';
import { computeLayout, setSafeAreaInsetTopCss } from '../ui/layout';
import { pixelText } from '../ui/text';
import { soundLabel, toggleSound } from '../ui/soundToggle';

export const MAP_SCENE_KEY = 'Map';

/** The game's name: a proper noun, not translated, and outside the < 40 word budget of pillar 5. */
const GAME_TITLE = 'Deeply Bubbly';
/** Design px a contact may travel and still count as a tap on a node. */
const TAP_SLOP = 4;
/** Design px scrolled per wheel notch on a desktop browser. */
const WHEEL_SCALE = 0.5;
/** Design px kept between the title and the sound switch that shares the top band with it. */
const TITLE_CLEARANCE = 2;

export class MapScene extends Phaser.Scene {
  private ctx!: GameContext;
  private layoutRef!: HudLayout;
  private geom!: MapGeometry;
  /** Everything that scrolls. Its y is `-scrollY`. */
  private content!: Phaser.GameObjects.Container;
  private path!: MapPath;
  private title!: Phaser.GameObjects.Text;
  private islands!: WorldIslands;
  private nodes: MapNode[] = [];
  private soundButton!: Button;
  private scrollY = 0;
  /** Id of the contact that is dragging the map, and how far it has travelled in design px. */
  private dragId: number | null = null;
  private dragFrom = 0;
  private dragScroll = 0;
  /**
   * How far each live contact has travelled, in design px, BY POINTER ID. One number for the whole
   * scene would let a finger that is scrolling veto a tap made with the other one, and the game runs
   * with two active pointers on purpose (`main.ts`).
   */
  private readonly dragDist = new Map<number, number>();

  constructor() {
    super(MAP_SCENE_KEY);
  }

  create(): void {
    this.ctx = getContext(this);
    this.layoutRef = computeLayout(this.ctx.scale);
    layoutCamera(this.cameras.main, this.ctx.scale);
    this.cameras.main.setBackgroundColor(css(ZONE_PALETTES[0].waterBottom));
    ensureMapTextures(this);

    // The campaign decides how many levels are BUILT; core decides which of them are open.
    const all = worlds(this.ctx.campaign.immersions.length);
    const world = all[0];
    if (!world) throw new Error('the world registry is empty');
    const statuses = levelStatuses(world, this.ctx.save);
    this.geom = mapGeometry(this.layoutRef.viewW, statuses.length, all.length, this.layoutRef.touch);

    this.content = this.add.container(0, 0);
    this.path = new MapPath(this, this.content, this.geom, statuses);
    this.addTitle();
    const deps = {
      dragging: (pointerId: number): boolean => (this.dragDist.get(pointerId) ?? 0) > TAP_SLOP,
      onScreen: (y: number): boolean => this.onScreen(y),
    };
    this.islands = new WorldIslands(this, this.content, all, this.geom.islands, this.layoutRef, deps);
    this.buildNodes(statuses, deps);
    this.addSoundButton();

    this.bindScroll();
    this.setScroll(this.startScroll(statuses));

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown, this);
  }

  private addTitle(): void {
    this.title = pixelText(this, {
      x: Math.round(this.geom.viewW / 2),
      y: this.geom.titleY,
      text: GAME_TITLE,
      size: 12,
      zoom: this.layoutRef.zoom,
      // White, not the UI cyan of the old title card: this one is read against bright turquoise.
      color: UI.white,
      originX: 0.5,
      originY: 0.5,
    });
    this.content.add(this.title);
    this.placeTitle();
  }

  /**
   * The game's name is centred in the column, but the sound switch is nailed to the same top band and
   * is drawn on top of it (it does not scroll): so the title gives way to the switch and slides just
   * far enough left to clear its whole touch zone. Measured, not guessed — the glyph width depends on
   * the system monospace the device happens to have.
   */
  private placeTitle(): void {
    const slot = this.soundSlot();
    const reserved = Math.max(slot.w, this.layoutRef.touch);
    const limit = slot.x - reserved / 2 - TITLE_CLEARANCE;
    const half = this.title.displayWidth / 2;
    const centred = Math.round(this.geom.viewW / 2);
    const floor = Math.round(this.layoutRef.margin + half);
    this.title.setX(Math.max(floor, Math.min(centred, Math.round(limit - half))));
  }

  private buildNodes(
    statuses: readonly LevelStatus[],
    deps: { dragging: (pointerId: number) => boolean; onScreen: (y: number) => boolean },
  ): void {
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      const at = this.geom.nodes[i];
      if (!status || !at) continue;
      this.nodes.push(
        new MapNode(this, this.content, status, at, { ...this.layoutRef, nodeGap: this.geom.gap }, {
          ...deps,
          onEnter: (s) => this.enter(s),
        }),
      );
    }
  }

  /** Top-right, fixed: the map is the main menu, so its one setting has to be reachable from here. */
  private addSoundButton(): void {
    this.soundButton = new Button(this, {
      id: 'map.sound',
      ...this.soundSlot(),
      zoom: this.layoutRef.zoom,
      touch: this.layoutRef.touch,
      label: soundLabel(this.ctx),
      size: 8,
      tone: 'ghost',
      onTap: () => this.soundButton.setLabel(toggleSound(this.ctx)),
    });
  }

  private soundSlot(): { x: number; y: number; w: number; h: number } {
    const w = 42;
    const h = 14;
    return {
      x: this.layoutRef.viewW - this.layoutRef.margin - Math.round(w / 2),
      y: this.layoutRef.top + Math.round(h / 2),
      w,
      h,
    };
  }

  /**
   * Enter a level: throw the world away and build one at the checkpoint core says this level starts
   * from (`startStationIndex`, -1 = surface). The map never writes to the save and never decides the
   * checkpoint itself — this is the same channel and the same payload the start screen used.
   */
  private enter(status: LevelStatus): void {
    // Core gives every node a startStationIndex, enterable or not, so the guard is repeated here:
    // the only thing between a '?' node and a run from the surface must not be one `if` in MapNode.
    if (status.state !== 'available' && status.state !== 'completed') return;
    this.ctx.bus.emit('newRun', { startStationIndex: status.startStationIndex });
  }

  // ---------------------------------------------------------------------------------------------

  /** Opens on the deepest node the player can enter, centred: "where was I" answered before asking. */
  private startScroll(statuses: readonly LevelStatus[]): number {
    const index = statuses.findIndex((s) => s.current);
    const node = index >= 0 ? this.geom.nodes[index] : undefined;
    if (!node) return 0;
    return node.y - this.layoutRef.viewH / 2;
  }

  private get maxScroll(): number {
    return Math.max(0, this.geom.height - this.layoutRef.viewH);
  }

  private setScroll(value: number): void {
    this.scrollY = Math.min(this.maxScroll, Math.max(0, value));
    this.content.setY(-Math.round(this.scrollY));
  }

  private onScreen(y: number): boolean {
    const top = this.scrollY;
    return y >= top && y <= top + this.layoutRef.viewH;
  }

  private bindScroll(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    // Desktop only; a phone never sends it.
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_p: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
        this.setScroll(this.scrollY + dy * WHEEL_SCALE);
      },
    );
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    // Every contact starts as a tap, including one that lands while another finger is scrolling.
    this.dragDist.set(p.id, 0);
    if (this.dragId !== null) return;
    this.dragId = p.id;
    this.dragFrom = p.y;
    this.dragScroll = this.scrollY;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.dragId === null || p.id !== this.dragId) return;
    const dy = (p.y - this.dragFrom) / Math.max(1, this.ctx.scale.zoom);
    this.dragDist.set(p.id, Math.max(this.dragDist.get(p.id) ?? 0, Math.abs(dy)));
    this.setScroll(this.dragScroll - dy);
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.dragId === null || p.id !== this.dragId) return;
    this.dragId = null;
    // This contact's distance is deliberately left standing: the nodes read it in their own 'pointerup', which
    // Phaser dispatches BEFORE this one, and the next contact resets it on its way down.
  }

  /**
   * A height change only re-clamps the scroll; a ZOOM change is rebuilt from scratch. Every glyph on
   * the map is baked at the zoom it was created with (`ui/text.ts`) and every touch target is sized
   * from it, so re-laying out a map built for zoom 2 inside a zoom 3 column leaves blurred numbers and
   * hit areas that are 33 % too small. The map has no state worth keeping across it: `create()` opens
   * on the current node again.
   */
  private onResize(): void {
    setSafeAreaInsetTopCss(null);
    const next = computeLayout(this.ctx.scale);
    if (next.zoom !== this.layoutRef.zoom) {
      this.scene.restart();
      return;
    }
    this.layoutRef = next;
    layoutCamera(this.cameras.main, this.ctx.scale);
    const slot = this.soundSlot();
    this.soundButton.setPosition(slot.x, slot.y);
    this.placeTitle();
    this.setScroll(this.scrollY);
  }

  private teardown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    for (const node of this.nodes) node.destroy();
    this.nodes = [];
    this.islands.destroy();
    this.path.destroy();
    this.soundButton.destroy();
  }
}
