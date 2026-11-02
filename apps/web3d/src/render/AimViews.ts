/**
 * The slingshot's channels (DECISIONS-v1.2 D2, GDD §2.7, §8), ported from `apps/web/src/render/`:
 * the rubber band, the pull ring around Bur, the orbiting bubbles and the dotted guide with its edge
 * chevron. They read the snapshot and predict nothing.
 *
 * All of them sit exactly on the play plane with depth testing off: on Z = 0 the projection is exact, and
 * the §7 golden rule ("nothing may cover the dotted guide") becomes a matter of render order.
 *
 * `aimOrigin !== null`, never `state === 'AIMING'`, decides whether they show: a rest capture parks a
 * live aim in RESTING for one step, and the channels must not blink under a finger that never moved.
 */
import * as THREE from 'three';
import type { PointerInput, Vec2, WorldSnapshot } from '@deeply-bubbly/core';
import type { Settings } from '../context';
import { UI } from '../palette';
import { GEO } from './materials';
import { PX, wx, wy } from './Stage';

const RENDER_ORDER = { orbit: 20, band: 21, ring: 22, trajectory: 23 } as const;
const MAX_DOTS = 16;
const DOT_R_PX = 1.3;
const EDGE_INSET = 3;
const CHEVRON_H = 5;
const FORK_R = 3;
const CROSS_R = 9;
const BAND_PX = 1;
const RING_GAP = 4;
const RING_SEGMENTS = 48;
const ORBIT_COUNT = 3;
const ORBIT_GAP = 7;
const ORBIT_SLOW_RPS = 0.35;
const ORBIT_FAST_RPS = 2.4;
const FOAM = 0xe8f6f3;

function overlayMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false });
}

function overlayMesh(geometry: THREE.BufferGeometry, color: number, order: number): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const mesh = new THREE.Mesh(geometry, overlayMaterial(color));
  mesh.renderOrder = order;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

/** A 1-tall box is laid between two world points in design px. */
function placeSegment(mesh: THREE.Mesh, ax: number, ay: number, bx: number, by: number, thicknessPx: number): void {
  const dx = wx(bx - ax);
  const dy = wy(by - ay);
  mesh.position.set((wx(ax) + wx(bx)) / 2, (wy(ay) + wy(by)) / 2, 0);
  mesh.rotation.z = Math.atan2(dy, dx);
  mesh.scale.set(Math.hypot(dx, dy), thicknessPx * PX, 1);
  mesh.visible = true;
}

class Trajectory {
  private readonly dots: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly chevron: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  constructor(root: THREE.Group, private readonly settings: Settings) {
    for (let i = 0; i < MAX_DOTS; i++) {
      const dot = overlayMesh(GEO.disc, UI.white, RENDER_ORDER.trajectory);
      dot.scale.setScalar(DOT_R_PX * PX);
      this.dots.push(dot);
      root.add(dot);
    }
    const shape = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-0.66, 1, 0),
      new THREE.Vector3(-0.66, -1, 0),
    ]);
    this.chevron = overlayMesh(shape, UI.white, RENDER_ORDER.trajectory);
    this.chevron.scale.setScalar(CHEVRON_H * PX);
    root.add(this.chevron);
  }

  update(snapshot: WorldSnapshot): void {
    const path = snapshot.trajectory;
    const assisted = this.settings.assistedTrajectory;
    const wanted = assisted ? MAX_DOTS : Math.min(MAX_DOTS, Math.max(0, snapshot.trajectoryDots));
    // `aimOrigin` too: `cancelAim` ends a pull outside a step, so a paused world keeps its last arc.
    if (path.length < 2 || wanted === 0 || snapshot.bubble.aimOrigin === null) {
      this.hideFrom(0);
      this.chevron.visible = false;
      return;
    }
    const valid = snapshot.bubble.aimOrigin === null || snapshot.bubble.aimValid;
    const colour = valid ? UI.white : UI.amber;
    const baseAlpha = valid ? 0.9 : 0.45;
    // Index 0 is Bur herself, so there are `path.length - 1` distinct positions to sample.
    const count = Math.min(wanted, path.length - 1);
    for (let i = 0; i < count; i++) {
      const u = (i + 1) / count;
      const point = path[Math.min(path.length - 1, Math.round(u * (path.length - 1)))];
      const dot = this.dots[i];
      if (!point || !dot) continue;
      dot.visible = true;
      dot.position.set(wx(point.x), wy(point.y), 0);
      dot.material.color.setHex(colour);
      dot.material.opacity = baseAlpha * (i === 0 ? 1 : 0.85 - (i / count) * 0.3);
    }
    this.hideFrom(count);
    this.placeChevron(snapshot, path[path.length - 1], colour, baseAlpha);
  }

  /** When the arc's last point is outside the DRAWN view: a chevron on that edge, at that depth. */
  private placeChevron(snapshot: WorldSnapshot, last: Vec2 | undefined, colour: number, alpha: number): void {
    const cam = snapshot.camera;
    const left = cam.renderX;
    const right = cam.renderX + cam.viewW;
    if (!last || (last.x >= left && last.x <= right)) {
      this.chevron.visible = false;
      return;
    }
    const toRight = last.x > right;
    const x = toRight ? right - EDGE_INSET : left + EDGE_INSET;
    const y = Math.min(cam.renderY + cam.viewH - CHEVRON_H, Math.max(cam.renderY + CHEVRON_H, last.y));
    const c = this.chevron;
    c.visible = true;
    c.position.set(wx(x), wy(y), 0);
    c.rotation.z = toRight ? 0 : Math.PI;
    c.material.color.setHex(colour);
    c.material.opacity = alpha;
  }

  private hideFrom(index: number): void {
    for (let i = index; i < this.dots.length; i++) {
      const dot = this.dots[i];
      if (dot) dot.visible = false;
    }
  }
}

