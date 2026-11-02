/**
 * Where to go next. D3 makes the next ledge often sit off the side of the view, and a newcomer has no
 * reason to know the minimap can look for it: while Bur can shoot, a chevron at the edge points at it, or a
 * soft ring marks it when it is already in view. Nothing is decided here: it reads the snapshot's anchors.
 */
import type { WorldSnapshot } from '@deeply-bubbly/core';
import { nextTarget } from '../render/shotForecast';
import { el } from './dom';
import type { HudLayout } from './layout';

const EDGE_INSET = 9;
const TOP_MARGIN = 0.18;
const BOTTOM_MARGIN = 0.94;

export class TargetHint {
  private readonly arrow: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private layoutRef: HudLayout;

  constructor(parent: HTMLElement, layout: HudLayout) {
    this.layoutRef = layout;
    this.arrow = el('div', 'target-arrow', parent);
    this.arrow.dataset['testid'] = 'target-arrow';
    this.ring = el('div', 'target-ring', parent);
    this.ring.dataset['testid'] = 'target-ring';
    this.arrow.hidden = true;
    this.ring.hidden = true;
  }

  layout(layout: HudLayout): void {
    this.layoutRef = layout;
  }

  sync(snapshot: WorldSnapshot, hidden: boolean): void {
    const b = snapshot.bubble;
    const canShoot = b.state === 'RESTING' || b.aimOrigin !== null;
    const target = !hidden && canShoot ? nextTarget(snapshot) : null;
    if (target === null) {
      this.arrow.hidden = true;
      this.ring.hidden = true;
      return;
    }
    const { viewW, viewH } = this.layoutRef;
    const cam = snapshot.camera;
    const x = target.x - cam.renderX;
    const y = target.y - cam.renderY;
    const inView = x >= 0 && x <= viewW && y >= 0 && y <= viewH;
    this.ring.hidden = !inView;
    this.arrow.hidden = inView;
    if (inView) {
      this.ring.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      return;
    }
    // The arrow rides the edge the target lies past: sideways when it is off a side, else straight down.
    const ax = Math.min(viewW - EDGE_INSET, Math.max(EDGE_INSET, x));
    const ay = Math.min(viewH * BOTTOM_MARGIN, Math.max(viewH * TOP_MARGIN, y));
    const heading = x < 0 ? Math.PI : x > viewW ? 0 : Math.PI / 2;
    this.arrow.style.transform = `translate(${Math.round(ax)}px, ${Math.round(ay)}px) rotate(${heading}rad)`;
  }
}
