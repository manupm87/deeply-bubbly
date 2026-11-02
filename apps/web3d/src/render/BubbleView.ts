/**
 * Bur: body, two eyes and a highlight (WEB3D.md), the aura, and every squash/stretch number of GDD §7,
 * the same ones `apps/web/src/render/BubbleView.ts` uses. The FX director calls the hooks from
 * `GameEvent`s; the continuous part is derived from the snapshot. No rule lives here.
 *
 * Eyes never rotate with the body: they are the emotional channel. The aura guarantees the
 * MIN_SILHOUETTE_PX floor of §2.6, so pressure can shrink Bur without ever making her a dot.
 */
import * as THREE from 'three';
import type { Tuning, Vec2, WorldSnapshot } from '@deeply-bubbly/core';
import { GEO, ownMaterials } from './materials';
import type { ModelInstance, ModelRegistry } from './ModelRegistry';
import { PX, wx, wy } from './Stage';

const CHARGE_SQUASH = 0.22;
const WOBBLE_HZ = 12;
const WOBBLE_AMP = 0.03;
const STRETCH = 1.35;
const STRETCH_MS = 120;
const IMPACT = 0.7;
const IMPACT_MS = 90;
const IMPACT_ROT_RAD = (8 * Math.PI) / 180;
const IMPACT_ROT_MS = 260;
const BREATH_AMP = 0.03;
const BLINK_MS = 90;
const SHIELD_FLASH_MS = 260;
const REFORM_MS = 220;
const AIR_LAUNCH_PULSE_MS = 620;
const AIR_LAUNCH_PULSE_AMP = 0.18;
/** Radius the primitive body and a fitted model are built at; the live radius scales from it. */
const UNIT_RADIUS_PX = 7;

const elasticOut = (t: number): number =>
  t >= 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 2 * 1.5);
const quadOut = (t: number): number => 1 - (1 - t) * (1 - t);
const backOut = (t: number): number => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const sineIn = (t: number): number => 1 - Math.cos((t * Math.PI) / 2);

/** One presentation tween, advanced by the real frame delta: it keeps running through a hitstop. */
class Tween {
  value: number;
  private from: number;
  private to: number;
  private ms = 0;
  private total = 0;
  private ease: (t: number) => number = quadOut;

  constructor(value: number) {
    this.value = value;
    this.from = value;
    this.to = value;
  }

  start(from: number, to: number, ms: number, ease: (t: number) => number): void {
    this.from = from;
    this.to = to;
    this.value = from;
    this.ms = 0;
    this.total = ms;
    this.ease = ease;
  }

  set(value: number): void {
    this.start(value, value, 0, quadOut);
  }

  tick(dtMs: number): void {
    if (this.total <= 0) {
      this.value = this.to;
      return;
    }
    this.ms = Math.min(this.total, this.ms + dtMs);
    this.value = this.from + (this.to - this.from) * this.ease(this.ms / this.total);
  }
}

