/**
 * One Three.js object per `WorldEntity`, sized from the snapshot and animated from simulation time. No
 * game rule here: kinematics come from core (`solidRectAt`, `hazardRectAt`) and the danger window from
 * `hazardActiveAt`, so a tell can never disagree with the simulation.
 *
 * Depth layout: ledges reach from Z = +0.4 back to Z = −3.6, so their front face stays practically on
 * the play plane (the collision the player sees is the collision core runs) and Bur, centred on Z = 0,
 * is never occluded by a ledge she is touching.
 */
import * as THREE from 'three';
import { hazardActiveAt, hazardRectAt, solidRectAt, terminalDriftX, zoneAt } from '@deeply-bubbly/core';
import type { Ceiling, ForceField, Hazard, Pickup, Tuning, Wall, WorldEntity } from '@deeply-bubbly/core';
import { GEO, ownMaterials } from './materials';
import type { MaterialBank } from './materials';
import type { ModelInstance, ModelRegistry } from './ModelRegistry';
import { PX, wx, wy } from './Stage';

export interface EntityView {
  readonly root: THREE.Object3D;
  /** `timeMs` is `snapshot.timeMs`: simulation time, never wall clock. */
  update(entity: WorldEntity, timeMs: number): void;
  destroy(): void;
  /** Whether a glb draws this entity; for `__db` and the alignment audit. */
  readonly usesModel: boolean;
  /** Bur touched it. A model answers with its own clip, if it has one for that. */
  react?(contact: 'bounce' | 'rest'): void;
}

export interface ViewDeps {
  bank: MaterialBank;
  models: ModelRegistry;
  tuning: () => Tuning;
}

const LEDGE_FRONT_Z = 0.4;
const LEDGE_DEPTH = 4;
/** Thickness of the rest line under a capturable ledge, in design px. */
const REST_LINE_PX = 1.2;
/** Models are 16 px deep around Z = 0, and their underside reaches 68 % of that half depth. */
const MODEL_REST_LINE_Z = 0.5;

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geometry, material);
}

/** Model sets exist per zone of the manifest: 1 and 2, which is what core index 0 and 1 are authored as. */
function assetZone(worldY: number): 1 | 2 {
  return zoneAt(worldY).index >= 1 ? 2 : 1;
}

/** Advances a model's clips with simulation time, so a paused world is a paused sea. */
function clipClock(model: ModelInstance | null): (timeMs: number) => void {
  if (!model) return () => undefined;
  let last = -1;
  return (timeMs) => {
    if (last >= 0) model.tick(Math.max(0, (timeMs - last) / 1000));
    last = timeMs;
  };
}

const PULPO_CATALOG_ID = 9;
const PULPO_BLINK_MS = 2600;

/** A catalogue creature only stands in for a ledge whose size it can stretch to without breaking. */
const CREATURE_STRETCH_LIMIT = 1.35;

function solidModel(deps: ViewDeps, entity: Ceiling | Wall): { object: THREE.Object3D; model: ModelInstance | null } | null {
  const { models } = deps;
  const { w: rw, h: rh, y } = entity.rect;
  const zone = assetZone(y);
  if (entity.type === 'wall') {
    const set = `wall_z${zone}_${zone === 2 ? 'reef' : 'rock'}`;
    const wall = models.tile(set, 'y', rh);
    const width = models.entry(`${set}_mid`)?.w;
    if (!wall || width === undefined) return null;
    wall.scale.x = rw / width;
    return { object: wall, model: null };
  }
  if (entity.catalogId !== undefined) {
    const asset = models.catalog(entity.catalogId);
    const ratio = asset ? rw / asset.w : 0;
    if (asset && ratio <= CREATURE_STRETCH_LIMIT && ratio >= 1 / CREATURE_STRETCH_LIMIT) {
      const model = models.create(asset.name, rw, rh, 'stretch');
      if (model) return { object: model.object, model };
    }
  }
  const sets = [`ledge_z${zone}_${entity.material}`, `ledge_z1_${entity.material}`];
  for (const set of sets) {
    const tile = models.tile(set, 'x', rw);
    const height = models.entry(`${set}_mid`)?.h;
    if (!tile || height === undefined) continue;
    tile.scale.y = rh / height;
    return { object: tile, model: null };
  }
  return null;
}

