/**
 * Particles of GDD §7: low-poly chips in ONE instanced draw call. Same bursts and numbers as
 * `apps/web/src/fx/Particles.ts`, with shrink-to-nothing in place of the fade: an instanced opaque chip
 * costs no sorting, and the shape of a dying bubble reads better than its alpha at this size. Particles
 * run on real time, so they keep moving through a hitstop.
 */
import * as THREE from 'three';
import type { Vec2 } from '@deeply-bubbly/core';
import { GEO } from '../render/materials';
import { PX, wx, wy } from '../render/Stage';

const CAPACITY = 160;
const FOAM = 0xe8f6f3;
const SHIELD = 0xffe7a3;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  age: number;
  life: number;
  size: number;
  spin: number;
}

interface Burst {
  count: number;
  angleMin: number;
  angleMax: number;
  speedMin: number;
  speedMax: number;
  lifeMin: number;
  lifeMax: number;
  size: number;
  ay?: number;
  color?: number;
}

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
const degOf = (v: Vec2): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly pool: Particle[] = [];
  private cursor = 0;
  private live = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3(0.5, 0.7, 0.5).normalize();
  private readonly pos = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor() {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(GEO.chip, material, CAPACITY);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 10;
    this.mesh.setColorAt(0, this.color.setHex(FOAM));
    for (let i = 0; i < CAPACITY; i++) {
      this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, ay: 0, age: 1, life: 0, size: 0, spin: 0 });
    }
  }

  private burst(at: Vec2, o: Burst): void {
    this.color.setHex(o.color ?? FOAM);
    for (let i = 0; i < o.count; i++) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % CAPACITY;
      const p = this.pool[index];
      if (!p) continue;
      const angle = (rand(o.angleMin, o.angleMax) * Math.PI) / 180;
      const speed = rand(o.speedMin, o.speedMax);
      p.x = at.x;
      p.y = at.y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ay = o.ay ?? 0;
      p.age = 0;
      p.life = rand(o.lifeMin, o.lifeMax);
      p.size = o.size * rand(0.7, 1.2);
      p.spin = rand(0, 6);
      this.mesh.setColorAt(index, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** 6–10 microbubbles thrown backwards from the launch point. */
  launchTail(at: Vec2, vel: Vec2): void {
    const back = degOf(vel) + 180;
    this.burst(at, {
      count: 6 + Math.floor(Math.random() * 5),
      angleMin: back - 26,
      angleMax: back + 26,
      speedMin: 18,
      speedMax: 55,
      lifeMin: 260,
      lifeMax: 520,
      size: 1.2,
    });
  }

  /** 12 particles at the contact point, sprayed along the surface normal. */
  impact(at: Vec2, normal: Vec2): void {
    const out = degOf(normal);
    this.burst(at, { count: 12, angleMin: out - 55, angleMax: out + 55, speedMin: 40, speedMax: 120, lifeMin: 280, lifeMax: 620, size: 1 });
  }

  /** 14 slowly rising bubbles when Bur pops. */
  deflate(at: Vec2): void {
    this.burst(at, { count: 14, angleMin: 200, angleMax: 340, speedMin: 10, speedMax: 38, lifeMin: 900, lifeMax: 1500, size: 1.5, ay: -26 });
  }

  /** D1's mid-air launch: the pip she spends leaves as the same puff, smaller. */
  airSpent(at: Vec2): void {
    this.burst(at, { count: 6, angleMin: 200, angleMax: 340, speedMin: 10, speedMax: 38, lifeMin: 900, lifeMax: 1500, size: 1.3, ay: -26 });
  }

  /** 4 sparkles radiating from a collected pickup. */
  pickup(at: Vec2): void {
    this.burst(at, { count: 4, angleMin: 0, angleMax: 360, speedMin: 22, speedMax: 62, lifeMin: 240, lifeMax: 460, size: 1 });
  }

  /** §2.5: the shield absorbed a hit, a wide ring of sparks. */
  shield(at: Vec2): void {
    this.burst(at, { count: 10, angleMin: 0, angleMax: 360, speedMin: 40, speedMax: 70, lifeMin: 240, lifeMax: 420, size: 1.1, color: SHIELD });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    let highest = -1;
    this.live = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const p = this.pool[i];
      if (!p) continue;
      if (p.age >= p.life) {
        this.matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.matrix);
        continue;
      }
      p.age += dtMs;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const remaining = Math.max(0, 1 - p.age / p.life);
      const s = p.size * PX * Math.sqrt(remaining);
      this.matrix.compose(
        this.pos.set(wx(p.x), wy(p.y), 0.9),
        this.quat.setFromAxisAngle(this.axis, p.spin + p.age * 0.006),
        this.size.set(s, s, s),
      );
      this.mesh.setMatrixAt(i, this.matrix);
      highest = i;
      this.live++;
    }
    this.mesh.count = highest + 1;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get liveCount(): number {
    return this.live;
  }
}
