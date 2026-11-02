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
import { reducedMotion } from '../fx/motion';
import { GEO, ownMaterials } from './materials';
import type { ModelInstance, ModelRegistry } from './ModelRegistry';
import { PX, wx, wy } from './Stage';

const CHARGE_SQUASH = 0.22;
const WOBBLE_HZ = 12;
const WOBBLE_AMP = 0.03;
/** §7's 1.35 at full power. A weak shot stretches less, and the return takes long enough to be seen. */
const STRETCH = 0.35;
const STRETCH_MS = 300;
/** §7's 0.70 on a hard hit; a nudge squashes less. */
const IMPACT_SOFT = 0.86;
const IMPACT_HARD = 0.68;
const IMPACT_MS = 260;
const IMPACT_FULL_SPEED = 420;
const LAND = 0.72;
const LAND_MS = 360;
/** How fast the held pose (rest, pull, flight) follows what she is doing, per second. */
const POSE_RATE = 16;
const POSE_RATE_AIM = 34;
/** She leans into the band, in design px at full pull: drawn back, not displaced. */
const LEAN_PX = 2.4;
/** Her eyes look where she is going: this far, in design px, inside the bubble. */
const GAZE_PX = 1.5;
const GAZE_RATE = 10;
const FLIGHT_STRETCH = 0.13;
const FLIGHT_SPEED_FULL = 420;
const FLIGHT_AXIS_MIN_SPEED = 120;
const AXIS_RATE = 12;
const REST_SQUASH = 0.92;
const REST_WIDE = 1.06;
const REST_BREATH = 0.012;
const HURT_MS = 340;
const DEFLATE_SWELL = 1.14;
const DEFLATE_SWELL_END = 0.12;
const DEFLATE_SMALLEST = 0.4;
const DEFLATE_FADE_FROM = 0.62;
const DEFLATE_DROP_PX = 5;
const IMPACT_ROT_RAD = (8 * Math.PI) / 180;
const IMPACT_ROT_MS = 260;
const BREATH_AMP = 0.03;
const BLINK_MS = 90;
const SHIELD_FLASH_MS = 260;
const REFORM_MS = 380;
const REFORM_FADE_MS = 240;
const INVULN_PULSE_MS = 240;
const AIR_LAUNCH_PULSE_MS = 620;
const AIR_LAUNCH_PULSE_AMP = 0.18;
/** Radius the primitive body and a fitted model are built at; the live radius scales from it. */
const UNIT_RADIUS_PX = 7;

const elasticOut = (t: number): number =>
  t >= 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 2 * 1.5);
/** A slower settle than `elasticOut`: the stretch has to last long enough for the eye to catch it. */
const softElasticOut = (t: number): number =>
  t >= 1 ? 1 : 1 - Math.pow(2, -6 * t) * Math.cos(t * Math.PI * 2 * 1.25) * (1 - t);
const quadOut = (t: number): number => 1 - (1 - t) * (1 - t);
const backOut = (t: number): number => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Shortest way round, so the squash axis never spins the long way. */
const angleDelta = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));

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

/**
 * A soap bubble's whole look is how much of it you see at each angle: almost nothing looking straight
 * through it, a bright rim at the silhouette, a window of sky up-left and its reflection down-right.
 * The rim is what carries Bur in dark water, so it is near-white whatever is behind her.
 */
const shellVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const shellFragment = /* glsl */ `
  uniform float uOpacity;
  uniform float uHurt;
  uniform float uCharge;
  varying vec3 vNormal;
  void main() {
    vec3 n = normalize(vNormal);
    float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.6);
    float window = smoothstep(0.72, 0.9, dot(n, normalize(vec3(-0.55, 0.62, 0.56))));
    float bounce = smoothstep(0.86, 0.97, dot(n, normalize(vec3(0.62, -0.68, 0.39))));
    float alpha = 0.1 + 0.08 * uCharge + (0.82 + 0.3 * uCharge) * rim + 0.34 * window + 0.22 * bounce + 0.3 * uHurt;
    vec3 colour = mix(vec3(0.66, 0.93, 0.97), vec3(1.0), clamp(rim * 1.3 + window + bounce, 0.0, 1.0));
    colour = mix(colour, vec3(1.0, 0.62, 0.52), uHurt);
    gl_FragColor = vec4(colour, clamp(alpha, 0.0, 1.0) * uOpacity);
    #include <colorspace_fragment>
  }
`;

