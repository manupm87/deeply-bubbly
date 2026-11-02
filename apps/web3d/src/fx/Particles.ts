/**
 * The particles of GDD §7: bubbles, rings and sparkles in ONE instanced draw call (`SpriteBatch`). They run
 * on real time, so they keep moving through a hitstop, and they live in water: quick to burst, quick to
 * slow down, then they rise. Depth testing is off and they draw under the sling's channels, so §7's golden
 * rule (nothing covers the guide) is a matter of render order.
 */
import * as THREE from 'three';
import type { Vec2 } from '@deeply-bubbly/core';
import { Sprite, SpriteBatch } from '../render/softSprites';
import type { SpriteKind } from '../render/softSprites';
import { PX, wx, wy } from '../render/Stage';
import { reducedMotion } from './motion';

const CAPACITY = 280;
const Z = 0.9;
const FOAM = 0xe8f6f3;
const SHIELD = 0xffe7a3;
const PEARL = 0xfff3d6;
const AIR = 0xc9f4ff;
const WARM = 0xffc9b0;

/** Spray at the contact, by what she hit: hard things chip pale, soft things stay water. */
const MATERIAL_TINT: Readonly<Record<string, number>> = {
  coral: 0xffc2a6,
  jelly: 0xf7c8e4,
  kelp: 0xcdeeb8,
  shell: 0xfff0d8,
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  drag: number;
  age: number;
  life: number;
  size: number;
  /** Size at the end of its life, as a fraction of `size`. */
  end: number;
  /** Width over height; only the light strips use it. */
  wide: number;
  alpha: number;
  kind: SpriteKind;
  wobble: number;
  seed: number;
  tint: THREE.Color;
  /** Flies to this point of the VIEW (a pip on the HUD) instead of drifting. */
  home: Vec2 | null;
}

interface Burst {
  count: number;
  angleMin?: number;
  angleMax?: number;
  speedMin?: number;
  speedMax?: number;
  lifeMin: number;
  lifeMax: number;
  size: number;
  end?: number;
  wide?: number;
  alpha?: number;
  ay?: number;
  drag?: number;
  wobble?: number;
  color?: number;
  kind?: SpriteKind;
  /** Spread of the spawn point, in design px. */
  spreadX?: number;
  spreadY?: number;
  home?: Vec2;
}

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
const degOf = (v: Vec2): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

