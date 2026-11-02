/**
 * Model registry: swaps primitives for the glTF models listed in `public/models/manifest.json`, the file
 * `tools/blender/build_assets.py` generates (`{ assets: [{ name, file, kind, size: { w, h }, ... }] }`).
 *
 * The manifest is optional and so is every entry in it. Missing file, invalid JSON, a glb that fails to
 * load: all of them mean "no model for that name", and the view keeps its primitive. The game must be
 * fully playable with an empty `public/models`. Models load in the background; when they have all
 * settled `version` bumps and the views rebuild themselves, so there is only one way to build a view.
 *
 * Sizing follows the contract (WEB3D.md): 1 design px = 0.1 units, +Y up, origin at the centre of the
 * collision box. A model is never re-centred; it IS fitted to the size the snapshot gives the entity,
 * reading its authored size from the manifest (a bounding box would lie for a skinned mesh).
 */
import * as THREE from 'three';
import type * as ModelLoader from './modelLoader';
import { PX } from './Stage';

export type FitMode = 'stretch' | 'uniform' | 'none';

export interface AssetEntry {
  name: string;
  file: string;
  kind: string;
  /** Authored size in design px. */
  w: number;
  h: number;
  catalogId?: number;
  loop?: string;
  /** Which way the authored model looks, when it has a front. */
  facing?: string;
}

/** A live clone of a model: skinning and clips are per instance. */
export interface ModelInstance {
  object: THREE.Object3D;
  /** Advances its clips. Pass simulation seconds, so a paused world stays paused. */
  tick(deltaSeconds: number): void;
  /** Plays the first of these one-shot clips the model has, instead of its loop until it ends. */
  play(...clips: string[]): void;
  /** Plays a clip and stays on its last frame until `release`; the loop is silent meanwhile. */
  hold(clip: string): void;
  /** Plays an optional closing clip, then back to the loop. */
  release(closing?: string): void;
  /** Frees what this clone alone owns on the GPU: a skeleton's bone texture is never collected on its own. */
  dispose(): void;
}

/** A piece of a model with its node transform baked in, for instancing. */
export interface BakedMesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

interface Loaded {
  entry: AssetEntry;
  template: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

/** Enough to keep a phone responsive while it downloads, few enough not to choke its connection pool. */
const LOAD_CONCURRENCY = 8;
/** Long enough to hide the pop between a loop and a one-shot, short enough not to blur the one-shot. */
const CROSSFADE_S = 0.08;

function parseEntry(raw: unknown): AssetEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const size = r['size'] as Record<string, unknown> | undefined;
  const { name, file, kind } = r;
  if (typeof name !== 'string' || typeof file !== 'string' || typeof kind !== 'string') return null;
  const w = size?.['w'];
  const h = size?.['h'];
  if (typeof w !== 'number' || typeof h !== 'number' || !(w > 0) || !(h > 0)) return null;
  const entry: AssetEntry = { name, file, kind, w, h };
  if (typeof r['catalogId'] === 'number') entry.catalogId = r['catalogId'];
  if (typeof r['facing'] === 'string') entry.facing = r['facing'];
  if (Array.isArray(r['animations'])) {
    const loop = (r['animations'] as Array<Record<string, unknown>>).find((a) => a['loop'] === true);
    if (typeof loop?.['name'] === 'string') entry.loop = loop['name'];
  }
  return entry;
}

/** Pure parser: anything that is not the documented shape is simply not a model. */
export function parseManifest(raw: unknown): AssetEntry[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const assets = (raw as Record<string, unknown>)['assets'];
  if (!Array.isArray(assets)) return [];
  return assets.map(parseEntry).filter((e): e is AssetEntry => e !== null);
}

export class ModelRegistry {
  private readonly loaded = new Map<string, Loaded>();
  private readonly byCatalog = new Map<number, AssetEntry>();
  private readonly tileCache = new Map<string, THREE.Mesh>();
  private readonly failed: string[] = [];
  private loader: typeof ModelLoader | null = null;
  /** Bumped when models arrive, so the views rebuild themselves on the next frame. */
  version = 0;
  /** Settled once the manifest and every file it lists have been tried. */
  readonly ready: Promise<void>;

  constructor(baseUrl: string) {
    this.ready = this.load(baseUrl);
  }