export class BubbleView {
  readonly root = new THREE.Group();
  private readonly tuningOf: () => Tuning;
  private readonly models: ModelRegistry;
  private readonly deform = new THREE.Group();
  private readonly face = new THREE.Group();
  private readonly shellMaterial = new THREE.ShaderMaterial({
    vertexShader: shellVertex,
    fragmentShader: shellFragment,
    uniforms: { uOpacity: { value: 1 }, uHurt: { value: 0 }, uCharge: { value: 0 } },
    transparent: true,
    depthWrite: false,
    fog: false,
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
  private readonly hurtFlash = new Tween(0);
  private axisRot = 0;
  private poseX = 1;
  private poseY = 1;
  private leanX = 0;
  private leanY = 0;
  private gazeX = 0;
  private gazeY = 0;
  private charge = 0;
  private deflating = false;
  private deflateMs = 0;
  private blinkUntil = 0;
  private nextBlinkAt = 3000;
  private shieldUntil = 0;
  private lastTimeMs = 0;
  private readonly gaze: Vec2 = { x: 0, y: 1 };

  constructor(models: ModelRegistry, tuningOf: () => Tuning) {
    this.models = models;
    this.tuningOf = tuningOf;
    this.body = new THREE.Group();
    this.deform.add(this.shell(), this.body);
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

  /** The bubble itself, model or no model; it only has to be round, so it is smooth, unlike the world. */
  private shell(): THREE.Object3D {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), this.shellMaterial);
    mesh.scale.setScalar(UNIT_RADIUS_PX * PX);
    mesh.renderOrder = 3;
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
    // The shell replaces the model's glass and contour; what is left of it is the face.
    model.object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      const name = (mesh.material as THREE.Material | undefined)?.name;
      if (mesh.isMesh && (name === 'db_glass' || name === 'db_contour')) mesh.visible = false;
    });
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

    const calm = reducedMotion();
    this.hurtFlash.tick(dtMs);
    const dtS = dtMs / 1000;
    const aiming = b.state === 'AIMING';
    const pull = aiming ? Math.min(1, Math.max(0, snapshot.hud.power)) : 0;
    const speed = Math.hypot(b.vel.x, b.vel.y);

    let sx = 1;
    let sy = 1;
    if (aiming) {
      const wobble = calm ? 1 : 1 + WOBBLE_AMP * pull * Math.sin((t / 1000) * WOBBLE_HZ * Math.PI * 2);
      sy = (1 - CHARGE_SQUASH * pull) * wobble;
      sx = (1 + CHARGE_SQUASH * pull) / wobble;
    } else if (b.state === 'RESTING') {
      const breath = calm ? 0 : REST_BREATH * Math.sin((t / 1000) * Math.PI * 1.4);
      sy = REST_SQUASH + breath;
      sx = REST_WIDE - breath;
    } else {
      const breath = calm ? 0 : BREATH_AMP * Math.sin((t / 1000) * Math.PI * 2);
      const flight = calm ? 0 : FLIGHT_STRETCH * Math.min(1, speed / FLIGHT_SPEED_FULL);
      sy = (1 - breath) * (1 + flight);
      sx = (1 + breath) * (1 - flight * 0.75);
    }
    // The pose eases between states instead of snapping: she settles into a rest, she does not switch to it.
    const follow = 1 - Math.exp(-(aiming ? POSE_RATE_AIM : POSE_RATE) * dtS);
    this.poseX += (sx - this.poseX) * follow;
    this.poseY += (sy - this.poseY) * follow;

    // The squash axis follows her flight, and stands upright again when she stops.
    const adrift = b.state === 'LAUNCHED' || b.state === 'IDLE';
    const axisTarget = adrift ? (speed > FLIGHT_AXIS_MIN_SPEED ? Math.atan2(b.vel.y, b.vel.x) - Math.PI / 2 : this.axisRot) : 0;
    this.axisRot += angleDelta(this.axisRot, axisTarget) * (1 - Math.exp(-AXIS_RATE * dtS));

