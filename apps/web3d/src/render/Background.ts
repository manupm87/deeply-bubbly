/**
 * The water behind the play plane: a vertical gradient glued to the camera in the colours the Atmosphere
 * gives it (GDD §3.2), the light above the surface, and a handful of far rocks that wrap around the
 * camera so depth is visible even with no models. One instanced draw call for the rocks. Purely decorative: never a rule.
 */
import * as THREE from 'three';
import { zoneAt } from '@deeply-bubbly/core';
import { ZONE_PALETTES } from '../palette';
import type { WaterColors } from './Atmosphere';
import { GEO } from './materials';
import { PX, wx, wy } from './Stage';

const FAR_Z = -70;
const SKY_TOP = 0xcdf3ee;
const SKY_LOW = 0x9fe9e6;
const SKY_H_PX = 500;
/** The sky dissolves into the water over this much depth: there is no hard line at the surface. */
const SKY_FADE_PX = 46;
const ROCKS = 16;
/** Design px after which the rock pattern repeats vertically. */
const ROCK_PERIOD = 900;

export class Background {
  readonly root = new THREE.Group();
  private readonly gradient: THREE.Mesh;
  private readonly colors: THREE.BufferAttribute;
  private readonly top = new THREE.Color();
  private readonly bottom = new THREE.Color();
  private readonly rocks: THREE.InstancedMesh;
  private readonly rockMaterial = new THREE.MeshLambertMaterial({ flatShading: true, color: 0xffffff });
  private readonly rockSeeds: { x: number; y: number; z: number; sx: number; sy: number; rot: number }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly water = new THREE.Color();
  private readonly rockColor = new THREE.Color();

  constructor(worldW: number) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.colors = new THREE.BufferAttribute(new Float32Array(4 * 3), 3);
    geometry.setAttribute('color', this.colors);
    this.gradient = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, depthTest: false, fog: false }),
    );
    this.gradient.renderOrder = -1000;
    this.gradient.frustumCulled = false;
    this.root.add(this.gradient);

    this.rocks = new THREE.InstancedMesh(GEO.chip, this.rockMaterial, ROCKS);
    this.rocks.frustumCulled = false;
    this.rocks.renderOrder = -900;
    this.root.add(this.rocks);
    // A fixed golden-ratio scatter: the same sea every run.
    for (let i = 0; i < ROCKS; i++) {
      const u = (i * 0.618034) % 1;
      const v = (i * 0.754877) % 1;
      this.rockSeeds.push({
        x: u * worldW,
        y: v * ROCK_PERIOD,
        z: -24 - ((i * 7) % 3) * 8,
        sx: 3 + ((i * 5) % 7) * 0.9,
        sy: 2.4 + ((i * 3) % 5) * 1.2,
        rot: i * 1.3,
      });
    }

    // The air above the surface: the camera opens on it. Light, not white, and with no edge of its own.
    const skyGeometry = new THREE.PlaneGeometry(1, 1, 1, 2);
    const top = new THREE.Color(SKY_TOP);
    const low = new THREE.Color(SKY_LOW);
    const stops = [
      [top, 0.9],
      [low, 0.82],
      [low, 0],
    ] as const;
    const sky = new Float32Array(6 * 4);
    const heights = skyGeometry.getAttribute('position');
    stops.forEach(([colour, alpha], row) => {
      for (let i = 0; i < 2; i++) {
        sky.set([colour.r, colour.g, colour.b, alpha], (row * 2 + i) * 4);
        heights.setY(row * 2 + i, row === 0 ? SKY_H_PX * PX : row === 1 ? 0 : -SKY_FADE_PX * PX);
      }
    });
    skyGeometry.setAttribute('color', new THREE.BufferAttribute(sky, 4));
    const skyMesh = new THREE.Mesh(
      skyGeometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false }),
    );
    skyMesh.scale.x = wx(worldW) + 200;
    skyMesh.position.set(wx(worldW / 2), 0, -4);
    skyMesh.renderOrder = -700;
    this.root.add(skyMesh);
  }

  /** Gradient and far rocks are the stand-ins for the painted layers and the authored backdrop. */
  setLayersReady(layers: boolean, backdrop: boolean): void {
    this.gradient.visible = !layers;
    this.rocks.visible = !layers && !backdrop;
  }

  update(
    camera: THREE.PerspectiveCamera,
    distance: number,
    renderY: number,
    viewW: number,
    viewH: number,
    water: Readonly<WaterColors>,
  ): void {
    this.top.copy(water.top);
    this.bottom.copy(water.bottom);
    const c = this.colors;
    c.setXYZ(0, this.top.r, this.top.g, this.top.b);
    c.setXYZ(1, this.top.r, this.top.g, this.top.b);
    c.setXYZ(2, this.bottom.r, this.bottom.g, this.bottom.b);
    c.setXYZ(3, this.bottom.r, this.bottom.g, this.bottom.b);
    c.needsUpdate = true;

    // Glued to the camera and scaled to overfill the frustum at its depth.
    const stretch = ((distance - FAR_Z) / distance) * 1.04;
    this.gradient.position.set(camera.position.x, camera.position.y, FAR_Z);
    this.gradient.scale.set(viewW * PX * stretch, viewH * PX * stretch, 1);

    // Rocks are washed far towards the water: decoration must never read as a ledge (GDD pillar 5).
    if (!this.rocks.visible) return;
    this.water.copy(this.top).lerp(this.bottom, 0.5);
    this.rockColor.setHex(ZONE_PALETTES[zoneAt(renderY).index].rock);
    this.rockMaterial.color.copy(this.rockColor).lerp(this.water, 0.8).multiplyScalar(0.3);
    // Mostly self-lit in the water's colour, so its dark faces cannot out-contrast a real ledge.
    this.rockMaterial.emissive.copy(this.water).multiplyScalar(0.62);
    const centreY = renderY + viewH / 2;
    this.rockSeeds.forEach((seed, i) => {
      const y = seed.y + Math.round((centreY - seed.y) / ROCK_PERIOD) * ROCK_PERIOD;
      this.euler.set(seed.rot, seed.rot * 0.7, seed.rot * 0.4);
      this.matrix.compose(
        this.pos.set(wx(seed.x), wy(y), seed.z),
        this.quat.setFromEuler(this.euler),
        this.size.set(seed.sx, seed.sy, seed.sx),
      );
      this.rocks.setMatrixAt(i, this.matrix);
    });
    this.rocks.instanceMatrix.needsUpdate = true;
  }
}
