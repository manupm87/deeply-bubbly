/**
 * Everything the water does to light (GDD §3.2), derived from one number, the depth the camera is at, so
 * a respawn or a `?start=` shows the same sea a player swimming down would see: nothing here remembers.
 *
 * - Zone colour: each palette's `waterTop → waterBottom` runs along the zone, and consecutive zones share
 *   that colour at their border, so the descent has no seam.
 * - Fog: range starts just behind the play plane. What Bur can touch is never washed; only decoration is.
 * - God rays: Z1's visual trick, one additive quad with a procedural shader, behind everything playable.
 *   They thin out with depth and are gone in Z2's penumbra.
 */
import * as THREE from 'three';
import { ZONES } from '@deeply-bubbly/core';
import { ZONE_PALETTES } from '../palette';
import { PX, type Stage } from './Stage';

export interface WaterColors {
  top: THREE.Color;
  bottom: THREE.Color;
  /** At the centre of the view, which is what the fog fades to. */
  middle: THREE.Color;
}

interface ZoneLight {
  sky: number;
  ground: number;
  hemi: number;
  sun: number;
  sunColor: number;
}

/** One entry per zone. Only Z1 and Z2 have art; the others keep darkening so a primitive still reads. */
const ZONE_LIGHT: readonly ZoneLight[] = [
  { sky: 0xeafcff, ground: 0x3f8f9f, hemi: 2.1, sun: 2.0, sunColor: 0xfff0c0 },
  { sky: 0xa8e6e6, ground: 0x1c4f63, hemi: 1.75, sun: 1.25, sunColor: 0xc4f0e8 },
  { sky: 0x7fa8d8, ground: 0x142a44, hemi: 1.4, sun: 0.7, sunColor: 0x9fc0e8 },
  { sky: 0x60809f, ground: 0x0b1a2c, hemi: 1.2, sun: 0.4, sunColor: 0x80a0c0 },
  { sky: 0x60708a, ground: 0x0b1420, hemi: 1.1, sun: 0.3, sunColor: 0x8090a0 },
  { sky: 0x50607a, ground: 0x080c14, hemi: 1.0, sun: 0.2, sunColor: 0x708090 },
];

/** Design px over which lights cross from one zone to the next, centred on the border. */
const LIGHT_BLEND_PX = 480;
/** The gradient spans more water than the view holds, or it would be invisible on a 400 px screen. */
const GRADIENT_REACH_PX = 620;
/** Fog range in Three units behind the play plane: none on the deepest ledge, most of it on the far layer. */
const FOG_NEAR = 1;
const FOG_FAR = 78;
const RAYS_Z = -12;
const RAYS_MAX = 0.17;
/** Rays are gone by the middle of Z2. */
const RAYS_END_PX = 5000;

const raysVertex = /* glsl */ `
  varying vec2 vWorld;
  varying float vV;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xy;
    vV = uv.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const raysFragment = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform vec3 uColor;
  varying vec2 vWorld;
  varying float vV;
  float shaft(float s, float freq, float phase, float speed, float edge) {
    return smoothstep(edge, 1.0, sin(s * freq + phase + uTime * speed) * 0.5 + 0.5);
  }
  void main() {
    // Slanted away from the sun, which sits up and to the left like the key light.
    float s = vWorld.x + vWorld.y * 0.42;
    float r = shaft(s, 0.37, 0.0, 0.11, 0.55) + 0.7 * shaft(s, 0.83, 1.7, -0.08, 0.62) + 0.45 * shaft(s, 1.71, 4.1, 0.15, 0.72);
    gl_FragColor = vec4(uColor, r * uStrength * (0.25 + 0.75 * vV));
  }
`;

function zoneIndexAt(y: number): number {
  let i = 0;
  while (i < ZONES.length - 1 && y >= (ZONES[i]?.endPx ?? 0)) i++;
  return i;
}

export class Atmosphere {
  readonly water: WaterColors = { top: new THREE.Color(), bottom: new THREE.Color(), middle: new THREE.Color() };
  readonly rays: THREE.Mesh;
  /** Current strength of the rays, for `__db` and the tests. */
  raysStrength = 0;
  private readonly raysMaterial: THREE.ShaderMaterial;
  private readonly scratch = new THREE.Color();
  private readonly stage: Stage;