function solidView(deps: ViewDeps, entity: Ceiling | Wall): EntityView {
  const w = wx(entity.rect.w);
  const h = entity.rect.h * PX;
  const capturable = entity.type === 'ceiling' && entity.capturable;
  const isJelly = entity.material === 'jelly';

  const root = new THREE.Group();
  const fromModel = solidModel(deps, entity);
  if (fromModel) {
    root.add(fromModel.object);
  } else {
    const shape = mesh(isJelly ? GEO.blob : GEO.box, deps.bank.solid(entity.material));
    if (isJelly) {
      shape.scale.set(w / 2, h / 2, 1.4);
    } else {
      shape.scale.set(w, h, LEDGE_DEPTH);
      shape.position.z = LEDGE_FRONT_Z - LEDGE_DEPTH / 2;
    }
    root.add(shape);
  }
  // The rest line is a rule made visible (section 2.3): it stays on a model too, and never on a jelly.
  if (capturable && !isJelly) {
    const line = mesh(GEO.box, deps.bank.restLine);
    line.scale.set(w, REST_LINE_PX * PX, 0.5);
    line.position.set(0, -h / 2 + (REST_LINE_PX * PX) / 2, fromModel ? MODEL_REST_LINE_Z : LEDGE_FRONT_Z - 0.2);
    root.add(line);
  }
  const model = fromModel?.model ?? null;
  const clips = clipClock(model);
  const catalogId = entity.type === 'ceiling' ? entity.catalogId : undefined;
  const faces = model !== null && catalogId !== undefined && deps.models.catalog(catalogId)?.facing !== undefined;
  // The pulpo's Blink is the one tell that gives him away from a ledge (§5, "parece repisa").
  const blinks = catalogId === PULPO_CATALOG_ID;
  let nextBlink = 0;
  let lastX = Number.NaN;
  return {
    root,
    usesModel: fromModel !== null,
    update(e, timeMs) {
      if (e.type !== 'ceiling' && e.type !== 'wall') return;
      const r = solidRectAt(e, timeMs);
      root.position.set(wx(r.x + r.w / 2), wy(r.y + r.h / 2), 0);
      clips(timeMs);
      if (faces && fromModel && r.x !== lastX && !Number.isNaN(lastX)) {
        fromModel.object.rotation.y = r.x < lastX ? Math.PI : 0;
      }
      lastX = r.x;
      if (blinks && timeMs >= nextBlink) {
        if (nextBlink > 0) model?.play('Blink');
        nextBlink = timeMs + PULPO_BLINK_MS;
      }
    },
    react(contact) {
      if (contact === 'bounce') model?.play('Bounce', 'Shove');
      else model?.play('Absorb', 'Bounce');
    },
    destroy() {
      model?.dispose();
    },
  };
}

/** ms of warning left before this hazard turns dangerous, or Infinity when it already is / never tells. */
function tellCountdown(h: Hazard, timeMs: number): number {
  const period = h.periodMs;
  const tell = h.tellMs;
  if (period === undefined || tell === undefined || !(period > 0)) return Infinity;
  const fraction = h.activeFraction ?? 1;
  if (fraction >= 1) return Infinity;
  const raw = (((timeMs + (h.phaseMs ?? 0)) % period) + period) % period;
  const activeEnd = fraction * period;
  return raw < activeEnd ? Infinity : period - raw;
}

const DON_HINCHON_CATALOG_ID = 5;

