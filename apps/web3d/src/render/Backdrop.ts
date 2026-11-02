/**
 * The 3D decoration that moves against the painted layers of `Parallax.ts`, none of it a rule (GDD pillar 5:
 * what can be touched looks touchable, and this cannot be touched).
 *
 * - Z1's surface: a row of soft wave crests at the top of the world (§3.2 "oleaje visible en el borde superior").
 * - Z2's foreground: the reef wall §3.2 asks for, in front of the play plane with strong parallax. It
 *   sits on the screen edges and fades when Bur comes near, so it can never hide her.
 * - A shoal of clown fish in Z1, the one place the decoration has a skinned model.
 *
 * The rock and coral islands that used to live here are gone: fogged slabs read as ledges next to real
 * ones, and the blurred layers carry the depth better for a few draw calls.
 */
import * as THREE from 'three';
import { ZONES } from '@deeply-bubbly/core';
import type { Tuning } from '@deeply-bubbly/core';
import type { ModelInstance, ModelRegistry } from './ModelRegistry';
import { wx, wy } from './Stage';

const Z1_END = ZONES[0]?.endPx ?? 2880;
const Z2_END = ZONES[1]?.endPx ?? 7200;

interface ForegroundSide {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshLambertMaterial;
  side: -1 | 1;
  alpha: number;
}

const CREST_W = 60;
const CREST_Y = 0;
const CREST_Z = -3.5;

const FOREGROUND_Z = 6;
/** How much faster than the play plane it slides: the "parallax fuerte" of §3.2. */
const FOREGROUND_SPEED = 1.6;
/** The wall tile at twice its size: 320 tris a piece against 4 176 for the backdrop's reef slab. */
const FOREGROUND_SCALE = 2;
const FOREGROUND_SPACING = 60;
const FOREGROUND_PIECES = 9;
const FOREGROUND_HALF_W = 44;
/** Design px of the reef that reach into the view. */
const FOREGROUND_REACH = 11;
const FOREGROUND_ALPHA = 0.62;
const FOREGROUND_ALPHA_NEAR_BUR = 0.15;
/** Bur this close (design px) to the edge of the view clears that side. */
const FOREGROUND_CLEAR_PX = 40;
/** The reef comes in over the first part of Z2. */
const FOREGROUND_RAMP_PX = 200;

const FISH_ANCHOR_PX = 420;
const FISH_SPEED = 14;
const FISH_SWEEP_PX = 400;
const FISH_Z = -7;

const fract = (v: number): number => v - Math.floor(v);

export class Backdrop {
  readonly root = new THREE.Group();
  private readonly models: ModelRegistry;
  private readonly tuningOf: () => Tuning;
  private crests: { mesh: THREE.InstancedMesh; count: number }[] = [];
  private readonly foreground: ForegroundSide[] = [];
  private readonly fish: { model: ModelInstance; root: THREE.Group }[] = [];
  private lastFishTime = -1;
  private built = false;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly size = new THREE.Vector3();

  constructor(models: ModelRegistry, tuningOf: () => Tuning) {
    this.models = models;
    this.tuningOf = tuningOf;
  }

  /** Whether the authored decoration is on screen; otherwise `Background` keeps its far rocks. */
  get active(): boolean {
    return this.built;
  }

  private buildCrests(worldW: number): void {
    const count = Math.ceil((worldW + 240) / CREST_W);
    this.crests = this.models.baked('bd_z1_surface_wave').map((part) => {
      // Light through the swell, seen from below: pale and half see-through, never paper white.
      const material = new THREE.MeshBasicMaterial({ color: 0xb4efe9, transparent: true, opacity: 0.28, depthWrite: false, fog: false });
      const mesh = new THREE.InstancedMesh(part.geometry, material, count);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(mesh);
      return { mesh, count };
    });
  }

  private buildForeground(): void {
    for (const side of [-1, 1] as const) {
      for (const part of this.models.baked('wall_z2_reef_mid')) {
        // Dim, in the water's own hue: a shape passing the lens, not a wall Bur could bounce on.
        const material = new THREE.MeshLambertMaterial({
          vertexColors: true,
          color: 0x54808c,
          transparent: true,
          opacity: FOREGROUND_ALPHA,
          fog: false,
        });
        const mesh = new THREE.InstancedMesh(part.geometry, material, FOREGROUND_PIECES);
        mesh.frustumCulled = false;
        mesh.renderOrder = 50;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.root.add(mesh);
        this.foreground.push({ mesh, material, side, alpha: FOREGROUND_ALPHA });
      }
    }
  }

