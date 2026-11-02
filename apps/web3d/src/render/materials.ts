/**
 * Shared low-poly geometry and the zone-tinted material bank. Sharing is what keeps a screen of
 * placeholders cheap: every ledge is the same unit box, scaled, and the bank repaints in place on a
 * zone change instead of rebuilding anything.
 */
import * as THREE from 'three';
import type { ZoneIndex } from '@deeply-bubbly/core';
import { ZONE_PALETTES } from '../palette';

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  /** Radius 1. Detail 1 keeps visible flat facets. */
  blob: new THREE.IcosahedronGeometry(1, 1),
  /** Radius 1, the fewest faces that still read as round: spikes, chips, particles. */
  chip: new THREE.IcosahedronGeometry(1, 0),
  /** Height 1, base radius 0.5, centred, tip towards +Y. */
  cone: new THREE.ConeGeometry(0.5, 1, 6),
  plane: new THREE.PlaneGeometry(1, 1),
  disc: new THREE.CircleGeometry(1, 12),
};

const flat = (color: number, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

/** What a material paints, as a palette field of the current zone. */
type PaletteKey = 'rock' | 'rockLight' | 'coral' | 'kelp' | 'foam' | 'jelly' | 'accent';

export class MaterialBank {
  readonly rock = flat(0xffffff);
  readonly reef = flat(0xffffff);
  readonly coral = flat(0xffffff);
  readonly kelp = flat(0xffffff);
  readonly jelly = flat(0xffffff, { transparent: true, opacity: 0.88 });
  readonly snow = flat(0xffffff);
  readonly foam = flat(0xffffff);
  readonly shell = flat(0xffffff);
  readonly creature = flat(0xffffff);
  readonly accent = flat(0xffffff);
  /** The rest line under a capturable ledge: unlit, so the eye finds it first (§2.3). */
  readonly restLine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  zone: ZoneIndex = 0;

  private readonly tinted: ReadonlyArray<readonly [THREE.MeshLambertMaterial | THREE.MeshBasicMaterial, PaletteKey]> = [
    [this.rock, 'rock'],
    [this.reef, 'rockLight'],
    [this.coral, 'coral'],
    [this.kelp, 'kelp'],
    [this.jelly, 'jelly'],
    [this.snow, 'foam'],
    [this.foam, 'foam'],
    [this.shell, 'rockLight'],
    [this.creature, 'kelp'],
    [this.accent, 'accent'],
    [this.restLine, 'foam'],
  ];

  constructor(zone: ZoneIndex) {
    this.setZone(zone);
  }

  setZone(zone: ZoneIndex): void {
    this.zone = zone;
    const palette = ZONE_PALETTES[zone];
    for (const [material, key] of this.tinted) material.color.setHex(palette[key]);
  }

  /** A solid's body by its `material` field in core. */
  solid(material: string): THREE.Material {
    switch (material) {
      case 'coral':
        return this.coral;
      case 'kelp':
        return this.kelp;
      case 'jelly':
        return this.jelly;
      case 'snow':
        return this.snow;
      case 'foam':
        return this.foam;
      case 'shell':
        return this.shell;
      case 'creature':
        return this.creature;
      case 'reef':
        return this.reef;
      default:
        return this.rock;
    }
  }
}

/**
 * Every material under `root` is cloned to this instance and returned with its authored opacity, for a
 * view that fades on its own (a dormant hazard). Shared materials stay shared everywhere else.
 */
export function ownMaterials(root: THREE.Object3D): Array<{ material: THREE.Material; base: number }> {
  const owned: Array<{ material: THREE.Material; base: number }> = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const adopt = (m: THREE.Material): THREE.Material => {
      const clone = m.clone();
      owned.push({ material: clone, base: clone.opacity });
      return clone;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(adopt) : adopt(mesh.material);
  });
  return owned;
}