function hazardView(deps: ViewDeps, entity: Hazard): EntityView {
  const w = wx(entity.shape.w);
  const h = entity.shape.h * PX;
  const crown = entity.trap === true || entity.growth !== undefined;
  const root = new THREE.Group();
  const asset = deps.models.catalog(entity.catalogId);
  const model = asset ? deps.models.create(asset.name, entity.shape.w, entity.shape.h, 'uniform') : null;
  const part = model?.object ?? mesh(crown ? GEO.cone : GEO.chip, deps.bank.coral);
  if (!model) {
    if (crown) part.scale.set(w, h, w);
    else part.scale.set(w / 2, h / 2, Math.min(w, h) / 2);
  }
  // A crown on a shelf's lip hangs from it: same shape, turned over (section 8, silhouette first).
  if (entity.growth === 'lip') part.rotation.z = Math.PI;
  root.add(part);
  const owned = ownMaterials(root);
  const clips = clipClock(model);
  // Don Hinchón shows his rhythm with his own body: his bind pose IS the collision box, so he holds it
  // while dangerous, and his idle at 75 % is the window in which he cannot hurt.
  const breathes = model !== null && entity.catalogId === DON_HINCHON_CATALOG_ID;
  let wasActive: boolean | null = null;
  return {
    root,
    usesModel: model !== null,
    update(e, timeMs) {
      if (e.type !== 'hazard') return;
      const r = hazardRectAt(e, timeMs);
      root.position.set(wx(r.x + r.w / 2), wy(r.y + r.h / 2), 0);
      clips(timeMs);
      const active = hazardActiveAt(e, timeMs);
      const countdown = tellCountdown(e, timeMs);
      const telling = !active && countdown <= (e.tellMs ?? 0);
      if (breathes) {
        if (active !== wasActive) {
          if (active) model.hold('Inflate');
          else if (wasActive !== null) model.release('Deflate');
          wasActive = active;
        }
        if (telling) root.position.y += Math.sin(timeMs / 55) * 0.05;
        return;
      }
      let opacity = 1;
      let scale = 1;
      if (telling) {
        // The tell is a rhythm, not a colour: it flashes and jitters, so it reads in greyscale.
        opacity = 0.7 + 0.3 * Math.abs(Math.sin(timeMs / 70));
        scale = 0.9;
        root.position.y += Math.sin(timeMs / 55) * 0.05;
      } else if (!active) {
        // Dormant = receded into the water and deflated, spines in.
        opacity = 0.45;
        scale = 0.78;
      }
      root.scale.setScalar(scale);
      for (const own of owned) {
        own.material.opacity = own.base * opacity;
        own.material.transparent = own.base < 1 || opacity < 1;
        if (!model) (own.material as THREE.MeshLambertMaterial).color.copy(telling ? deps.bank.accent.color : deps.bank.coral.color);
      }
    },
    destroy() {
      model?.dispose();
      for (const own of owned) own.material.dispose();
    },
  };
}

const FIELD_TONE: Readonly<Record<ForceField['fieldType'], number>> = {
  corriente: 0xa8e6f0,
  fumarola: 0xffa45c,
  salmuera: 0x8d7ae0,
  frio: 0xc8ecff,
  descendente: 0x3f6f9e,
};

const FIELD_SLAB_OPACITY = 0.16;
const FIELD_FEATHER_PX = 26;

/**
 * The body of a field, in Three units from its top-left corner: solid in the middle and fading to nothing
 * at the edge. Hard edges read as a UI panel lying in the water, and a current has none.
 */
function featheredSlab(w: number, h: number, tone: number): THREE.BufferGeometry {
  const fx = Math.min(FIELD_FEATHER_PX, w / 2);
  const fy = Math.min(FIELD_FEATHER_PX, h / 2);
  const xs = [0, fx, w - fx, w];
  const ys = [0, fy, h - fy, h];
  const color = new THREE.Color(tone);
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      positions.push(wx(xs[i] ?? 0), wy(ys[j] ?? 0), 0);
      const inner = i > 0 && i < 3 && j > 0 && j < 3;
      colors.push(color.r, color.g, color.b, inner ? 1 : 0);
      if (i < 3 && j < 3) {
        const a = j * 4 + i;
        index.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(index);
  return geometry;
}

/**
 * A translucent slab plus small arrows drifting with the field. The arrows are cones turned to point
 * downstream, so the direction survives greyscale (§8), and a corriente's arrows travel at the terminal
 * drift core computes: what the eye reads is the speed Bur is about to be given.
 */
function fieldView(deps: ViewDeps, entity: ForceField): EntityView {
  const { rect, fieldType, vector } = entity;
  const tone = FIELD_TONE[fieldType];
  const root = new THREE.Group();
  root.position.set(wx(rect.x), wy(rect.y), 0);

  const slabMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: FIELD_SLAB_OPACITY,
    depthWrite: false,
    fog: false,
  });
  const slabGeometry = featheredSlab(rect.w, rect.h, tone);
  const slab = mesh(slabGeometry, slabMaterial);
  slab.position.z = -0.8;
  root.add(slab);

  const speed = Math.hypot(vector.x, vector.y);
  const dirX = speed > 0 ? vector.x / speed : 1;
  const dirY = speed > 0 ? vector.y / speed : 0;
  const flow = fieldType === 'corriente';
  const count = Math.max(4, Math.min(flow ? 30 : 14, Math.round((rect.w * rect.h) / (flow ? 380 : 900))));
  const arrowMaterial = new THREE.MeshBasicMaterial({ color: tone, transparent: true, opacity: 0.75, depthWrite: false });
  // The current's mote is the one authored shape here; every other field keeps the cone.
  const mote = flow ? deps.models.firstMesh('corriente_mota') : null;
  const arrows = new THREE.InstancedMesh(mote?.geometry ?? GEO.cone, mote ? (mote.material as THREE.Material) : arrowMaterial, count);
  arrows.frustumCulled = false;
  root.add(arrows);

  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    xs[i] = (i * 37) % Math.max(1, rect.w);
    ys[i] = (i * 53) % Math.max(1, rect.h);
  }
  // A cone's tip is +Y, the mote faces +X; core's y grows down, hence the sign on dirY.
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    mote ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dirX, -dirY, 0),
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const size = mote ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(0.28, 0.42, 0.28);
  let last = -1;
  return {
    root,
    usesModel: mote !== null,
    update(_e, timeMs) {
      const drift = flow ? terminalDriftX(speed, deps.tuning()) : Math.min(40, 6 + speed * 0.15);
      const dt = last < 0 ? 0 : Math.min(0.1, (timeMs - last) / 1000);
      last = timeMs;
      for (let i = 0; i < count; i++) {
        const x = (((xs[i] ?? 0) + dirX * drift * dt) % rect.w + rect.w) % rect.w;
        const y = (((ys[i] ?? 0) + dirY * drift * dt) % rect.h + rect.h) % rect.h;
        xs[i] = x;
        ys[i] = y;
        matrix.compose(position.set(wx(x), wy(y), -0.2), rotation, size);
        arrows.setMatrixAt(i, matrix);
      }
      arrows.instanceMatrix.needsUpdate = true;
    },
    destroy() {
      slabGeometry.dispose();
      slabMaterial.dispose();
      arrowMaterial.dispose();
      arrows.dispose();
    },
  };
}

