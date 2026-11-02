/**
 * The world map, which IS the main menu (docs/design/WORLD-MAP.md). Nothing of the game runs behind it.
 *
 * What it knows: `worlds()` + `levelStatuses()` from core decide every node's state from the save; this
 * only paints them. What it does: emits 'newRun' with the checkpoint core says that level starts from.
 * A locked node says no with a shake and nothing else.
 *
 * The drag is read here, not left to the browser: a native scroll swallows every touch that lands while it
 * runs, and a second finger tapping a node has to count, as in `apps/web`. One contact scrolls; a contact
 * that travels stops being a tap on its own (`Button`), whichever finger made it. The wheel stays native.
 */
import { levelStatuses, worlds } from '@deeply-bubbly/core';
import type { LevelStatus, WorldDef, WorldId, ZoneIndex } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { UI, ZONE_PALETTES, css } from '../palette';
import { Button, el } from './dom';
import { soundLabel, toggleSound } from './PauseMenu';
import { S } from './strings';

const GAME_TITLE = 'Deeply Bubbly';
const NODE_GAP = 34;
const NODE_R = 9;
const PATH_AMPLITUDE = 34;
const PATH_STEP = 0.85;
const PATH_PHASE = 0.5;
const TITLE_Y = 26;
const ISLAND_Y = 58;
const PATH_TOP = 124;
const TRENCH_H = 96;

