/**
 * The painted layers of `public/backgrounds`, drawn per their manifest (see its `sampling` note): water,
 * far, mid and near reef, and rays, each a full-screen quad at the far plane, sampled in view space so a
 * layer's parallax, tiling and animation are a few lines of shader and no geometry.
 *
 * Everything is optional, like the models: no manifest or a failed texture means no layer, and `Background`
 * keeps its gradient. Layers wash towards the Atmosphere's water, so a tile painted once sits right at any
 * depth of its zone, and each zone group crossfades over the manifest's distance around the boundary.
 * Only the layers on screen draw: five calls, ten during a crossfade.
 */
import * as THREE from 'three';

interface LayerSpec {
  id: string;
  file: string;
  zone: number;
  role: 'water' | 'far' | 'mid' | 'near' | 'rays';
  order: number;
  tileDesignPx: { w: number; h: number };
  parallax: { x: number; y: number };
  tiling: { x: 'repeat' | 'clamp'; y: 'repeat' | 'clamp' };
  blend: 'normal' | 'additive';
  fadeIn?: { fromLayerY: number; toLayerY: number };
  animation?: {
    kind: string;
    maskTopDesignPx?: number;
    amplitudeDesignPx?: number;
    waveNumberPerDesignPx?: number;
    radPerS?: number;
    scrollDesignPxPerS?: [number, number];
    secondCopyScaleX?: number;
    pulseOpacity?: [number, number];
    pulsePeriodS?: number;
  };
}

interface Manifest {
  zones: Record<string, { worldY: [number, number]; crossfadeDesignPx: number }>;
  layers: LayerSpec[];
}

interface Layer {
  spec: LayerSpec;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  zoneTop: number;
}

/** How far each role sinks into the water's current colour, on top of what the tile already has painted in. */
const WASH: Readonly<Record<LayerSpec['role'], number>> = { water: 0, far: 0.34, mid: 0.24, near: 0.16, rays: 0 };
/** Rays thin out with depth: full at the top of their zone, this much at the bottom of it. */
const RAYS_END: Readonly<Record<number, number>> = { 1: 0.55, 2: 0 };

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Glued to the glass, at the far plane: ledges and anything else that writes depth stays in front.
    gl_Position = vec4(position.xy * 2.0, 0.99995, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uView;
  uniform vec2 uCam;
  uniform vec2 uParallax;
  uniform vec2 uTile;
  uniform vec2 uFade;
  uniform vec4 uWobble; // mask, amplitude, wave number, rad/s
  uniform vec3 uRays; // scroll 1, scroll 2, second copy's x scale; zero scale means this is no ray layer
  uniform vec3 uWater;
  uniform float uWash;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 view = vec2(vUv.x, 1.0 - vUv.y) * uView;
    vec2 layer = view + uCam * uParallax;
    vec4 tex;
    if (uRays.z > 0.0) {
      float v = 1.0 - view.y / uView.y;
      vec4 a = texture2D(uMap, vec2((layer.x + uRays.x * uTime) / uTile.x, v));
      vec4 b = texture2D(uMap, vec2((layer.x + uRays.y * uTime) * uRays.z / uTile.x, v));
      tex = vec4(a.rgb, 0.5 * (a.a + b.a));
    } else {
      float y = layer.y;
      if (uWobble.x > 0.0) {
        float mask = 1.0 - smoothstep(uWobble.x * 0.6, uWobble.x, y);
        y += sin(layer.x * uWobble.z + uTime * uWobble.w) * uWobble.y * mask;
      }
      tex = texture2D(uMap, vec2(layer.x / uTile.x, 1.0 - y / uTile.y));
    }
    float alpha = tex.a * uOpacity;
    if (uFade.y > uFade.x) alpha *= smoothstep(uFade.x, uFade.y, layer.y);
    gl_FragColor = vec4(mix(tex.rgb, uWater, uWash), alpha);
    #include <colorspace_fragment>
  }