export class Particles {
  private readonly batch = new SpriteBatch(CAPACITY, false);
  readonly mesh = this.batch.mesh;
  private readonly pool: Particle[] = [];
  private cursor = 0;
  private live = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.mesh.renderOrder = 10;
    for (let i = 0; i < CAPACITY; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ay: 0,
        drag: 0,
        age: 1,
        life: 0,
        size: 0,
        end: 1,
        wide: 1,
        alpha: 1,
        kind: Sprite.bubble,
        wobble: 0,
        seed: 0,
        tint: new THREE.Color(FOAM),
        home: null,
      });
    }
  }

  private burst(at: Vec2, o: Burst): void {
    const count = reducedMotion() ? Math.ceil(o.count / 2) : o.count;
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % CAPACITY;
      if (!p) continue;
      const angle = (rand(o.angleMin ?? 0, o.angleMax ?? 360) * Math.PI) / 180;
      const speed = rand(o.speedMin ?? 0, o.speedMax ?? 0);
      p.x = at.x + rand(-1, 1) * (o.spreadX ?? 0);
      p.y = at.y + rand(-1, 1) * (o.spreadY ?? 0);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ay = o.ay ?? 0;
      p.drag = o.drag ?? 0;
      p.age = 0;
      p.life = rand(o.lifeMin, o.lifeMax);
      p.size = o.size * (o.kind === undefined || o.kind === Sprite.bubble || o.kind === Sprite.spark ? rand(0.65, 1.25) : 1);
      p.end = o.end ?? 0.7;
      p.wide = o.wide ?? 1;
      p.alpha = o.alpha ?? 1;
      p.kind = o.kind ?? Sprite.bubble;
      p.wobble = o.wobble ?? 0;
      p.seed = rand(0, 100);
      p.tint.setHex(o.color ?? FOAM);
      p.home = o.home ?? null;
    }
  }

  /** The tail of 6–10 microbubbles and, the harder the pull, the wider the ring she leaves behind. */
  launchTail(at: Vec2, vel: Vec2, power: number): void {
    const back = degOf(vel) + 180;
    this.burst(at, {
      count: 6 + Math.round(power * 4),
      angleMin: back - 30,
      angleMax: back + 30,
      speedMin: 30,
      speedMax: 90 + 60 * power,
      drag: 3.5,
      ay: -30,
      wobble: 14,
      lifeMin: 380,
      lifeMax: 800,
      size: 1.5,
    });
    this.burst(at, { count: 1, kind: Sprite.ring, lifeMin: 300, lifeMax: 300, size: 4, end: 2 + 2.5 * power, alpha: 0.6 });
  }

  /** One bubble of the wake she leaves while she flies. */
  trail(at: Vec2, vel: Vec2): void {
    if (reducedMotion()) return;
    this.burst(at, {
      count: 1,
      angleMin: degOf(vel) + 160,
      angleMax: degOf(vel) + 200,
      speedMin: 4,
      speedMax: 16,
      ay: -22,
      wobble: 10,
      lifeMin: 420,
      lifeMax: 760,
      size: 0.9,
      alpha: 0.75,
      spreadX: 2,
      spreadY: 2,
    });
  }

  /** 12 at full speed, fewer on a nudge, sprayed along the normal, plus a flash where she touched. */
  impact(at: Vec2, normal: Vec2, speed: number, material: string): void {
    const hard = Math.min(1, speed / 420);
    const out = degOf(normal);
    this.burst(at, {
      count: 5 + Math.round(hard * 7),
      angleMin: out - 62,
      angleMax: out + 62,
      speedMin: 34,
      speedMax: 70 + 110 * hard,
      drag: 4.5,
      ay: -26,
      wobble: 12,
      lifeMin: 340,
      lifeMax: 720,
      size: 1.3,
      color: MATERIAL_TINT[material] ?? FOAM,
    });
    this.burst(at, { count: 1, kind: Sprite.glow, lifeMin: 170, lifeMax: 170, size: 4 + 5 * hard, end: 1.3, alpha: 0.55 + 0.35 * hard });
    if (hard > 0.35) this.burst(at, { count: 1, kind: Sprite.ring, lifeMin: 260, lifeMax: 260, size: 3, end: 2.2 + 2 * hard, alpha: 0.5 });
  }

  /** She caught a ledge: its rest line lights up along its width and a little foam falls off it. */
  rest(at: Vec2, ledge: { x: number; y: number; w: number } | null): void {
    if (ledge) {
      this.burst(
        { x: ledge.x + ledge.w / 2, y: ledge.y },
        { count: 1, kind: Sprite.strip, lifeMin: 380, lifeMax: 380, size: 2.6, end: 0.6, wide: ledge.w / 5.2, alpha: 0.8 },
      );
    }
    this.burst(at, {
      count: 5,
      angleMin: 25,
      angleMax: 155,
      speedMin: 14,
      speedMax: 42,
      drag: 4,
      ay: -18,
      wobble: 10,
      lifeMin: 340,
      lifeMax: 620,
      size: 1,
      spreadX: 4,
    });
  }

  /** 14 bubbles at the pop, slowly rising. */
  deflate(at: Vec2): void {
    this.burst(at, { count: 14, speedMin: 12, speedMax: 58, drag: 2.5, ay: -26, wobble: 16, lifeMin: 800, lifeMax: 1500, size: 1.6 });
  }

  /** Air leaving her as she shrinks. */
  leak(at: Vec2, radius: number): void {
    this.burst(at, {
      count: 1,
      angleMin: 215,
      angleMax: 325,
      speedMin: 18,
      speedMax: 48,
      drag: 1.5,
      ay: -24,
      wobble: 14,
      lifeMin: 600,
      lifeMax: 1100,
      size: 1.1,
      spreadX: radius * 0.5,
      spreadY: radius * 0.5,
    });
  }

  /** The last of her: a small ring where she was. */
  lastPop(at: Vec2): void {
    this.burst(at, { count: 1, kind: Sprite.ring, lifeMin: 300, lifeMax: 300, size: 2.5, end: 3.6, alpha: 0.7 });
    this.burst(at, { count: 6, speedMin: 16, speedMax: 44, drag: 3, ay: -28, wobble: 10, lifeMin: 500, lifeMax: 900, size: 1 });
  }

  /** She re-forms: a ring closes on the place she appears. */
  respawn(at: Vec2): void {
    this.burst(at, { count: 1, kind: Sprite.ring, lifeMin: 340, lifeMax: 340, size: 15, end: 0.25, alpha: 0.65 });
    this.burst(at, { count: 1, kind: Sprite.glow, lifeMin: 420, lifeMax: 420, size: 12, end: 0.8, alpha: 0.5 });
  }

  airSpent(at: Vec2): void {
    this.burst(at, { count: 6, angleMin: 200, angleMax: 340, speedMin: 10, speedMax: 38, ay: -26, lifeMin: 700, lifeMax: 1200, size: 1.3 });
  }

  /** Taking a pickup: a ring, sparkles, and for air a bubble that flies to the pip it fills. */
  pickup(at: Vec2, type: string, pip: Vec2 | null): void {
    const air = type === 'aire' || type === 'aireGrande';
    const color = air ? AIR : PEARL;
    const big = type === 'aireGrande' || type === 'perlaGrande' || type === 'concha';
    this.burst(at, { count: 1, kind: Sprite.ring, lifeMin: 300, lifeMax: 300, size: 3, end: big ? 4.4 : 3, alpha: 0.85, color });
    this.burst(at, { count: 1, kind: Sprite.glow, lifeMin: 240, lifeMax: 240, size: big ? 11 : 7, end: 1.2, alpha: 0.7, color });
    this.burst(at, {
      count: big ? 9 : 6,
      kind: air ? Sprite.bubble : Sprite.spark,
      speedMin: 24,
      speedMax: 74,
      drag: 4.5,
      ay: air ? -22 : -6,
      lifeMin: 300,
      lifeMax: 560,
      size: air ? 1.1 : 1.9,
      end: 0.3,
      color,
    });
    if (air && pip) this.burst(at, { count: 1, lifeMin: 340, lifeMax: 340, size: 2.1, end: 0.8, color, home: pip });
  }

  /** The buoy: a band of light runs along its line, and bubbles go up from it across the whole view. */
  boya(x: number, y: number, viewW: number): void {
    this.burst({ x, y }, { count: 1, kind: Sprite.strip, lifeMin: 800, lifeMax: 800, size: 2.6, end: 0.5, wide: viewW / 2.6, alpha: 0.9, color: 0xfff6d8 });
    this.burst({ x, y }, { count: 1, kind: Sprite.ring, lifeMin: 500, lifeMax: 500, size: 4, end: 5, alpha: 0.7 });
    this.burst(
      { x, y },
      { count: 22, spreadX: viewW * 0.6, angleMin: 255, angleMax: 285, speedMin: 12, speedMax: 42, ay: -8, wobble: 14, lifeMin: 800, lifeMax: 1500, size: 1.4 },
    );
  }

  /** Reaching a station: it breathes out a column of bubbles and light, before its screen arrives. */
  station(x: number, y: number, viewW: number): void {
    this.burst({ x, y }, { count: 1, kind: Sprite.strip, lifeMin: 1300, lifeMax: 1300, size: 5, end: 0.6, wide: viewW / 4, alpha: 0.9, color: 0xfff6d8 });
    this.burst(
      { x, y },
      { count: 46, spreadX: viewW * 0.65, spreadY: 6, angleMin: 250, angleMax: 290, speedMin: 26, speedMax: 82, ay: -12, wobble: 18, lifeMin: 1000, lifeMax: 2100, size: 1.7 },
    );
    this.burst({ x, y }, { count: 14, spreadX: viewW * 0.55, spreadY: 40, kind: Sprite.spark, lifeMin: 500, lifeMax: 1200, size: 2.2, end: 0.2, color: PEARL });
  }

  shield(at: Vec2): void {
    this.burst(at, { count: 1, kind: Sprite.ring, lifeMin: 300, lifeMax: 300, size: 6, end: 2.6, alpha: 0.9, color: SHIELD });
    this.burst(at, { count: 10, kind: Sprite.spark, speedMin: 40, speedMax: 80, drag: 4, lifeMin: 240, lifeMax: 440, size: 1.8, end: 0.3, color: SHIELD });
  }

  /** A blow: warm chips, so it never reads like the white of a pickup. */
  hurt(at: Vec2): void {
    this.burst(at, { count: 8, speedMin: 30, speedMax: 86, drag: 4, ay: -14, lifeMin: 320, lifeMax: 620, size: 1.2, color: WARM });
  }

  update(dtMs: number, renderX: number, renderY: number): void {
    const dt = dtMs / 1000;
    let highest = -1;
    this.live = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const p = this.pool[i];
      if (!p) continue;
      if (p.age >= p.life) {
        this.batch.write(i, this.hidden, p.tint, 0, p.kind);
        continue;
      }
      p.age += dtMs;
      const u = Math.min(1, p.age / p.life);
      let x: number;
      let y: number;
      if (p.home) {
        // Eases to the pip; the pip is glued to the glass, so the target moves with the camera.
        const e = u * u * (3 - 2 * u);
        x = p.x + (renderX + p.home.x - p.x) * e;
        y = p.y + (renderY + p.home.y - p.y) * e;
      } else {
        const damp = Math.exp(-p.drag * dt);
        p.vx *= damp;
        p.vy = p.vy * damp + p.ay * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        x = p.x + Math.sin(p.age * 0.006 + p.seed) * p.wobble * 0.12;
        y = p.y;
      }
      const s = p.size * PX * (1 + (p.end - 1) * (1 - (1 - u) * (1 - u)));
      const fade = p.kind === Sprite.bubble ? Math.min(1, (1 - u) * 2.4) : 1 - u;
      this.matrix.compose(this.pos.set(wx(x), wy(y), Z), this.quat, this.scale.set(s * p.wide, s, 1));
      this.batch.write(i, this.matrix, p.tint, p.alpha * fade, p.kind);
      highest = i;
      this.live++;
    }
    this.batch.flush(highest + 1);
  }

  get liveCount(): number {
    return this.live;
  }
}