  has(name: string): boolean {
    return this.loaded.has(name);
  }

  entry(name: string): AssetEntry | null {
    return this.loaded.get(name)?.entry ?? null;
  }

  /** The asset of a GDD §5 catalogue number, if one loaded. */
  catalog(id: number): AssetEntry | null {
    return this.byCatalog.get(id) ?? null;
  }

  /** A new instance fitted to `w`×`h` (design px); null keeps the primitive. */
  create(name: string, w: number, h: number, fit: FitMode): ModelInstance | null {
    const model = this.loaded.get(name);
    if (!model || !this.loader) return null;
    const clone = this.loader.cloneModel(model.template);
    const sx = w / model.entry.w;
    const sy = h / model.entry.h;
    if (fit === 'stretch') clone.scale.set(sx, sy, 1);
    else if (fit === 'uniform') clone.scale.setScalar(Math.min(sx, sy));
    const root = new THREE.Group();
    root.add(clone);
    const noop = (): void => undefined;
    const disposeSkeletons = (): void => {
      clone.traverse((node) => (node as THREE.SkinnedMesh).skeleton?.dispose());
    };
    if (model.clips.length === 0) return { object: root, tick: noop, play: noop, hold: noop, release: noop, dispose: disposeSkeletons };

    const mixer = new THREE.AnimationMixer(clone);
    const find = (name2: string): THREE.AnimationClip | undefined => model.clips.find((c) => c.name === name2);
    const loopClip = model.entry.loop === undefined ? undefined : find(model.entry.loop);
    const loop = loopClip ? mixer.clipAction(loopClip).play() : null;
    let current: THREE.AnimationAction | null = null;
    let held = false;
    const backToLoop = (): void => {
      current?.fadeOut(CROSSFADE_S);
      current = null;
      held = false;
      loop?.reset().fadeIn(CROSSFADE_S).play();
    };
    /** Two clips on the same bones would average out, so whatever plays has the bones to itself. */
    const take = (clip: THREE.AnimationClip, hold: boolean): void => {
      const action = mixer.clipAction(clip);
      if (current && current !== action) current.fadeOut(CROSSFADE_S);
      if (!current) loop?.fadeOut(CROSSFADE_S);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.reset().fadeIn(CROSSFADE_S).play();
      current = action;
      held = hold;
    };
    mixer.addEventListener('finished', (e) => {
      if (!held && e.action === current) backToLoop();
    });
    return {
      object: root,
      tick: (dt) => {
        mixer.update(dt);
      },
      play: (...names) => {
        // A one-shot never interrupts a held pose: that pose is telling the player a rule.
        if (held) return;
        const clip = names.map(find).find((c) => c !== undefined);
        if (clip) take(clip, false);
      },
      hold: (name2) => {
        const clip = find(name2);
        if (clip) take(clip, true);
      },
      release: (closing) => {
        const clip = closing === undefined ? undefined : find(closing);
        if (clip) take(clip, false);
        else backToLoop();
      },
      dispose: () => {
        mixer.stopAllAction();
        mixer.uncacheRoot(clone);
        disposeSkeletons();
      },
    };
  }