  private buildFish(): void {
    for (let i = 0; i < 2; i++) {
      const model = this.models.create('peces_payaso', 48, 24, 'none');
      if (!model) return;
      const root = new THREE.Group();
      root.add(model.object);
      this.root.add(root);
      this.fish.push({ model, root });
    }
  }

  private build(): void {
    // `version` moves once every file has settled: building earlier would freeze a half-loaded kit.
    if (this.built || this.models.version === 0 || !this.models.has('bd_z1_surface_wave')) return;
    const worldW = this.tuningOf().WORLD_W;
    this.buildCrests(worldW);
    this.buildForeground();
    this.buildFish();
    this.built = true;
  }

  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number, flip: boolean, rot: number): void {
    this.euler.set(0, flip ? Math.PI : 0, rot);
    this.matrix.compose(this.pos.set(x, y, z), this.quat.setFromEuler(this.euler), this.size.setScalar(s));
    mesh.setMatrixAt(i, this.matrix);
  }

  private updateCrests(renderY: number, timeS: number): void {
    const visible = renderY < 60;
    for (const { mesh, count } of this.crests) {
      mesh.visible = visible;
      if (!visible) continue;
      for (let i = 0; i < count; i++) {
        const swell = Math.sin(timeS * 1.3 + i * 1.1) * 1.4;
        this.place(mesh, i, wx(-120 + i * CREST_W), wy(CREST_Y + swell), CREST_Z, 1, i % 2 === 0, 0);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateForeground(renderX: number, renderY: number, viewW: number, viewH: number, burX: number, dtS: number, water: THREE.Color): void {
    const ramp = THREE.MathUtils.clamp((renderY + viewH - Z1_END) / FOREGROUND_RAMP_PX, 0, 1);
    const cycle = FOREGROUND_SPACING * FOREGROUND_PIECES;
    for (const f of this.foreground) {
      f.mesh.visible = ramp > 0 && renderY < Z2_END;
      if (!f.mesh.visible) continue;
      const edgeX = f.side < 0 ? renderX : renderX + viewW;
      const nearBur = Math.abs(burX - edgeX) < FOREGROUND_CLEAR_PX;
      const target = (nearBur ? FOREGROUND_ALPHA_NEAR_BUR : FOREGROUND_ALPHA) * ramp;
      f.alpha += (target - f.alpha) * Math.min(1, dtS * 8);
      f.material.opacity = f.alpha;
      f.material.emissive.copy(water).multiplyScalar(0.3);
      const x = edgeX + f.side * (FOREGROUND_HALF_W - FOREGROUND_REACH);
      const travel = renderY * FOREGROUND_SPEED + (f.side < 0 ? 0 : 73);
      for (let i = 0; i < FOREGROUND_PIECES; i++) {
        const along = fract((i * FOREGROUND_SPACING - travel) / cycle) * cycle - FOREGROUND_SPACING;
        this.place(f.mesh, i, wx(x), wy(renderY + viewH / 2 + along), FOREGROUND_Z, FOREGROUND_SCALE, f.side > 0, 0);
      }
      f.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateFish(renderX: number, renderY: number, viewW: number, viewH: number, timeS: number): void {
    const dt = this.lastFishTime < 0 ? 0 : Math.max(0, timeS - this.lastFishTime);
    this.lastFishTime = timeS;
    const centre = renderY + viewH / 2;
    this.fish.forEach((f, slot) => {
      // Each slot owns every other anchor, so it is never asked to jump while it is on screen.
      const k = Math.round((centre / FISH_ANCHOR_PX - slot) / 2) * 2 + slot;
      const y = k * FISH_ANCHOR_PX + 90;
      f.root.visible = y < Z1_END;
      if (!f.root.visible) return;
      const dir = k % 4 < 2 ? 1 : -1;
      const sweep = fract((timeS * FISH_SPEED + k * 97) / FISH_SWEEP_PX) * FISH_SWEEP_PX - FISH_SWEEP_PX / 2;
      f.root.position.set(wx(renderX + viewW / 2 + dir * sweep), wy(y + Math.sin(timeS * 0.6 + k) * 6), FISH_Z);
      f.root.rotation.y = dir < 0 ? Math.PI : 0;
      f.model.tick(dt);
    });
  }

  update(
    renderX: number,
    renderY: number,
    viewW: number,
    viewH: number,
    burX: number,
    timeMs: number,
    dtMs: number,
    water: THREE.Color,
  ): void {
    this.build();
    if (!this.built) return;
    const timeS = timeMs / 1000;
    this.updateCrests(renderY, timeS);
    this.updateForeground(renderX, renderY, viewW, viewH, burX, dtMs / 1000, water);
    this.updateFish(renderX, renderY, viewW, viewH, timeS);
  }
}