    let drawX = this.poseX;
    let drawY = this.poseY;
    let swell = this.swell.value;
    let flutterRot = 0;
    let drop = 0;
    let opacity = this.fade.value;
    if (this.deflating) {
      const d = this.deflatePose(dtMs, calm);
      swell = d.size;
      drawX *= 1 + d.flutter;
      drawY *= 1 - d.flutter;
      flutterRot = d.rot;
      drop = d.drop;
      opacity = d.opacity;
    }

    // Leans against the band, opposite to the shot; `pullTheta` is the shot's angle from straight down.
    const leanTo = calm ? 0 : pull * LEAN_PX * PX;
    this.leanX += (-Math.sin(b.pullTheta) * leanTo - this.leanX) * follow;
    this.leanY += (Math.cos(b.pullTheta) * leanTo - this.leanY) * follow;

    this.root.position.set(wx(b.pos.x), wy(b.pos.y) - drop, 0);
    const amt = this.amt.value;
    this.deform.scale.set(base * drawX * swell * (1 / amt), base * drawY * swell * amt, base * swell);
    this.deform.position.set(this.leanX, this.leanY, 0);
    // Core's y grows down, so a 2D angle is negated on its way to +Y-up.
    const spin = this.axisRot + this.rotW.value + flutterRot;
    this.deform.rotation.z = -spin;
    this.charge += (pull * pull - this.charge) * follow;
    if (this.model) this.placeModel(snapshot, spin, dtS);

    this.syncFace(snapshot, base, b.state === 'RESTING', t);
    this.syncAura(b.radius, b.lastLaunchPower, t, adrift && snapshot.hud.airLaunchAvailable, b.flags.invulnUntil, opacity);

    const uniforms = this.shellMaterial.uniforms as Record<string, THREE.IUniform<number>>;
    if (uniforms['uOpacity']) uniforms['uOpacity'].value = opacity;
    if (uniforms['uHurt']) uniforms['uHurt'].value = this.hurtFlash.value;
    if (uniforms['uCharge']) uniforms['uCharge'].value = this.charge;
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

  /**
   * §2.4: a slow flutter down instead of a pop. She holds a breath, shrinks with the air leaving her and
   * only fades at the very end, so the eye is still on her when the screen comes. `DEFLATE_MS` is core's;
   * nothing here decides how long it takes.
   */
  private deflatePose(dtMs: number, calm: boolean): { size: number; flutter: number; rot: number; drop: number; opacity: number } {
    this.deflateMs += dtMs;
    const u = Math.min(1, this.deflateMs / this.tuningOf().DEFLATE_MS);
    const size =
      u < DEFLATE_SWELL_END
        ? 1 + (DEFLATE_SWELL - 1) * (u / DEFLATE_SWELL_END)
        : DEFLATE_SWELL + (DEFLATE_SMALLEST - DEFLATE_SWELL) * smooth((u - DEFLATE_SWELL_END) / (1 - DEFLATE_SWELL_END));
    const opacity = u < DEFLATE_FADE_FROM ? 1 : 1 - (u - DEFLATE_FADE_FROM) / (1 - DEFLATE_FADE_FROM);
    if (calm) return { size, flutter: 0, rot: 0, drop: 0, opacity };
    const ms = this.deflateMs;
    return {
      size,
      flutter: Math.sin(ms * 0.05) * 0.1 * (1 - u * 0.6),
      rot: Math.sin(ms * 0.032) * 0.34 * u,
      drop: smooth(u) * DEFLATE_DROP_PX * PX,
      opacity,
    };
  }

  /** A model owns its own face: it stays upright in the squash, and looks where she is going (§7). */
  private placeModel(snapshot: WorldSnapshot, spin: number, dtS: number): void {
    const model = this.model;
    if (!model) return;
    model.object.rotation.z = spin;
    const dir = this.eyeDirection(snapshot);
    const follow = 1 - Math.exp(-GAZE_RATE * dtS);
    const at = snapshot.bubble.state === 'RESTING' ? 0 : GAZE_PX * PX;
    this.gazeX += (dir.x * at - this.gazeX) * follow;
    this.gazeY += (-dir.y * at - this.gazeY) * follow;
    // Into the deform's frame, which is turned by -spin.
    const c = Math.cos(spin);
    const s = Math.sin(spin);
    model.object.position.set(this.gazeX * c - this.gazeY * s, this.gazeX * s + this.gazeY * c, 0);
  }

