/**
 * The authored decoration of Z1 and Z2 (kind `backdrop` in the manifest), all of it behind or in front
 * of the play plane and none of it a rule (GDD pillar 5: what can be touched looks touchable, and this
 * cannot be touched).
 *
 * - Layers: reef and rock islands at three depths. Perspective alone gives an 18° camera little parallax,
 *   so each layer also slides with the camera (`follow`): 0.2 means it moves at 80 % of the play plane.
 * - Pieces are composed into islands, because one coral alone in open water looks like a mistake.
 * - Z1's surface: a row of wave crests at the top of the world (§3.2 "oleaje visible en el borde superior").
 * - Z2's foreground: the reef wall §3.2 asks for, in front of the play plane with strong parallax. It
 *   sits on the screen edges and fades when Bur comes near, so it can never hide her.
 * - A shoal of clown fish in Z1, the one place the decoration has a skinned model.
 *
 * One InstancedMesh per mesh of each asset: the whole backdrop costs a fixed handful of draw calls however
 * many islands it shows. Anything swaying rocks the whole instance, since instances share no skeleton.
 */
import * as THREE from 'three';
import { ZONES } from '@deeply-bubbly/core';
import type { Tuning } from '@deeply-bubbly/core';
import type { ModelInstance, ModelRegistry } from './ModelRegistry';
import { wx, wy } from './Stage';

const Z1_END = ZONES[0]?.endPx ?? 2880;
const Z2_END = ZONES[1]?.endPx ?? 7200;

interface Layer {
  z: number;
  /** Fraction of the camera's travel the layer shares: bigger is further away. */
  follow: number;
  /** Design px between islands, in the layer's own space. */
  spacing: number;
  scale: number;
}

const LAYERS: readonly Layer[] = [
  { z: -22, follow: 0.1, spacing: 150, scale: 0.9 },
  { z: -40, follow: 0.24, spacing: 110, scale: 1.05 },
  { z: -60, follow: 0.42, spacing: 90, scale: 1.3 },
];

interface Piece {
  name: string;
  /** Offset from the island's anchor, in design px, y grows down. */
  dx: number;
  dy: number;
  scale?: number;
  sway?: boolean;
  /** Fixed roll, in radians. */
  tilt?: number;
}

const Z1_ISLANDS: readonly Piece[][] = [
  [
    { name: 'bd_z1_rock_mound', dx: 0, dy: 0 },
    { name: 'bd_z1_coral_branch', dx: -24, dy: -38 },
    { name: 'bd_z1_seagrass', dx: 26, dy: -34, sway: true },
  ],
  [
    { name: 'bd_z1_rock_mound', dx: 0, dy: 0, scale: 0.8 },
    { name: 'bd_z1_coral_fan', dx: 10, dy: -40 },
  ],
  [
    { name: 'bd_z1_rock_mound', dx: 0, dy: 0, scale: 1.2 },
    { name: 'bd_z1_seagrass', dx: -34, dy: -40, sway: true },
    { name: 'bd_z1_coral_fan', dx: 6, dy: -44, scale: 0.8 },
    { name: 'bd_z1_coral_branch', dx: 40, dy: -40, scale: 0.8 },
  ],
];

