/**
 * The sea going about its business: marine snow, loose bubbles going up, far shoals crossing. One instanced
 * draw call, depth-tested so every ledge stays in front. None of it is a rule and none of it can be touched,
 * so it stays small and faint (GDD pillar 5). It runs on simulation time: a paused world is a paused sea.
 */
import * as THREE from 'three';
import { reducedMotion } from '../fx/motion';
import { PX, wx, wy } from './Stage';
import { Sprite, SpriteBatch } from './softSprites';
import type { SpriteKind } from './softSprites';

const Z = -6;
const MOTES = 30;
const BUBBLES = 9;
const SHOALS = 3;
const FISH_PER_SHOAL = 5;
const COUNT = MOTES + BUBBLES + SHOALS * FISH_PER_SHOAL;
/** Reach past each edge of the view, so nothing pops in; design px. */
const MARGIN = 26;
/** How much of the camera's travel each kind follows: less than all of it reads as far away. */
const PARALLAX = { mote: 0.82, bubble: 0.9, fish: 0.55 } as const;
/** Reduced motion keeps the sea but slows it to almost still. */
const CALM_SPEED = 0.18;
const MOTE_TINT = 0xeafaf6;
const BUBBLE_TINT = 0xd8f4f6;
const SHOAL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-11, -5],
  [-9, 6],
  [-21, 1],
  [-19, -9],
];

const wrap = (v: number, span: number): number => ((v % span) + span) % span;

export class AmbientLife {
  private readonly batch = new SpriteBatch(COUNT, true);
  readonly mesh = this.batch.mesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly moteTint = new THREE.Color(MOTE_TINT);
  private readonly bubbleTint = new THREE.Color(BUBBLE_TINT);
  private readonly fishTint = new THREE.Color();
  /** Accumulated, so slowing the sea down never jumps it. */
  private clock = 0;
  private lastTimeS = -1;

  constructor() {
    this.mesh.renderOrder = 1;
  }

  private put(i: number, x: number, y: number, sx: number, sy: number, tint: THREE.Color, alpha: number, kind: SpriteKind): void {
    this.matrix.compose(this.pos.set(wx(x), wy(y), Z), this.quat, this.size.set(sx * PX, sy * PX, 1));
    // Nothing floats above the surface.
    this.batch.write(i, this.matrix, tint, y < 3 ? 0 : alpha, kind);
  }

  update(renderX: number, renderY: number, viewW: number, viewH: number, timeS: number, water: THREE.Color): void {
    const calm = reducedMotion();
    const dt = this.lastTimeS < 0 ? 0 : Math.max(0, timeS - this.lastTimeS);
    this.lastTimeS = timeS;
    this.clock += dt * (calm ? CALM_SPEED : 1);
    const t = this.clock;
    const spanX = viewW + MARGIN * 2;
    const spanY = viewH + MARGIN * 2;
    let i = 0;

    for (let m = 0; m < MOTES; m++, i++) {
      const u = (m * 0.618034) % 1;
      const v = (m * 0.754877) % 1;
      const x = wrap(u * spanX * 3 + t * (1.5 + u * 3) - renderX * PARALLAX.mote, spanX) - MARGIN;
      const y = wrap(v * spanY * 3 + t * (2 + v * 3.5) - renderY * PARALLAX.mote, spanY) - MARGIN;
      const size = 0.35 + ((m * 7) % 5) * 0.11;
      const twinkle = 0.14 + 0.1 * Math.sin(t * (0.5 + u) + m);
      this.put(i, renderX + x + Math.sin(t * 0.4 + m) * 2, renderY + y, size, size, this.moteTint, twinkle, Sprite.glow);
    }

    for (let b = 0; b < BUBBLES; b++, i++) {
      const u = (b * 0.381966) % 1;
      const v = (b * 0.56984) % 1;
      const speed = 11 + v * 15;
      const x = wrap(u * spanX * 2 - renderX * PARALLAX.bubble, spanX) - MARGIN;
      const y = wrap(v * spanY * 2 - t * speed - renderY * PARALLAX.bubble, spanY) - MARGIN;
      const size = 0.8 + ((b * 3) % 4) * 0.35;
      this.put(i, renderX + x + Math.sin(t * 1.6 + b * 2) * 2.4, renderY + y, size, size, this.bubbleTint, 0.42, Sprite.bubble);
    }

    // Darker than the water at any depth: shapes passing far away, never a thing to dodge.
    this.fishTint.copy(water).multiplyScalar(0.55);
    for (let s = 0; s < SHOALS; s++) {
      const dir = s % 2 === 0 ? 1 : -1;
      const speed = 5 + s * 1.7;
      const span = spanX + 80;
      const cx = wrap(s * 151 + dir * t * speed - renderX * PARALLAX.fish, span) - MARGIN - 40;
      const cy = wrap(s * 263 + 60 - renderY * PARALLAX.fish, spanY) - MARGIN + Math.sin(t * 0.25 + s) * 5;
      for (let f = 0; f < FISH_PER_SHOAL; f++, i++) {
        const [ox = 0, oy = 0] = SHOAL_OFFSETS[f] ?? [];
        const wag = 1 + Math.sin(t * 7 + f * 1.7) * 0.07;
        const size = 3.4 + (f % 3) * 0.5;
        const x = renderX + cx + ox * dir + Math.sin(t * 0.7 + f) * 1.5;
        const y = renderY + cy + oy + Math.sin(t * 0.9 + f * 2);
        this.put(i, x, y, size * wag * dir, size, this.fishTint, 0.3, Sprite.fish);
      }
    }
    this.batch.flush(COUNT);
  }
}