const PICKUP_ASSET: Readonly<Record<Pickup['pickupType'], string>> = {
  aire: 'pickup_aire',
  aireGrande: 'pickup_aire',
  perla: 'pickup_perla',
  perlaGrande: 'pickup_perla',
  concha: 'pickup_concha',
};

function pickupView(deps: ViewDeps, entity: Pickup): EntityView {
  const radius = Math.max(2, entity.radius);
  const r = radius * PX;
  const type = entity.pickupType;
  const root = new THREE.Group();
  const isAir = type === 'aire' || type === 'aireGrande';
  const model = deps.models.create(PICKUP_ASSET[type], radius * 2, radius * 2, 'uniform');
  const airMaterial =
    isAir && !model ? new THREE.MeshLambertMaterial({ color: 0xdff8ff, flatShading: true, transparent: true, opacity: 0.72 }) : null;
  if (model) {
    root.add(model.object);
  } else if (airMaterial) {
    const bubble = mesh(GEO.blob, airMaterial);
    bubble.scale.setScalar(r);
    root.add(bubble);
  } else if (type === 'concha') {
    const shell = mesh(GEO.cone, deps.bank.accent);
    shell.scale.set(r * 2, r * 1.6, r);
    root.add(shell);
  } else {
    const pearl = mesh(GEO.blob, deps.bank.foam);
    pearl.scale.setScalar(r * 0.85);
    root.add(pearl);
  }
  const baseY = wy(entity.pos.y);
  root.position.set(wx(entity.pos.x), baseY, 0);
  const seed = (entity.pos.x * 7 + entity.pos.y * 13) % 1000;
  const clips = clipClock(model);
  return {
    root,
    usesModel: model !== null,
    update(_e, timeMs) {
      clips(timeMs);
      if (model) return; // its own clip bobs and shines it
      const t = (timeMs + seed) / 1000;
      root.position.y = baseY + Math.sin(t * 2) * 0.15;
      root.rotation.y = t * 0.9;
      if (airMaterial) root.scale.setScalar(1 + 0.06 * Math.sin(t * Math.PI * 2));
    },
    destroy() {
      model?.dispose();
      airMaterial?.dispose();
    },
  };
}