const WORLD_NAMES: Readonly<Record<WorldId, string>> = {
  'amber-ocean': S.worldAmberOcean,
  volcano: S.worldVolcano,
  'loch-ness': S.worldLochNess,
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export class MapMenu {
  readonly root: HTMLDivElement;
  private readonly scroller: HTMLDivElement;
  private readonly statuses: LevelStatus[];
  private readonly nodeY: number[] = [];
  private readonly viewW: number;
  private dragId: number | null = null;
  private dragFrom = 0;
  private dragScroll = 0;

  constructor(parent: HTMLElement, private readonly ctx: GameContext) {
    this.viewW = ctx.scale.viewW;
    this.root = el('div', 'map', parent);
    // What shows above the content when the notch pushes it down.
    this.root.style.background = css(ZONE_PALETTES[0].waterTop);
    this.scroller = el('div', 'map-scroll', this.root);
    const content = el('div', 'map-content', this.scroller);

    const all = worlds(ctx.campaign.immersions.length);
    const world = all[0];
    if (!world) throw new Error('the world registry is empty');
    this.statuses = levelStatuses(world, ctx.save);
    const height = PATH_TOP + this.statuses.length * NODE_GAP + TRENCH_H;
    content.style.height = `${height}px`;
    content.style.background = this.gradient(height);

    el('div', 'map-title', content, GAME_TITLE).style.top = `${TITLE_Y}px`;
    this.buildIslands(content, all);
    const positions = this.statuses.map((_, i) => this.nodeAt(i));
    this.buildPath(content, positions, height);
    this.statuses.forEach((status, i) => this.buildNode(content, status, positions[i] ?? { x: 0, y: 0 }));

    const sound: Button = new Button({
      id: 'map.sound',
      label: soundLabel(ctx),
      tone: 'ghost',
      className: 'btn-small map-sound',
      parent: this.root,
      onTap: () => sound.setLabel(toggleSound(ctx)),
    });
    this.scroller.addEventListener('pointerdown', this.onDragStart);
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragEnd);
    window.addEventListener('pointercancel', this.onDragEnd);
    this.scrollToCurrent();
  }

  private readonly onDragStart = (e: PointerEvent): void => {
    if (this.dragId !== null) return;
    this.dragId = e.pointerId;
    this.dragFrom = e.clientY;
    this.dragScroll = this.scroller.scrollTop;
  };

  private readonly onDragMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragId) return;
    this.scroller.scrollTop = this.dragScroll - (e.clientY - this.dragFrom) / this.ctx.scale.zoom;
  };

  private readonly onDragEnd = (e: PointerEvent): void => {
    if (e.pointerId === this.dragId) this.dragId = null;
  };

  private nodeAt(i: number): { x: number; y: number } {
    const y = PATH_TOP + i * NODE_GAP;
    this.nodeY[i] = y;
    return { x: this.viewW / 2 + PATH_AMPLITUDE * Math.sin(i * PATH_STEP + PATH_PHASE), y };
  }

  /** Each zone tints its stretch of the map, so the descent reads from far away. */
  private gradient(height: number): string {
    const stops: string[] = [`${css(ZONE_PALETTES[0].waterTop)} 0`];
    let zone: ZoneIndex = 0;
    this.statuses.forEach((status, i) => {
      if (status.level.zone === zone) return;
      zone = status.level.zone;
      stops.push(`${css(ZONE_PALETTES[zone].waterTop)} ${Math.round(((PATH_TOP + i * NODE_GAP) / height) * 100)}%`);
    });
    stops.push(`${css(ZONE_PALETTES[zone].waterBottom)} 100%`);
    return `linear-gradient(180deg, ${stops.join(', ')})`;
  }

  private buildIslands(content: HTMLElement, all: readonly WorldDef[]): void {
    const row = el('div', 'map-islands', content);
    row.style.top = `${ISLAND_Y}px`;
    for (const world of all) {
      const button: Button = new Button({
        id: `map.world.${world.id}`,
        label: WORLD_NAMES[world.id],
        tone: 'ghost',
        className: `island ${world.playable ? 'island-open' : 'island-locked'}`,
        parent: row,
        onTap: () => (world.playable ? this.scrollToCurrent() : refuse(button.root)),
      });
      button.root.dataset['dbState'] = world.playable ? 'available' : 'locked';
    }
  }

  private buildPath(content: HTMLElement, positions: readonly { x: number; y: number }[], height: number): void {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'map-path');
    svg.setAttribute('viewBox', `0 0 ${this.viewW} ${height}`);
    svg.setAttribute('width', String(this.viewW));
    svg.setAttribute('height', String(height));
    const open = this.statuses.findIndex((s) => s.state === 'locked' || s.state === 'noContent');
    const reached = open < 0 ? positions.length : open;
    const line = (from: number, to: number, stroke: string, dash: string): void => {
      const points = positions.slice(from, to).map((p) => `${p.x},${p.y}`);
      if (points.length < 2) return;
      const polyline = document.createElementNS(SVG_NS, 'polyline');
      polyline.setAttribute('points', points.join(' '));
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', stroke);
      polyline.setAttribute('stroke-width', '2');
      polyline.setAttribute('stroke-dasharray', dash);
      polyline.setAttribute('stroke-linecap', 'round');
      svg.appendChild(polyline);
    };
    line(Math.max(0, reached - 1), positions.length, 'rgba(255,255,255,.3)', '1 5');
    line(0, reached, css(UI.amber), '');
    content.appendChild(svg);
  }

  private buildNode(content: HTMLElement, status: LevelStatus, at: { x: number; y: number }): void {
    const index = status.level.index;
    const label = status.state === 'noContent' ? '?' : String(index + 1);
    const button: Button = new Button({
      id: `map.level.${index + 1}`,
      label,
      tone: 'ghost',
      className: `node node-${status.state}${status.current ? ' node-current' : ''}`,
      parent: content,
      onTap: () => this.enter(status, button.root),
    });
    const node = button.root;
    node.dataset['dbState'] = status.state;
    node.style.left = `${at.x - NODE_R}px`;
    node.style.top = `${at.y - NODE_R}px`;
    if (status.state === 'completed') {
      const shells = el('span', 'node-shells', node);
      for (let i = 0; i < 3; i++) el('i', i < status.shells ? 'on' : '', shells);
    }
  }

  private enter(status: LevelStatus, node: HTMLElement): void {
    if (status.state !== 'available' && status.state !== 'completed') {
      refuse(node);
      return;
    }
    this.ctx.bus.emit('newRun', { startStationIndex: status.startStationIndex });
  }

  /** Opens on the deepest node the player can enter: "where was I" answered before asking. */
  private scrollToCurrent(): void {
    const index = this.statuses.findIndex((s) => s.current);
    const y = index >= 0 ? this.nodeY[index] : undefined;
    if (y !== undefined) this.scroller.scrollTop = y - this.ctx.scale.viewH / 2;
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    window.removeEventListener('pointercancel', this.onDragEnd);
    this.root.remove();
  }
}

function refuse(node: HTMLElement): void {
  node.animate(
    [{ translate: '0' }, { translate: '3px' }, { translate: '-3px' }, { translate: '2px' }, { translate: '0' }],
    { duration: 240 },
  );
}