export class BubbleView {
  readonly root = new THREE.Group();
  private readonly tuningOf: () => Tuning;
  private readonly models: ModelRegistry;
  private readonly deform = new THREE.Group();
  private readonly face = new THREE.Group();
  private readonly bodyMaterial = new THREE.MeshLambertMaterial({
    color: 0x9fe6f5,
    flatShading: true,
    transparent: true,
    opacity: 0.86,
  });
  private readonly eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x0b1f33, transparent: true });
  private readonly shineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  private readonly auraMaterial = new THREE.MeshBasicMaterial({
    color: 0xa8e6f0,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly lightMaterial = new THREE.MeshBasicMaterial({
    color: 0xa8e6f0,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
  });
  private readonly aura: THREE.Mesh;
  private readonly light: THREE.Mesh;
  private readonly eyes: THREE.Mesh[] = [];
  private body: THREE.Object3D;
  private model: ModelInstance | null = null;
  private modelMaterials: Array<{ material: THREE.Material; base: number }> = [];
  private modelsVersion = -1;

  private readonly amt = new Tween(1);
  private readonly rotW = new Tween(0);
  private readonly swell = new Tween(1);
  private readonly fade = new Tween(1);
  private axisRot = 0;
  private deflating = false;
  private blinkUntil = 0;
  private nextBlinkAt = 3000;
  private shieldUntil = 0;
  private lastTimeMs = 0;
  private readonly gaze: Vec2 = { x: 0, y: 1 };

  constructor(models: ModelRegistry, tuningOf: () => Tuning) {
    this.models = models;
    this.tuningOf = tuningOf;
    this.body = this.primitiveBody();
    this.deform.add(this.body);
    this.root.add(this.deform);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(GEO.blob, this.eyeMaterial);
      eye.position.set(side * 0.2, 0.08, 0.62);
      eye.scale.set(0.11, 0.16, 0.08);
      this.eyes.push(eye);
      this.face.add(eye);
    }
    const shine = new THREE.Mesh(GEO.blob, this.shineMaterial);
    shine.position.set(-0.3, 0.42, 0.58);
    shine.scale.set(0.13, 0.1, 0.05);
    this.face.add(shine);
    this.root.add(this.face);

    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 28), this.auraMaterial);
    this.light = new THREE.Mesh(GEO.disc, this.lightMaterial);
    this.aura.position.z = -0.3;
    this.light.position.z = -0.35;
    this.aura.renderOrder = 5;
    this.light.renderOrder = 4;
    this.root.add(this.aura, this.light);
  }

  private primitiveBody(): THREE.Object3D {
    const mesh = new THREE.Mesh(GEO.blob, this.bodyMaterial);
    mesh.scale.setScalar(UNIT_RADIUS_PX * PX);
    return mesh;
  }

  /** A model owns its own face (WEB3D.md: two eyes and a highlight are part of Bur's asset). */
  private syncModel(): void {
    if (this.modelsVersion === this.models.version) return;
    this.modelsVersion = this.models.version;
    const model = this.models.create('bur', UNIT_RADIUS_PX * 2, UNIT_RADIUS_PX * 2, 'uniform');
    if (!model) return;
    this.deform.remove(this.body);
    this.body = model.object;
    this.model = model;
    this.modelMaterials = ownMaterials(model.object);
    this.deform.add(model.object);
    this.face.visible = false;
  }

  /** Whether the glb replaced the primitive; for `__db` and the tests. */
  get usesModel(): boolean {
    return this.model !== null;
  }

  sync(snapshot: WorldSnapshot, dtMs: number): void {
    this.syncModel();
    this.model?.tick(dtMs / 1000);
    this.amt.tick(dtMs);
    this.rotW.tick(dtMs);
    this.swell.tick(dtMs);
    this.fade.tick(dtMs);

    const b = snapshot.bubble;
    const t = snapshot.timeMs;
    this.lastTimeMs = t;
    const base = b.radius / UNIT_RADIUS_PX;

    let sx = 1;
    let sy = 1;
    if (b.state === 'AIMING') {
      const power = snapshot.hud.power;
      const wobble = 1 + WOBBLE_AMP * Math.sin((t / 1000) * WOBBLE_HZ * Math.PI * 2);
      sy = (1 - CHARGE_SQUASH * power) * wobble;
      sx = (1 + CHARGE_SQUASH * power) / wobble;
    } else if (b.state === 'RESTING') {
      sy = 0.9;
      sx = 1.08;
    } else {
      const breath = BREATH_AMP * Math.sin((t / 1000) * Math.PI * 2);
      sy = 1 - breath;
      sx = 1 + breath;
    }

    this.root.position.set(wx(b.pos.x), wy(b.pos.y), 0);
    const k = this.swell.value;
    const amt = this.amt.value;
    this.deform.scale.set(base * sx * k * (1 / amt), base * sy * k * amt, base * k);
    // Core's y grows down, so a 2D angle is negated on its way to +Y-up.
    this.deform.rotation.z = -(this.axisRot + this.rotW.value);
    // The axis only aims the squash. A model carries its own face, and eyes never tilt with it (§7).
    if (this.model) this.model.object.rotation.z = this.axisRot;

    this.syncFace(snapshot, base, b.state === 'RESTING', t);
    const adrift = b.state !== 'RESTING' && b.state !== 'DEAD';
    this.syncAura(b.radius, b.lastLaunchPower, t, adrift && snapshot.hud.airLaunchAvailable);

    const opacity = this.fade.value;
    this.bodyMaterial.opacity = 0.86 * opacity;
    this.eyeMaterial.opacity = opacity;
    this.shineMaterial.opacity = opacity;
    for (const own of this.modelMaterials) {
      own.material.opacity = own.base * opacity;
      own.material.transparent = own.material.userData['alwaysBlended'] === true || own.base < 1 || opacity < 1;
    }
  }

  private syncFace(snapshot: WorldSnapshot, base: number, resting: boolean, timeMs: number): void {
    const dir = this.eyeDirection(snapshot);
    const size = UNIT_RADIUS_PX * PX * base;
    this.face.scale.setScalar(size);
    this.face.position.set(dir.x * size * 0.28, -dir.y * size * 0.16, 0);
    if (resting && timeMs >= this.nextBlinkAt) {
      this.blinkUntil = timeMs + BLINK_MS;
      this.nextBlinkAt = timeMs + 3000 + Math.random() * 1000;
      this.model?.play('Blink');
    }
    const blink = timeMs < this.blinkUntil ? 0.03 : 0.16;
    for (const eye of this.eyes) eye.scale.y = blink;
  }

  /** Eyes look where the shot is going while she aims, and where she is flying otherwise (§7). */
  private eyeDirection(snapshot: WorldSnapshot): Vec2 {
    const b = snapshot.bubble;
    const gaze = this.gaze;
    if (b.state === 'AIMING' || b.state === 'IDLE') {
      gaze.x = Math.sin(b.pullTheta);
      gaze.y = Math.cos(b.pullTheta);
      return gaze;
    }
    const speed = Math.hypot(b.vel.x, b.vel.y);
    gaze.x = speed < 8 ? 0 : b.vel.x / speed;
    gaze.y = speed < 8 ? 1 : b.vel.y / speed;
    return gaze;
  }

  private syncAura(radius: number, lastPower: number, timeMs: number, airLaunch: boolean): void {
    const t = this.tuningOf();
    const grow = Math.max(0, t.RADIUS_BASE - radius) * 0.7;
    const outer = Math.max(t.MIN_SILHOUETTE_PX / 2, radius + 1.5 + grow) * PX;
    const light = (t.LIGHT_RADIUS_BASE + (t.LIGHT_RADIUS_CHARGED - t.LIGHT_RADIUS_BASE) * lastPower) * PX;
    this.light.scale.setScalar(light);
    let scale = 1;
    let opacity = 0.35;
    if (timeMs < this.shieldUntil) {
      scale = 1 + 0.25 * ((this.shieldUntil - timeMs) / SHIELD_FLASH_MS);
      opacity = 0.9;
    } else if (airLaunch) {
      const pulse = AIR_LAUNCH_PULSE_AMP * (0.5 + 0.5 * Math.sin((timeMs / AIR_LAUNCH_PULSE_MS) * Math.PI * 2));
      scale = 1 + pulse * 0.25;
      opacity = 0.35 + pulse;
    }
    this.aura.scale.setScalar(outer * scale);
    this.auraMaterial.opacity = opacity * this.fade.value;
    this.lightMaterial.opacity = 0.06 * this.fade.value;
  }

  // -------------------------------------------------------------------------------------------
  // Event-driven hooks, called by FxDirector
  // -------------------------------------------------------------------------------------------

  /** §7: 1.35 along the flight axis for 120 ms, returning elastically. */
  stretch(dir: Vec2): void {
    this.axisRot = Math.atan2(dir.y, dir.x) - Math.PI / 2;
    this.rotW.set(0);
    this.amt.start(STRETCH, 1, STRETCH_MS, elasticOut);
  }

  /** §7: 0.70 along the contact normal for 90 ms, plus a damped ±8° rotation. */
  impact(normal: Vec2): void {
    this.axisRot = Math.atan2(normal.y, normal.x) - Math.PI / 2;
    this.amt.start(IMPACT, 1, IMPACT_MS, quadOut);
    this.rotW.start(IMPACT_ROT_RAD * (Math.random() < 0.5 ? -1 : 1), 0, IMPACT_ROT_MS, elasticOut);
  }

  /** §2.4: she loosens and fades over DEFLATE_MS. */
  deflate(): void {
    if (this.deflating) return;
    this.deflating = true;
    const ms = this.tuningOf().DEFLATE_MS;
    this.axisRot = 0;
    this.amt.set(1);
    this.rotW.set(0);
    this.shieldUntil = 0;
    this.swell.start(1, 1.5, ms, sineIn);
    this.fade.start(1, 0, ms, sineIn);
  }

  /** Respawn: she re-forms. Cancels everything the deflate left behind. */
  reform(): void {
    this.deflating = false;
    this.shieldUntil = 0;
    this.axisRot = 0;
    this.amt.set(1);
    this.rotW.set(0);
    this.fade.set(1);
    this.swell.start(0.2, 1, REFORM_MS, backOut);
  }

  /** §2.5: the shield ate a hit. She swells and her aura flares; no pip was lost. */
  shieldFlash(): void {
    this.shieldUntil = this.lastTimeMs + SHIELD_FLASH_MS;
    this.swell.start(1.25, 1, SHIELD_FLASH_MS, quadOut);
  }

  /** Back to pristine for a new run. */
  reset(): void {
    this.reform();
    this.swell.set(1);
  }
}