class ChargeRing {
  private readonly track: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly fill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  constructor(root: THREE.Group) {
    this.track = overlayMesh(new THREE.RingGeometry(0.94, 1.0, RING_SEGMENTS), UI.dim, RENDER_ORDER.ring);
    this.track.material.opacity = 0.55;
    // thetaStart at the top, running clockwise (mirrored on X), so `drawRange` fills it like a gauge.
    const fill = new THREE.RingGeometry(0.88, 1.06, RING_SEGMENTS, 1, Math.PI / 2, Math.PI * 2);
    this.fill = overlayMesh(fill, UI.white, RENDER_ORDER.ring);
    this.fill.material.side = THREE.DoubleSide;
    root.add(this.track, this.fill);
  }

  update(snapshot: WorldSnapshot): void {
    const b = snapshot.bubble;
    const hud = snapshot.hud;
    if (b.aimOrigin === null) {
      this.track.visible = false;
      this.fill.visible = false;
      return;
    }
    const radius = Math.max(6, b.radius + RING_GAP) * PX;
    const x = wx(b.pos.x);
    const y = wy(b.pos.y);
    this.track.visible = true;
    this.track.position.set(x, y, 0);
    this.track.scale.setScalar(radius);
    // Inside the cancel radius the track is all there is: no arc to promise a shot that will be refused.
    if (hud.cancelZone || hud.power <= 0) {
      this.fill.visible = false;
      return;
    }
    const t = snapshot.timeMs;
    let colour: number = UI.white;
    let alpha = 0.95;
    if (hud.lastPip) {
      colour = UI.softRed;
      alpha = 0.5 + 0.5 * Math.abs(Math.sin(t / 140));
    } else if (!b.aimValid) {
      colour = UI.amber;
      alpha = 0.55 + 0.45 * Math.abs(Math.sin(t / 110));
    }
    this.fill.visible = true;
    this.fill.position.set(x, y, 0);
    this.fill.scale.set(-radius, radius, 1);
    this.fill.material.color.setHex(colour);
    this.fill.material.opacity = alpha;
    this.fill.geometry.setDrawRange(0, 6 * Math.max(1, Math.round(Math.min(1, hud.power) * RING_SEGMENTS)));
  }
}

class SlingBand {
  private readonly fork: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly line: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly grip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly crossA: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly crossB: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly parts: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  /** Viewport design px of the first touch of this gesture; see `apps/web/src/render/SlingBand.ts`. */
  private origin: Vec2 | null = null;

  constructor(root: THREE.Group) {
    this.fork = overlayMesh(new THREE.RingGeometry(0.72, 1, 20), UI.white, RENDER_ORDER.band);
    this.fork.scale.setScalar(FORK_R * PX);
    this.line = overlayMesh(GEO.plane, UI.white, RENDER_ORDER.band);
    this.grip = overlayMesh(GEO.disc, UI.white, RENDER_ORDER.band);
    this.grip.scale.setScalar(1.6 * PX);
    this.crossA = overlayMesh(GEO.plane, UI.dim, RENDER_ORDER.band);
    this.crossB = overlayMesh(GEO.plane, UI.dim, RENDER_ORDER.band);
    this.parts = [this.fork, this.line, this.grip, this.crossA, this.crossB];
    root.add(...this.parts);
  }