  /** Every mesh of a model with its node transforms baked, skinned ones in bind pose. */
  baked(name: string): BakedMesh[] {
    const model = this.loaded.get(name);
    if (!model) return [];
    const out: BakedMesh[] = [];
    model.template.updateMatrixWorld(true);
    model.template.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      out.push({ geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), material: mesh.material });
    });
    return out;
  }

  /**
   * A tiled solid in ONE mesh (ledges along x, walls along y), following the manifest's formula:
   * `W = cap + n * mid + cap`, `n = max(1, round((W - 2 cap) / mid))`, mids scaled to fill exactly. A ready
   * short/medium/long piece is used when the width matches one. Geometry is merged and cached per width,
   * so a screen of ledges stays one draw call each, inside the budget of WEB3D.md.
   */
  tile(set: string, axis: 'x' | 'y', lengthPx: number): THREE.Mesh | null {
    const key = `${set}|${axis}|${lengthPx}`;
    const cached = this.tileCache.get(key);
    if (cached) return cached.clone();
    const mesh = this.buildTile(set, axis, lengthPx);
    if (!mesh) return null;
    this.tileCache.set(key, mesh);
    return mesh.clone();
  }

  private buildTile(set: string, axis: 'x' | 'y', lengthPx: number): THREE.Mesh | null {
    const loader = this.loader;
    if (!loader) return null;
    const size = (e: AssetEntry): number => (axis === 'x' ? e.w : e.h);
    const pieces: Array<{ name: string; centre: number; scale: number }> = [];
    const ready = ['short', 'medium', 'long'].map((role) => `${set}_${role}`).find((name) => {
      const e = this.entry(name);
      return e !== null && size(e) === lengthPx;
    });
    const smallest = this.entry(`${set}_short`);
    const capA = axis === 'x' ? `${set}_cap_l` : `${set}_cap_top`;
    const capB = axis === 'x' ? `${set}_cap_r` : `${set}_cap_bottom`;
    const capAEntry = this.entry(capA);
    const capBEntry = this.entry(capB);
    const midEntry = this.entry(`${set}_mid`);
    if (ready) {
      pieces.push({ name: ready, centre: 0, scale: 1 });
    } else if (capAEntry && capBEntry && midEntry && lengthPx >= size(capAEntry) + size(capBEntry) + size(midEntry) / 2) {
      const capLen = size(capAEntry);
      const midLen = size(midEntry);
      const n = Math.max(1, Math.round((lengthPx - 2 * capLen) / midLen));
      const scale = (lengthPx - 2 * capLen) / (n * midLen);
      // Walk from the first cap: the low end along x, the top along y (Three's +Y is up).
      const sign = axis === 'x' ? 1 : -1;
      let cursor = -lengthPx / 2;
      pieces.push({ name: capA, centre: sign * (cursor + capLen / 2), scale: 1 });
      cursor += capLen;
      for (let i = 0; i < n; i++) {
        pieces.push({ name: `${set}_mid`, centre: sign * (cursor + (midLen * scale) / 2), scale });
        cursor += midLen * scale;
      }
      pieces.push({ name: capB, centre: sign * (cursor + capLen / 2), scale: 1 });
    } else if (smallest) {
      // Narrower than a three-slice can be: the shortest ready piece, squeezed.
      pieces.push({ name: smallest.name, centre: 0, scale: lengthPx / size(smallest) });
    } else {
      return null;
    }
    const parts = pieces.flatMap((p) => {
      const model = this.loaded.get(p.name);
      return model ? [{ template: model.template, centre: p.centre * PX, scale: p.scale }] : [];
    });
    if (parts.length !== pieces.length) return null;
    return loader.mergeTiles(parts, axis);
  }

  /** The first mesh of a model, for instancing (the field's drifting motes). */
  firstMesh(name: string): THREE.Mesh | null {
    const model = this.loaded.get(name);
    let found: THREE.Mesh | null = null;
    model?.template.traverse((node) => {
      if (!found && (node as THREE.Mesh).isMesh) found = node as THREE.Mesh;
    });
    return found;
  }

  /** What actually loaded, for `__db` and the tests. */
  status(): { loaded: number; failed: string[] } {
    return { loaded: this.loaded.size, failed: [...this.failed] };
  }

  private async load(baseUrl: string): Promise<void> {
    const manifestUrl = new URL(`${baseUrl}models/manifest.json`, globalThis.location.href);
    let entries: AssetEntry[];
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) return;
      entries = parseManifest(await response.json());
    } catch {
      return; // no manifest, or not JSON: primitives it is
    }
    if (entries.length === 0) return;
    // Only a build with models pays for the loader.
    const loader = await import('./modelLoader');
    this.loader = loader;
    const queue = [...entries];
    const worker = async (): Promise<void> => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        try {
          const gltf = await loader.loadGlb(new URL(entry.file, manifestUrl).href);
          this.loaded.set(entry.name, { entry, template: gltf.scene, clips: gltf.animations });
          if (entry.catalogId !== undefined) this.byCatalog.set(entry.catalogId, entry);
        } catch (error) {
          this.failed.push(entry.name);
          console.warn(`[models] ${entry.name}: ${entry.file} failed to load, keeping the primitive`, error);
        }
      }
    };
    await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, worker));
    if (this.loaded.size > 0) this.version++;
  }
}