/** A boya is a checkpoint LINE across the whole world, with the marker on it (see `apps/web`). */
function boyaView(deps: ViewDeps, worldY: number): EntityView {
  const worldW = deps.tuning().WORLD_W;
  const root = new THREE.Group();
  root.position.set(wx(worldW / 2), wy(worldY), 0);
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  lineMaterial.color.copy(deps.bank.foam.color);
  const line = mesh(GEO.plane, lineMaterial);
  line.scale.set(wx(worldW), 0.1, 1);
  line.position.z = -0.6;
  root.add(line);
  const model = deps.models.create(`boya_z${assetZone(worldY)}`, 16, 28, 'none');
  const clips = clipClock(model);
  let marker: THREE.Object3D;
  if (model) {
    marker = model.object;
  } else {
    marker = new THREE.Group();
    const head = mesh(GEO.blob, deps.bank.accent);
    head.scale.setScalar(0.45);
    const mast = mesh(GEO.cone, deps.bank.foam);
    mast.scale.set(0.3, 0.9, 0.3);
    mast.position.y = 0.45;
    marker.add(head, mast);
  }
  root.add(marker);
  return {
    root,
    usesModel: model !== null,
    update(_e, timeMs) {
      clips(timeMs);
      if (!model) marker.position.y = Math.sin(timeMs / 700) * 0.2;
      lineMaterial.opacity = 0.28 + 0.1 * Math.sin(timeMs / 700);
    },
    destroy() {
      model?.dispose();
      lineMaterial.dispose();
    },
  };
}

const STATION_MODEL_Z = -12;
const STATION_DIM = 0.72;
/** Fraction of the band's height that stays solid: a hard bottom edge reads as a UI panel in the water. */
const STATION_SOLID_FRACTION = 0.45;

/** Unit quad like `GEO.plane`, solid from its top down and transparent at its bottom. */
function fadingBandGeometry(): THREE.BufferGeometry {
  const rows = [
    { y: 0.5, alpha: 1 },
    { y: 0.5 - STATION_SOLID_FRACTION, alpha: 1 },
    { y: -0.5, alpha: 0 },
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(rows.flatMap((r) => [-0.5, r.y, 0, 0.5, r.y, 0]), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(rows.flatMap((r) => [1, 1, 1, r.alpha, 1, 1, 1, r.alpha]), 4));
  geometry.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
  return geometry;
}

/** Shared by every station: it never changes, so no view disposes it. */
let bandGeometry: THREE.BufferGeometry | null = null;

/** The rest station: a calm band of light across the world, with a dotted threshold on top. */
function stationView(deps: ViewDeps, worldY: number): EntityView {
  const t = deps.tuning();
  const root = new THREE.Group();
  root.position.set(wx(t.WORLD_W / 2), wy(worldY), 0);
  const bandMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false });
  bandMaterial.color.copy(deps.bank.foam.color);
  bandGeometry ??= fadingBandGeometry();
  const band = mesh(bandGeometry, bandMaterial);
  band.scale.set(wx(t.WORLD_W), t.CHUNK_H * PX, 1);
  band.position.set(0, -(t.CHUNK_H * PX) / 2, -4);
  root.add(band);
  const threshold = mesh(GEO.plane, deps.bank.restLine);
  threshold.scale.set(wx(t.WORLD_W), 0.14, 1);
  threshold.position.z = -3.9;
  root.add(threshold);
  const model = deps.models.create(`station_z${assetZone(worldY)}`, 120, 56, 'none');
  let dressing: ReturnType<typeof ownMaterials> = [];
  if (model) {
    // Deep behind the play plane, just under the threshold, and dimmed: a place, not a platform. It is
    // nothing Bur can touch, so it must not look like the ledges she can.
    model.object.position.set(0, -(56 * PX) / 2 - 0.4, STATION_MODEL_Z);
    root.add(model.object);
    dressing = ownMaterials(model.object);
    for (const own of dressing) (own.material as THREE.MeshLambertMaterial).color.multiplyScalar(STATION_DIM);
  }
  const clips = clipClock(model);
  return {
    root,
    usesModel: model !== null,
    update(_e, timeMs) {
      clips(timeMs);
      bandMaterial.opacity = 0.14 + 0.04 * Math.sin(timeMs / 900);
    },
    destroy() {
      model?.dispose();
      bandMaterial.dispose();
      for (const own of dressing) own.material.dispose();
    },
  };
}

/** Returns null for entities with no visual of their own (anchors are authoring data). */
export function createEntityView(deps: ViewDeps, entity: WorldEntity): EntityView | null {
  switch (entity.type) {
    case 'ceiling':
    case 'wall':
      return solidView(deps, entity);
    case 'hazard':
      return hazardView(deps, entity);
    case 'forcefield':
      return fieldView(deps, entity);
    case 'pickup':
      return pickupView(deps, entity);
    case 'boya':
      return boyaView(deps, entity.worldY);
    case 'station':
      return stationView(deps, entity.worldY);
    case 'anchor':
      return null;
  }
}