  private syncAura(radius: number, lastPower: number, timeMs: number, airLaunch: boolean, invulnUntil: number, fade: number): void {
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
    } else if (timeMs < invulnUntil) {
      // Nothing can hurt her just now, and the aura says so with a soft quick pulse.
      opacity = 0.3 + 0.45 * Math.abs(Math.sin((timeMs / INVULN_PULSE_MS) * Math.PI));
    } else if (airLaunch) {
      const pulse = AIR_LAUNCH_PULSE_AMP * (0.5 + 0.5 * Math.sin((timeMs / AIR_LAUNCH_PULSE_MS) * Math.PI * 2));
      scale = 1 + pulse * 0.25;
      opacity = 0.35 + pulse;
    }
    this.aura.scale.setScalar(outer * scale);
    this.auraMaterial.opacity = opacity * fade;
    this.lightMaterial.opacity = 0.06 * fade;
  }

  // -------------------------------------------------------------------------------------------
  // Event-driven hooks, called by FxDirector
  // -------------------------------------------------------------------------------------------

  /** §7: up to 1.35 along the flight axis, returning elastically. */
  stretch(dir: Vec2, power: number): void {
    this.axisRot = Math.atan2(dir.y, dir.x) - Math.PI / 2;
    this.rotW.set(0);
    this.amt.start(1 + STRETCH * (0.35 + 0.65 * power), 1, STRETCH_MS, softElasticOut);
    this.model?.play('Stretch');
  }

  /** §7: squashed along the contact normal by how hard she hit, plus a damped ±8° rotation. */
  impact(normal: Vec2, speed: number): void {
    const hard = Math.min(1, speed / IMPACT_FULL_SPEED);
    this.axisRot = Math.atan2(normal.y, normal.x) - Math.PI / 2;
    this.amt.start(IMPACT_SOFT + (IMPACT_HARD - IMPACT_SOFT) * hard, 1, IMPACT_MS, softElasticOut);
    this.rotW.start(IMPACT_ROT_RAD * hard * (Math.random() < 0.5 ? -1 : 1), 0, IMPACT_ROT_MS, elasticOut);
  }

  /** She caught a ledge: flattened against it, then a jelly settle. */
  land(): void {
    this.axisRot = 0;
    this.rotW.set(0);
    this.amt.start(LAND, 1, LAND_MS, softElasticOut);
    this.model?.play('Squash');
  }

  /** A blow: a warm flush through the shell, and a flinch. Never a strobe. */
  hurt(): void {
    this.hurtFlash.start(1, 0, HURT_MS, quadOut);
    this.model?.play('Hit');
  }

  /** §2.4: she loses her air over DEFLATE_MS; see `deflatePose`. */
  deflate(): void {
    if (this.deflating) return;
    this.deflating = true;
    this.deflateMs = 0;
    this.amt.set(1);
    this.rotW.set(0);
    this.shieldUntil = 0;
    this.hurtFlash.start(0.7, 0, HURT_MS, quadOut);
    this.model?.play('Hit');
  }

  /** Respawn: she forms out of the water. Cancels everything the deflate left behind. */
  reform(): void {
    this.deflating = false;
    this.shieldUntil = 0;
    this.axisRot = 0;
    this.amt.set(1);
    this.rotW.set(0);
    this.hurtFlash.set(0);
    this.fade.start(0, 1, REFORM_FADE_MS, quadOut);
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
    this.fade.set(1);
    this.poseX = this.poseY = 1;
  }

  /** The shape she is drawn at, for `__db` and the browser checks. */
  pose(): { sx: number; sy: number; opacity: number; deflating: boolean } {
    const opacity = (this.shellMaterial.uniforms['uOpacity'] as THREE.IUniform<number>).value;
    return { sx: this.deform.scale.x, sy: this.deform.scale.y, opacity, deflating: this.deflating };
  }
}
