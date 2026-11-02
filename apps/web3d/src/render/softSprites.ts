/**
 * One instanced draw call of soft, round quads: every bubble, glow, ring and distant fish in the game. The
 * shapes are drawn in the fragment shader, so they stay smooth at any size for two triangles apiece.
 */
import * as THREE from 'three';

export const Sprite = { bubble: 0, glow: 1, ring: 2, strip: 3, spark: 4, fish: 5 } as const;
export type SpriteKind = (typeof Sprite)[keyof typeof Sprite];

const vertex = /* glsl */ `
  attribute vec3 aTint;
  attribute vec2 aStyle;
  varying vec2 vP;
  varying vec3 vTint;
  varying float vAlpha;
  varying float vKind;
  void main() {
    vP = position.xy;
    vTint = aTint;
    vAlpha = aStyle.x;
    vKind = aStyle.y;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  varying vec2 vP;
  varying vec3 vTint;
  varying float vAlpha;
  varying float vKind;
  void main() {
    float d = length(vP);
    float a = 0.0;
    vec3 colour = vTint;
    if (vKind < 0.5) {
      // Bubble: nearly clear inside, a bright rim and a window highlight.
      float edge = 1.0 - smoothstep(0.88, 1.0, d);
      float rim = smoothstep(0.58, 0.86, d) * edge;
      float spec = 1.0 - smoothstep(0.0, 0.3, length(vP - vec2(-0.34, 0.38)));
      a = 0.16 * edge + 0.72 * rim + spec;
      colour = mix(colour, vec3(1.0), spec);
    } else if (vKind < 1.5) {
      a = pow(max(0.0, 1.0 - d), 1.7);
    } else if (vKind < 2.5) {
      a = smoothstep(0.7, 0.9, d) * (1.0 - smoothstep(0.92, 1.0, d));
    } else if (vKind < 3.5) {
      // A bar of light: soft at both ends and across.
      float along = 1.0 - pow(abs(vP.x), 2.5);
      a = along * pow(max(0.0, 1.0 - abs(vP.y)), 1.5);
    } else if (vKind < 4.5) {
      float s = sqrt(abs(vP.x)) + sqrt(abs(vP.y));
      a = 1.0 - smoothstep(0.55, 1.0, s);
    } else {
      // A distant fish, facing +X: only ever a shape in the water.
      float body = 1.0 - smoothstep(0.82, 1.0, length(vec2((vP.x - 0.12) / 0.66, vP.y / 0.3)));
      float tailX = -vP.x - 0.42;
      float tail = step(0.0, tailX) * step(tailX, 0.5) * (1.0 - smoothstep(tailX * 0.7, tailX * 0.7 + 0.06, abs(vP.y)));
      a = max(body, tail);
    }
    gl_FragColor = vec4(colour, clamp(a, 0.0, 1.0) * vAlpha);
    #include <colorspace_fragment>
  }
`;

export class SpriteBatch {
  readonly mesh: THREE.InstancedMesh;
  private readonly tint: THREE.InstancedBufferAttribute;
  private readonly style: THREE.InstancedBufferAttribute;

  constructor(capacity: number, depthTest: boolean) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.style = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    this.tint.setUsage(THREE.DynamicDrawUsage);
    this.style.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aTint', this.tint);
    geometry.setAttribute('aStyle', this.style);
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      depthTest,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
  }

  /** The tint is a THREE.Color, already in the renderer's working space. */
  write(i: number, matrix: THREE.Matrix4, tint: THREE.Color, alpha: number, kind: SpriteKind): void {
    this.mesh.setMatrixAt(i, matrix);
    this.tint.setXYZ(i, tint.r, tint.g, tint.b);
    this.style.setXY(i, alpha, kind);
  }

  flush(count: number): void {
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tint.needsUpdate = true;
    this.style.needsUpdate = true;
  }
}
