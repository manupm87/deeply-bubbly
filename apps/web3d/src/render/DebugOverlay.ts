/**
 * Debug only (`?debug=1`, then `__db.shell.setCollisionOverlay(true)`): the collision rectangles core
 * runs, drawn over the models, so a screenshot shows whether a model and its box agree. Never in a
 * normal frame: it is not even constructed until asked for.
 */
import * as THREE from 'three';
import { hazardActiveAt, hazardRectAt, solidRectAt } from '@deeply-bubbly/core';
import type { WorldSnapshot } from '@deeply-bubbly/core';
import { wx, wy } from './Stage';

const MAX_SEGMENTS = 2000;

export class DebugOverlay {
  readonly lines: THREE.LineSegments;
  private readonly positions = new Float32Array(MAX_SEGMENTS * 6);
  private readonly colors = new Float32Array(MAX_SEGMENTS * 6);
  private n = 0;
  private readonly color = new THREE.Color();

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, fog: false }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1000;
  }

  private segment(x0: number, y0: number, x1: number, y1: number): void {
    if (this.n >= MAX_SEGMENTS) return;
    const at = this.n++ * 6;
    // Z = 0 on purpose: the box is drawn on the play plane, where core's rectangle lives.
    this.positions.set([wx(x0), wy(y0), 0, wx(x1), wy(y1), 0], at);
    this.colors.set([this.color.r, this.color.g, this.color.b, this.color.r, this.color.g, this.color.b], at);
  }

  private rect(x: number, y: number, w: number, h: number, hex: number): void {
    this.color.setHex(hex);
    this.segment(x, y, x + w, y);
    this.segment(x + w, y, x + w, y + h);
    this.segment(x + w, y + h, x, y + h);
    this.segment(x, y + h, x, y);
  }

  update(snapshot: WorldSnapshot): void {
    this.n = 0;
    const t = snapshot.timeMs;
    for (const e of snapshot.entities) {
      if (e.type === 'ceiling' || e.type === 'wall') {
        const r = solidRectAt(e, t);
        this.rect(r.x, r.y, r.w, r.h, e.type === 'wall' ? 0xffff00 : 0x00ff66);
      } else if (e.type === 'hazard') {
        const r = hazardRectAt(e, t);
        this.rect(r.x, r.y, r.w, r.h, hazardActiveAt(e, t) ? 0xff0000 : 0xff9999);
      } else if (e.type === 'pickup') {
        this.rect(e.pos.x - e.radius, e.pos.y - e.radius, e.radius * 2, e.radius * 2, 0xff00ff);
      }
    }
    const b = snapshot.bubble;
    this.rect(b.pos.x - b.radius, b.pos.y - b.radius, b.radius * 2, b.radius * 2, 0xffffff);
    const geometry = this.lines.geometry;
    geometry.setDrawRange(0, this.n * 2);
    (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
