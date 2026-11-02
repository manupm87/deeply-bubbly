/**
 * The heavy half of the model registry, imported on demand so a build with no models never downloads it.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();

/** One Lambert per glTF material: flat faces need no PBR, and a phone feels the difference (WEB3D.md). */
function toLambert(source: THREE.Material): THREE.MeshLambertMaterial {
  const m = source as THREE.MeshStandardMaterial;
  const lambert = new THREE.MeshLambertMaterial({
    name: m.name,
    color: m.color,
    emissive: m.emissive,
    emissiveIntensity: m.emissiveIntensity,
    vertexColors: m.vertexColors,
    transparent: m.transparent,
    opacity: m.opacity,
    depthWrite: m.depthWrite,
    side: m.side,
  });
  source.dispose();
  return lambert;
}

/**
 * A contour is an inverted hull: opaque, its far side would fill the whole silhouette behind the glass and
 * Bur would stop being see-through. So the glass goes first and writes depth, and the hull comes after it
 * in the transparent queue: only the ring outside the glass survives the depth test.
 */
function orderGlass(mesh: THREE.Mesh, material: THREE.Material): void {
  if (material.name === 'db_glass') {
    material.depthWrite = true;
    mesh.renderOrder = 1;
  } else if (material.name === 'db_contour') {
    material.transparent = true;
    material.userData['alwaysBlended'] = true;
    mesh.renderOrder = 2;
  }
}

export async function loadGlb(url: string): Promise<GLTF> {
  const gltf = await loader.loadAsync(url);
  const converted = new Map<THREE.Material, THREE.MeshLambertMaterial>();
  const convert = (m: THREE.Material): THREE.MeshLambertMaterial => {
    let lambert = converted.get(m);
    if (!lambert) {
      lambert = toLambert(m);
      converted.set(m, lambert);
    }
    return lambert;
  };
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
    if (!Array.isArray(mesh.material)) orderGlass(mesh, mesh.material);
  });
  return gltf;
}

/** Skinned models need their skeleton rebound; `Object3D.clone` would share the original's. */
export function cloneModel(template: THREE.Object3D): THREE.Object3D {
  return cloneSkinned(template);
}

export interface TilePart {
  template: THREE.Object3D;
  /** Centre along the axis, in Three units. */
  centre: number;
  /** Scale along the axis. */
  scale: number;
}

/** Bakes the pieces into one geometry. Tiles are static single-material meshes by construction. */
export function mergeTiles(parts: readonly TilePart[], axis: 'x' | 'y'): THREE.Mesh | null {
  const geometries: THREE.BufferGeometry[] = [];
  let material: THREE.Material | THREE.Material[] | null = null;
  const placement = new THREE.Matrix4();
  for (const part of parts) {
    part.template.updateMatrixWorld(true);
    placement.makeTranslation(axis === 'x' ? part.centre : 0, axis === 'y' ? part.centre : 0, 0);
    placement.scale(new THREE.Vector3(axis === 'x' ? part.scale : 1, axis === 'y' ? part.scale : 1, 1));
    part.template.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      material ??= mesh.material;
      geometries.push(mesh.geometry.clone().applyMatrix4(placement.clone().multiply(mesh.matrixWorld)));
    });
  }
  if (!material || geometries.length === 0) return null;
  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
  for (const g of geometries) if (g !== merged) g.dispose();
  return merged ? new THREE.Mesh(merged, material) : null;
}