const Z2_ISLANDS: readonly Piece[][] = [
  [
    // A straight-edged slab reads as a UI panel once fogged: tilted, with growth over its top edge.
    { name: 'bd_z2_reef_wall', dx: 0, dy: 0, scale: 0.8, tilt: 0.16 },
    { name: 'bd_z2_tube_sponge', dx: -30, dy: -72, scale: 0.8 },
    { name: 'bd_z2_sea_fan', dx: 26, dy: -66, scale: 0.8 },
    { name: 'bd_z2_rock_arch', dx: -6, dy: 44, scale: 0.8 },
  ],
  [
    { name: 'bd_z2_rock_arch', dx: 0, dy: 0 },
    { name: 'bd_z2_kelp_tall', dx: -44, dy: -70, sway: true },
    { name: 'bd_z2_brain_coral', dx: 22, dy: -48, scale: 0.6 },
  ],
  [
    { name: 'bd_z2_brain_coral', dx: 0, dy: 0, scale: 0.85 },
    { name: 'bd_z2_sea_fan', dx: -22, dy: -46 },
    { name: 'bd_z2_tube_sponge', dx: 28, dy: -40 },
  ],
  [
    { name: 'bd_z2_rock_arch', dx: 0, dy: 0, scale: 0.7 },
    { name: 'bd_z2_kelp_tall', dx: 34, dy: -76, sway: true },
    { name: 'bd_z2_kelp_tall', dx: 52, dy: -64, scale: 0.8, sway: true },
  ],
];

interface Placement {
  layer: Layer;
  name: string;
  x: number;
  /** In the layer's own space: drawn at `layerY + cameraY * follow`. */
  layerY: number;
  halfH: number;
  scale: number;
  flip: boolean;
  sway: boolean;
  tilt: number;
  phase: number;
}

interface Batch {
  meshes: THREE.InstancedMesh[];
  used: number;
}

interface ForegroundSide {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshLambertMaterial;
  side: -1 | 1;
  alpha: number;
}

/** Instances of one asset the view can hold at once; the rest of the world is out of view anyway. */
const BATCH_CAPACITY = 8;
const SWAY_RAD = 0.05;
const CREST_W = 60;
const CREST_Y = -3;
const CREST_Z = -2.5;

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
const FOREGROUND_ALPHA = 0.9;
const FOREGROUND_ALPHA_NEAR_BUR = 0.2;
/** Bur this close (design px) to the edge of the view clears that side. */
const FOREGROUND_CLEAR_PX = 40;
/** The reef comes in over the first part of Z2. */
const FOREGROUND_RAMP_PX = 200;

const FISH_ANCHOR_PX = 420;
const FISH_SPEED = 14;
const FISH_SWEEP_PX = 400;
const FISH_Z = -7;

/** The backdrop's own dimming and self-light in the water's colour: no shadow on it can out-contrast a ledge. */
const WASH_COLOR = 0.5;
const WASH_EMISSIVE = 0.4;

const fract = (v: number): number => v - Math.floor(v);
/** Deterministic: the same sea every run, and nothing the simulation's RNG has to know about. */
const hash = (a: number, b: number): number => fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);

export class Backdrop {
  readonly root = new THREE.Group();
  private readonly models: ModelRegistry;
  private readonly tuningOf: () => Tuning;
  private readonly batches = new Map<string, Batch>();
  private readonly placements: Placement[] = [];
  private crests: { mesh: THREE.InstancedMesh; count: number }[] = [];
  private readonly foreground: ForegroundSide[] = [];
  private readonly fish: { model: ModelInstance; root: THREE.Group }[] = [];
  private lastFishTime = -1;
  private built = false;
  private readonly washed = new Map<THREE.Material, THREE.MeshLambertMaterial>();
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