`;

export class Parallax {
  readonly root = new THREE.Group();
  /** True once every layer has loaded: `Background` can stop drawing its gradient. */
  ready = false;
  private layers: Layer[] = [];
  private boundary = 0;
  private crossfade = 240;
  private zoneSpans: Record<number, [number, number]> = {};

  constructor(baseUrl: string) {
    void this.load(baseUrl).catch(() => undefined);
  }

  private async load(baseUrl: string): Promise<void> {
    const response = await fetch(`${baseUrl}manifest.json`);
    if (!response.ok) return;
    const manifest = (await response.json()) as Manifest;
    const loader = new THREE.TextureLoader();
    const built = await Promise.all(
      manifest.layers.map(async (spec) => {
        const texture = await loader.loadAsync(`${baseUrl}${spec.file}`);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = spec.tiling.x === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.wrapT = spec.tiling.y === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        return this.build(spec, texture, manifest.zones[String(spec.zone)]?.worldY[0] ?? 0);
      }),
    );
    const first = manifest.zones['1'];
    this.boundary = first?.worldY[1] ?? 0;
    this.crossfade = first?.crossfadeDesignPx ?? 240;
    for (const [zone, value] of Object.entries(manifest.zones)) this.zoneSpans[Number(zone)] = value.worldY;
    this.layers = built;
    for (const layer of built) this.root.add(layer.mesh);
    this.ready = true;
  }

  private build(spec: LayerSpec, texture: THREE.Texture, zoneTop: number): Layer {
    const anim = spec.animation;
    const wobble = anim?.kind === 'surfaceWobble';
    const rays = anim?.kind === 'dualScrollPulse';
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uMap: { value: texture },
        uView: { value: new THREE.Vector2(180, 400) },
        uCam: { value: new THREE.Vector2() },
        uParallax: { value: new THREE.Vector2(spec.parallax.x, spec.parallax.y) },
        uTile: { value: new THREE.Vector2(spec.tileDesignPx.w, spec.tileDesignPx.h) },
        uFade: { value: new THREE.Vector2(spec.fadeIn?.fromLayerY ?? 0, spec.fadeIn?.toLayerY ?? 0) },
        uWobble: {
          value: wobble
            ? new THREE.Vector4(anim.maskTopDesignPx ?? 0, anim.amplitudeDesignPx ?? 0, anim.waveNumberPerDesignPx ?? 0, anim.radPerS ?? 0)
            : new THREE.Vector4(),
        },
        uRays: {
          value: rays
            ? new THREE.Vector3(anim.scrollDesignPxPerS?.[0] ?? 0, anim.scrollDesignPxPerS?.[1] ?? 0, anim.secondCopyScaleX ?? 1)
            : new THREE.Vector3(),
        },
        uWater: { value: new THREE.Color() },
        uWash: { value: WASH[spec.role] },
        uOpacity: { value: 1 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: spec.blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -800 + spec.zone * 10 + spec.order;
    return { spec, mesh, material, zoneTop };
  }

  update(renderX: number, renderY: number, viewW: number, viewH: number, timeS: number, water: THREE.Color): void {
    if (!this.ready) return;
    const half = this.crossfade / 2;
    const k = THREE.MathUtils.smoothstep(renderY + viewH / 2, this.boundary - half, this.boundary + half);
    for (const { spec, mesh, material, zoneTop } of this.layers) {
      const group = spec.zone === 1 ? 1 - k : k;
      // The second zone's water lies over the first, whose bottom it matches: it alone does the crossing.
      const firstWater = spec.role === 'water' && spec.zone === 1;
      const opacity = firstWater ? 1 : group;
      mesh.visible = firstWater ? k < 1 : opacity > 0.001;
      if (!mesh.visible) continue;
      const u = material.uniforms;
      let pulse = 1;
      const anim = spec.animation;
      if (anim?.kind === 'dualScrollPulse') {
        const [lo, hi] = anim.pulseOpacity ?? [1, 1];
        pulse = lo + (hi - lo) * (0.5 + 0.5 * Math.sin((timeS / (anim.pulsePeriodS ?? 7)) * Math.PI * 2));
        const span = this.zoneSpans[spec.zone] ?? [0, 1];
        const depth = THREE.MathUtils.clamp((renderY + viewH / 2 - span[0]) / (span[1] - span[0]), 0, 1);
        pulse *= THREE.MathUtils.lerp(1, RAYS_END[spec.zone] ?? 1, depth);
      }
      (u['uOpacity'] as THREE.IUniform<number>).value = opacity * pulse;
      (u['uTime'] as THREE.IUniform<number>).value = timeS;
      (u['uView'] as THREE.IUniform<THREE.Vector2>).value.set(viewW, viewH);
      (u['uCam'] as THREE.IUniform<THREE.Vector2>).value.set(renderX, renderY - zoneTop);
      (u['uWater'] as THREE.IUniform<THREE.Color>).value.copy(water);
    }
  }
}
