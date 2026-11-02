/**
 * The slingshot's channels (DECISIONS-v1.2 D2, GDD §2.7, §8), ported from `apps/web/src/render/`:
 * the rubber band, the pull ring around Bur, the orbiting bubbles and the dotted guide with its edge
 * chevron. They read the snapshot; the only prediction is `shotForecast`, which runs core's own step.
 *
 * All of them sit exactly on the play plane with depth testing off: on Z = 0 the projection is exact, and
 * the §7 golden rule ("nothing may cover the dotted guide") becomes a matter of render order.
 *
 * `aimOrigin !== null`, never `state === 'AIMING'`, decides whether they show: a rest capture parks a
 * live aim in RESTING for one step, and the channels must not blink under a finger that never moved.
 */
import * as THREE from 'three';
import type { PointerInput, Tuning, Vec2, WorldSnapshot } from '@deeply-bubbly/core';
import type { Settings } from '../context';
import { reducedMotion } from '../fx/motion';
import { UI } from '../palette';
import { GEO } from './materials';
import { forecastAim } from './shotForecast';
import type { ShotForecast } from './shotForecast';
import { PX, wx, wy } from './Stage';

const RENDER_ORDER = { orbit: 20, band: 21, ring: 22, landing: 22, trajectory: 23 } as const;
const MAX_DOTS = 22;
const DOT_SPACING_PX = 11;
const DOT_R_PX = 1.5;
/** A landing the player should go for, and a shot that meets a hazard. */
const LANDING_GOOD = 0x7dffb2;
const LANDING_RISK = UI.softRed;
/** The forecast is rerun when the pull moves, and this often for what moves by itself. */
const FORECAST_MS = 100;
const EDGE_INSET = 3;
const CHEVRON_H = 5;
const FORK_R = 3;
const CROSS_R = 9;
const BAND_PX = 1;
const BAND_LINE_ALPHA = 0.45;
/** The rubber thins as it stretches. */
const BAND_SLACK_PX = 1.7;
const BAND_TAUT_PX = 0.8;
const HUM_FROM = 0.8;
const HUM_PX = 0.7;
const FLARE_MS = 300;
const FLARE_GROW_PX = 9;
const RING_GAP = 4;
const RING_SEGMENTS = 48;
const ORBIT_COUNT = 3;
const ORBIT_GAP = 7;
const ORBIT_SLOW_RPS = 0.35;
const ORBIT_FAST_RPS = 2.4;
const FOAM = 0xe8f6f3;
/** Core draws this many dots in the zones that are told the whole arc (`TRAJECTORY_DOTS`). */
const FULL_ARC_DOTS = 6;

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

  /**
   * With a forecast, the dots run the whole flight, down and back up to the underside it floats into:
   * that rise is the part of the rule nobody guesses. A zone that rations its dots keeps core's prefix.
   */
  update(snapshot: WorldSnapshot, forecast: ShotForecast | null): void {
    if (forecast !== null && snapshot.trajectoryDots >= FULL_ARC_DOTS && snapshot.bubble.aimOrigin !== null) {
      this.drawFlight(forecast, snapshot);
      return;
    }
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

  private drawFlight(forecast: ShotForecast, snapshot: WorldSnapshot): void {
    const valid = snapshot.bubble.aimValid;
    let used = 0;
    let walked = 0;
    let previous = forecast.path[0];
    for (const point of forecast.path) {
      if (!previous) break;
      walked += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
      if (walked < DOT_SPACING_PX) continue;
      walked = 0;
      const dot = this.dots[used];
      if (!dot) break;
      dot.visible = true;
      dot.position.set(wx(point.x), wy(point.y), 0);
      dot.material.color.setHex(valid ? UI.white : UI.amber);
      dot.material.opacity = valid ? 0.9 : 0.5;
      used++;
    }
    this.hideFrom(used);
    this.placeChevron(snapshot, forecast.path[forecast.path.length - 1], valid ? UI.white : UI.amber, 0.9);
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

  update(snapshot: WorldSnapshot, forecast: ShotForecast | null): void {
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
    // The ring is on Bur, where the eyes already are: it says the shot lands even with the ledge far away.
    let colour: number = forecast?.progress && forecast.hazardAt === null ? LANDING_GOOD : UI.white;
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

/**
 * The rubber: two strands from the sides of the fork to the finger. It thins as it stretches, and at the
 * very end of the pull it hums, a tension you can read without looking at the ring.
 */
class SlingBand {
  private readonly fork: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly line: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly line2: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
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
    this.line2 = overlayMesh(GEO.plane, UI.white, RENDER_ORDER.band);
    this.grip = overlayMesh(GEO.disc, UI.white, RENDER_ORDER.band);
    this.crossA = overlayMesh(GEO.plane, UI.dim, RENDER_ORDER.band);
    this.crossB = overlayMesh(GEO.plane, UI.dim, RENDER_ORDER.band);
    this.parts = [this.fork, this.line, this.line2, this.grip, this.crossA, this.crossB];
    root.add(...this.parts);
  }

  /**
   * `pointer` is the live sample in viewport design px, the same one handed to `world.update`. `zoom` is
   * the camera's pull back: the glass then shows more of the plane, so it scales around the view's centre
   * to keep the band under the finger.
   */
  update(snapshot: WorldSnapshot, pointer: Readonly<PointerInput>, zoom: number): void {
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
    const glassX = (x: number): number => cam.renderX + cam.viewW / 2 + (x - cam.viewW / 2) * zoom;
    const glassY = (y: number): number => cam.renderY + cam.viewH / 2 + (y - cam.viewH / 2) * zoom;
    const ox = glassX(this.origin.x);
    const oy = glassY(this.origin.y);
    let fx = glassX(pointer.x);
    let fy = glassY(pointer.y);
    const cancel = snapshot.hud.cancelZone;
    const power = Math.min(1, Math.max(0, snapshot.hud.power));
    const colour = cancel ? UI.dim : b.aimValid ? UI.white : UI.amber;
    const alpha = cancel ? 0.5 : 0.6 + 0.35 * power;

    for (const part of this.parts) {
      part.material.color.setHex(colour);
      part.material.opacity = alpha;
    }
    this.fork.visible = true;
    this.fork.position.set(wx(ox), wy(oy), 0);
    // The rubber stays under the dots: a press below Bur lays it right along the arc she will fly.
    this.line.material.opacity = alpha * BAND_LINE_ALPHA;
    this.line2.material.opacity = alpha * BAND_LINE_ALPHA;
    this.line.visible = !cancel;
    this.line2.visible = !cancel;
    this.grip.visible = !cancel;
    this.crossA.visible = cancel;
    this.crossB.visible = cancel;
    if (cancel) {
      // D2: "es el equivalente a devolver el pájaro a la horquilla". No band, and an X over the fork.
      placeSegment(this.crossA, ox - CROSS_R, oy - CROSS_R, ox + CROSS_R, oy + CROSS_R, BAND_PX);
      placeSegment(this.crossB, ox - CROSS_R, oy + CROSS_R, ox + CROSS_R, oy - CROSS_R, BAND_PX);
      return;
    }
    // Across the band, for where the strands leave the fork.
    const dx = fx - ox;
    const dy = fy - oy;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    if (power > HUM_FROM && !reducedMotion()) {
      const hum = ((power - HUM_FROM) / (1 - HUM_FROM)) * HUM_PX * Math.sin(snapshot.timeMs / 9);
      fx += nx * hum;
      fy += ny * hum;
    }
    const thickness = BAND_SLACK_PX + (BAND_TAUT_PX - BAND_SLACK_PX) * power;
    placeSegment(this.line, ox + nx * FORK_R, oy + ny * FORK_R, fx, fy, thickness);
    placeSegment(this.line2, ox - nx * FORK_R, oy - ny * FORK_R, fx, fy, thickness);
    this.grip.position.set(wx(fx), wy(fy), 0);
    this.grip.scale.setScalar((1.6 + power * 0.7) * PX);
  }
}

/** The ring answers the moment the pull reaches its end: one flare, then still. */
class FullPowerFlare {
  private readonly ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private ageMs = FLARE_MS;
  private wasFull = false;

  constructor(root: THREE.Group) {
    this.ring = overlayMesh(new THREE.RingGeometry(0.9, 1, RING_SEGMENTS), UI.white, RENDER_ORDER.ring);
    root.add(this.ring);
  }

  update(snapshot: WorldSnapshot, dtMs: number): void {
    const b = snapshot.bubble;
    const full = b.aimOrigin !== null && !snapshot.hud.cancelZone && snapshot.hud.power >= 0.995;
    if (full && !this.wasFull) this.ageMs = 0;
    this.wasFull = full;
    this.ageMs += dtMs;
    this.ring.visible = this.ageMs < FLARE_MS && b.aimOrigin !== null;
    if (!this.ring.visible) return;
    const u = this.ageMs / FLARE_MS;
    this.ring.position.set(wx(b.pos.x), wy(b.pos.y), 0);
    this.ring.scale.setScalar((Math.max(6, b.radius + RING_GAP) + u * FLARE_GROW_PX) * PX);
    this.ring.material.opacity = (1 - u) * 0.9;
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

/**
 * The answer to "where do I land?": the underside of the ledge lights up and a ghost of Bur waits under
 * it. Lit means a step down; faint means back to where she is; no mark means she will not rest anywhere.
 */
class LandingMarker {
  private readonly bar: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly ghost: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly warning: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  constructor(root: THREE.Group) {
    this.bar = overlayMesh(GEO.plane, LANDING_GOOD, RENDER_ORDER.landing);
    this.ghost = overlayMesh(new THREE.RingGeometry(0.82, 1, RING_SEGMENTS), LANDING_GOOD, RENDER_ORDER.landing);
    this.warning = overlayMesh(GEO.disc, LANDING_RISK, RENDER_ORDER.landing);
    root.add(this.bar, this.ghost, this.warning);
  }

  update(snapshot: WorldSnapshot, forecast: ShotForecast | null): void {
    const risk = forecast?.hazardAt ?? null;
    this.warning.visible = risk !== null;
    if (risk) {
      this.warning.position.set(wx(risk.x), wy(risk.y), 0);
      this.warning.scale.setScalar(3.4 * PX);
      this.warning.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(snapshot.timeMs / 120));
    }
    const ledge = forecast?.ceiling ?? null;
    const end = forecast?.path[forecast.path.length - 1];
    this.bar.visible = ledge !== null;
    this.ghost.visible = ledge !== null;
    if (!ledge || !end || !forecast) return;
    const good = forecast.progress && risk === null;
    const colour = risk !== null ? LANDING_RISK : good ? LANDING_GOOD : UI.white;
    const alpha = good ? 0.75 + 0.25 * Math.abs(Math.sin(snapshot.timeMs / 160)) : 0.4;
    const r = ledge.rect;
    placeSegment(this.bar, r.x, r.y + r.h, r.x + r.w, r.y + r.h, good ? 2.4 : 1.2);
    this.bar.material.color.setHex(colour);
    this.bar.material.opacity = alpha;
    this.ghost.position.set(wx(end.x), wy(end.y), 0);
    this.ghost.scale.setScalar(snapshot.bubble.radius * PX);
    this.ghost.material.color.setHex(colour);
    this.ghost.material.opacity = alpha;
  }
}

export class AimViews {
  readonly root = new THREE.Group();
  private readonly trajectory: Trajectory;
  private readonly ring: ChargeRing;
  private readonly band: SlingBand;
  private readonly orbit: ChargeOrbit;
  private readonly flare: FullPowerFlare;
  private readonly landing: LandingMarker;
  private forecastNow: ShotForecast | null = null;
  private forecastKey = '';
  private forecastAge = 0;

  constructor(settings: Settings, private readonly tuning: () => Tuning) {
    this.trajectory = new Trajectory(this.root, settings);
    this.ring = new ChargeRing(this.root);
    this.band = new SlingBand(this.root);
    this.orbit = new ChargeOrbit(this.root);
    this.flare = new FullPowerFlare(this.root);
    this.landing = new LandingMarker(this.root);
  }

  /** What the marker is showing right now; a test holds the world to this promise. */
  get forecast(): ShotForecast | null {
    return this.forecastNow;
  }

  private refreshForecast(snapshot: WorldSnapshot, dtMs: number): void {
    const b = snapshot.bubble;
    const key = b.aimOrigin === null ? '' : `${b.pullTheta.toFixed(3)}|${b.pullDist.toFixed(1)}|${b.cancelZone}`;
    this.forecastAge += dtMs;
    if (key === this.forecastKey && this.forecastAge < FORECAST_MS) return;
    this.forecastKey = key;
    this.forecastAge = 0;
    this.forecastNow = forecastAim(snapshot, this.tuning());
  }

  sync(snapshot: WorldSnapshot, pointer: Readonly<PointerInput>, dtMs: number, zoom: number): void {
    this.refreshForecast(snapshot, dtMs);
    this.landing.update(snapshot, this.forecastNow);
    this.ring.update(snapshot, this.forecastNow);
    this.flare.update(snapshot, dtMs);
    this.orbit.update(snapshot, dtMs);
    this.band.update(snapshot, pointer, zoom);
    this.trajectory.update(snapshot, this.forecastNow);
  }
}