  /** `pointer` is the live sample in viewport design px, the same one handed to `world.update`. */
  update(snapshot: WorldSnapshot, pointer: Readonly<PointerInput>): void {
    const b = snapshot.bubble;
    if (b.aimOrigin === null) {
      this.origin = null;
      for (const part of this.parts) part.visible = false;
      return;
    }
    // First frame of the gesture: core froze its origin from exactly this pointer sample. Latched in
    // viewport px and re-converted with the camera being DRAWN, so the band stays pinned to the glass.
    if (this.origin === null) this.origin = { x: pointer.x, y: pointer.y };
    const cam = snapshot.camera;
    const ox = this.origin.x + cam.renderX;
    const oy = this.origin.y + cam.renderY;
    const fx = pointer.x + cam.renderX;
    const fy = pointer.y + cam.renderY;
    const cancel = snapshot.hud.cancelZone;
    const colour = cancel ? UI.dim : b.aimValid ? UI.white : UI.amber;
    const alpha = cancel ? 0.5 : 0.85;

    for (const part of this.parts) {
      part.material.color.setHex(colour);
      part.material.opacity = alpha;
    }
    this.fork.visible = true;
    this.fork.position.set(wx(ox), wy(oy), 0);
    this.line.visible = !cancel;
    this.grip.visible = !cancel;
    this.crossA.visible = cancel;
    this.crossB.visible = cancel;
    if (cancel) {
      // D2: "es el equivalente a devolver el pájaro a la horquilla". No band, and an X over the fork.
      placeSegment(this.crossA, ox - CROSS_R, oy - CROSS_R, ox + CROSS_R, oy + CROSS_R, BAND_PX);
      placeSegment(this.crossB, ox - CROSS_R, oy + CROSS_R, ox + CROSS_R, oy - CROSS_R, BAND_PX);
      return;
    }
    placeSegment(this.line, ox, oy, fx, fy, BAND_PX);
    this.grip.position.set(wx(fx), wy(fy), 0);
  }
}

class ChargeOrbit {
  private readonly dots: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private phase = 0;

  constructor(root: THREE.Group) {
    for (let i = 0; i < ORBIT_COUNT; i++) {
      const dot = overlayMesh(GEO.disc, FOAM, RENDER_ORDER.orbit);
      dot.scale.setScalar(0.9 * PX);
      this.dots.push(dot);
      root.add(dot);
    }
  }

  update(snapshot: WorldSnapshot, dtMs: number): void {
    const b = snapshot.bubble;
    if (b.aimOrigin === null) {
      for (const dot of this.dots) dot.visible = false;
      return;
    }
    const power = Math.min(1, Math.max(0, snapshot.hud.power));
    const rps = ORBIT_SLOW_RPS + (ORBIT_FAST_RPS - ORBIT_SLOW_RPS) * power;
    this.phase = (this.phase + (rps * dtMs) / 1000) % 1;
    const radius = b.radius + ORBIT_GAP;
    this.dots.forEach((dot, i) => {
      const angle = (this.phase + i / ORBIT_COUNT) * Math.PI * 2;
      dot.visible = true;
      dot.position.set(wx(b.pos.x + Math.cos(angle) * radius), wy(b.pos.y + Math.sin(angle) * radius * 0.75), 0);
      dot.material.opacity = 0.35 + 0.45 * power;
    });
  }
}

export class AimViews {
  readonly root = new THREE.Group();
  private readonly trajectory: Trajectory;
  private readonly ring: ChargeRing;
  private readonly band: SlingBand;
  private readonly orbit: ChargeOrbit;

  constructor(settings: Settings) {
    this.trajectory = new Trajectory(this.root, settings);
    this.ring = new ChargeRing(this.root);
    this.band = new SlingBand(this.root);
    this.orbit = new ChargeOrbit(this.root);
  }

  sync(snapshot: WorldSnapshot, pointer: Readonly<PointerInput>, dtMs: number): void {
    this.ring.update(snapshot);
    this.orbit.update(snapshot, dtMs);
    this.band.update(snapshot, pointer);
    this.trajectory.update(snapshot);
  }
}