  private buildPlacements(worldW: number): void {
    LAYERS.forEach((layer, layerIndex) => {
      const follow = 1 - layer.follow;
      const count = Math.ceil((Z2_END * follow + 400) / layer.spacing);
      for (let i = 0; i < count; i++) {
        const layerY = 60 + i * layer.spacing + (hash(i, layerIndex) - 0.5) * layer.spacing * 0.5;
        const kit = layerY < Z1_END * follow ? Z1_ISLANDS : Z2_ISLANDS;
        const island = kit[Math.floor(hash(i, layerIndex + 10) * kit.length)];
        if (!island) continue;
        // Past the walls on both sides too: the view is never empty at the edge of the world.
        const x = -40 + hash(i, layerIndex + 20) * (worldW + 80);
        const flip = hash(i, layerIndex + 30) < 0.5;
        const scale = layer.scale * (0.85 + hash(i, layerIndex + 40) * 0.3);
        for (const piece of island) {
          const entry = this.models.entry(piece.name);
          if (!entry) continue;
          const s = scale * (piece.scale ?? 1);
          this.placements.push({
            layer,
            name: piece.name,
            x: x + piece.dx * scale * (flip ? -1 : 1),
            layerY: layerY + piece.dy * scale,
            halfH: (entry.h * s) / 2,
            scale: s,
            flip,
            sway: piece.sway === true,
            tilt: (piece.tilt ?? 0) * (flip ? -1 : 1),
            phase: hash(i, piece.dx),
          });
        }
      }
    });
    for (const name of new Set(this.placements.map((p) => p.name))) {
      const meshes = this.models.baked(name).map((part) => {
        const mesh = new THREE.InstancedMesh(part.geometry, this.wash(part.material), BATCH_CAPACITY);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.root.add(mesh);
        return mesh;
      });
      this.batches.set(name, { meshes, used: 0 });
    }
  }

  /** The backdrop's own copy of a material, so washing it never touches a ledge sharing the look. */
  private wash(source: THREE.Material): THREE.MeshLambertMaterial {
    let copy = this.washed.get(source);
    if (!copy) {
      copy = (source as THREE.MeshLambertMaterial).clone();
      copy.color.multiplyScalar(WASH_COLOR);
      this.washed.set(source, copy);
    }
    return copy;
  }

  private buildCrests(worldW: number): void {
    const count = Math.ceil((worldW + 240) / CREST_W);
    this.crests = this.models.baked('bd_z1_surface_wave').map((part) => {
      // Foam catches the sun whatever the water does: self-lit, or it dulls to beige against the sky.
      const material = (part.material as THREE.MeshLambertMaterial).clone();
      material.emissive.setHex(0x8fa8a4);
      material.fog = false;
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
    if (this.built || this.models.version === 0 || !this.models.has('bd_z1_rock_mound')) return;
    const worldW = this.tuningOf().WORLD_W;
    this.buildPlacements(worldW);
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

  private updateIslands(renderY: number, viewH: number, timeS: number): void {
    for (const batch of this.batches.values()) batch.used = 0;
    const top = renderY;
    const bottom = renderY + viewH;
    for (const p of this.placements) {
      const y = p.layerY + renderY * p.layer.follow;
      // The further the layer the more world the view holds above and below: 123 / (123 - z) of it.
      const slack = p.halfH + (viewH * -p.layer.z) / 200;
      if (y < top - slack || y > bottom + slack) continue;
      const batch = this.batches.get(p.name);
      if (!batch || batch.used >= BATCH_CAPACITY) continue;
      const sway = p.sway ? Math.sin(timeS * 0.9 + p.phase * 6.28) * SWAY_RAD : 0;
      const rot = sway + p.tilt;
      // The pivot is the foot of the plant: the top moves, the root stays.
      const swayX = Math.sin(sway) * p.halfH;
      for (const mesh of batch.meshes) {
        this.place(mesh, batch.used, wx(p.x - swayX), wy(y), p.layer.z, p.scale, p.flip, rot);
      }
      batch.used++;
    }
    for (const batch of this.batches.values()) {
      for (const mesh of batch.meshes) {
        mesh.count = batch.used;
        mesh.visible = batch.used > 0;
        mesh.instanceMatrix.needsUpdate = batch.used > 0;
      }
    }
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
    for (const material of this.washed.values()) material.emissive.copy(water).multiplyScalar(WASH_EMISSIVE);
    const timeS = timeMs / 1000;
    this.updateIslands(renderY, viewH, timeS);
    this.updateCrests(renderY, timeS);
    this.updateForeground(renderX, renderY, viewW, viewH, burX, dtMs / 1000, water);
    this.updateFish(renderX, renderY, viewW, viewH, timeS);
  }
}