  constructor(stage: Stage) {
    this.stage = stage;
    this.raysMaterial = new THREE.ShaderMaterial({
      vertexShader: raysVertex,
      fragmentShader: raysFragment,
      uniforms: { uTime: { value: 0 }, uStrength: { value: 0 }, uColor: { value: new THREE.Color(0xfff6cf) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.rays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.raysMaterial);
    this.rays.frustumCulled = false;
    this.rays.renderOrder = -500;
  }

  /** The water at a depth: top colour of its zone running to the bottom one along the zone. */
  private waterAt(y: number, out: THREE.Color): void {
    const i = zoneIndexAt(y);
    const zone = ZONES[i];
    const palette = ZONE_PALETTES[i] ?? ZONE_PALETTES[0];
    const u = zone ? THREE.MathUtils.clamp((y - zone.startPx) / (zone.endPx - zone.startPx), 0, 1) : 0;
    out.setHex(palette.waterTop).lerp(this.scratch.setHex(palette.waterBottom), u);
  }

  private applyLights(y: number): void {
    const i = zoneIndexAt(y);
    const zone = ZONES[i];
    if (!zone) return;
    // Crossing a border: blend with the zone on the other side of whichever border is nearer.
    let from = i;
    let to = i;
    let k = 0;
    if (y < zone.startPx + LIGHT_BLEND_PX / 2 && i > 0) {
      from = i - 1;
      k = 0.5 + (y - zone.startPx) / LIGHT_BLEND_PX;
    } else if (y > zone.endPx - LIGHT_BLEND_PX / 2 && i < ZONES.length - 1) {
      to = i + 1;
      k = 0.5 - (zone.endPx - y) / LIGHT_BLEND_PX;
    }
    const p = ZONE_LIGHT[from];
    const q = ZONE_LIGHT[to];
    if (!p || !q) return;
    const { hemi, sun } = this.stage;
    hemi.intensity = THREE.MathUtils.lerp(p.hemi, q.hemi, k);
    hemi.color.setHex(p.sky).lerp(this.scratch.setHex(q.sky), k);
    hemi.groundColor.setHex(p.ground).lerp(this.scratch.setHex(q.ground), k);
    sun.intensity = THREE.MathUtils.lerp(p.sun, q.sun, k);
    sun.color.setHex(p.sunColor).lerp(this.scratch.setHex(q.sunColor), k);
  }

  /** Positions in design px; `timeS` is simulation time, so that a pause freezes the light too. */
  update(renderX: number, renderY: number, viewW: number, viewH: number, timeS: number): void {
    const centre = renderY + viewH / 2;
    const { water, stage } = this;
    this.waterAt(centre - GRADIENT_REACH_PX, water.top);
    this.waterAt(centre + GRADIENT_REACH_PX, water.bottom);
    this.waterAt(centre, water.middle);
    this.applyLights(centre);

    const fog = stage.scene.fog as THREE.Fog;
    fog.color.copy(water.middle);
    fog.near = stage.distance + FOG_NEAR;
    fog.far = stage.distance + FOG_FAR;

    const strength = RAYS_MAX * THREE.MathUtils.clamp(1 - centre / RAYS_END_PX, 0, 1) ** 1.4;
    this.raysStrength = strength;
    const rays = this.rays;
    rays.visible = strength > 0.002;
    if (!rays.visible) return;
    const uniforms = this.raysMaterial.uniforms;
    if (uniforms['uTime']) uniforms['uTime'].value = timeS;
    if (uniforms['uStrength']) uniforms['uStrength'].value = strength;
    // Overfills the frustum at its depth; it moves with the camera, the shafts stay put in the world.
    const stretch = ((stage.distance - RAYS_Z) / stage.distance) * 1.04;
    rays.position.set((renderX + viewW / 2) * PX, -centre * PX, RAYS_Z);
    rays.scale.set(viewW * PX * stretch, viewH * PX * stretch, 1);
  }
}
