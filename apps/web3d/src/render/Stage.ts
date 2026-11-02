/**
 * Renderer, scene and camera. Coordinates per docs/engineering/WEB3D.md: 1 design px = 0.1 units,
 * core x → +X, core y (down) → −Y, play plane at Z = 0.
 *
 * The camera is a NARROW PERSPECTIVE placed so that the Z = 0 plane fills the canvas exactly: the
 * rectangle (renderX, renderY, viewW, viewH) of the world lands on the design view and nothing else
 * does. A point on the play plane therefore projects to the same place an orthographic view would
 * put it — the slingshot's viewport → world conversion in core stays true — while everything with
 * depth still shows it. `project` exists so the e2e suite can assert that instead of trusting it.
 */
import * as THREE from 'three';
import type { ScaleState } from '../context';

/** Three.js units per design px. */
export const PX = 0.1;
/** Vertical field of view: wide enough to read the sides of a ledge, narrow enough to stay a plane. */
const FOV_DEG = 18;
/** The sharpest the canvas gets: more than this costs a mid-range phone its 60 fps (WEB3D.md). */
const MAX_PIXEL_RATIO = 2;

export const wx = (x: number): number => x * PX;
export const wy = (y: number): number => -y * PX;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 1, 400);
  /** Distance from the camera to the play plane; re-derived whenever the view height changes. */
  distance = 100;
  /** `distance` plus what the camera's juice adds this frame: the fog starts from where the camera really is. */
  viewDistance = 100;
  private dipEl: HTMLDivElement | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly probe = new THREE.Vector3();
  /** Both are driven by the Atmosphere, which also owns the fog's colour and range. */
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x35586e, 1.9);
  readonly sun = new THREE.DirectionalLight(0xffffff, 1.7);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.info.autoReset = true;
    // No dynamic shadows, on purpose (WEB3D.md): one hemisphere and one key light give the flat faces
    // of a low-poly model all the shape they need.
    this.scene.add(this.hemi);
    this.sun.position.set(-6, 14, 18);
    this.scene.add(this.sun);
    this.scene.fog = new THREE.Fog(0x3fc1c9, 100, 200);
  }

  resize(s: ScaleState): void {
    const cssW = s.viewW * s.zoom;
    const cssH = s.viewH * s.zoom;
    this.canvas.style.left = `${s.offsetX}px`;
    this.canvas.style.top = `${s.offsetY}px`;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(cssW, cssH, true);
    this.camera.aspect = s.viewW / s.viewH;
    const halfH = (s.viewH * PX) / 2;
    this.distance = halfH / Math.tan(THREE.MathUtils.degToRad(FOV_DEG / 2));
    this.camera.far = this.distance + 140;
    this.camera.updateProjectionMatrix();
  }

  /**
   * The camera is placed, never computed: `leftX`/`topY` are core's `renderX`/`renderY`. `zoom` is the
   * presentation's: above 1 is further back, and the play plane then shows a little more than core's view.
   */
  place(leftX: number, topY: number, viewW: number, viewH: number, zoom = 1): void {
    this.viewDistance = this.distance * zoom;
    this.camera.position.set(wx(leftX + viewW / 2), wy(topY + viewH / 2), this.viewDistance);
    this.camera.updateMatrixWorld();
  }

  /**
   * Hides a jump of the camera behind a moment of plain water. It sits under the UI and takes no touches.
   * Sibling of the canvas and the same size, so a letterboxed column keeps its bars.
   */
  dip(colorCss: string, ms: number, from = 1): void {
    const canvas = this.canvas;
    if (!this.dipEl) {
      this.dipEl = document.createElement('div');
      this.dipEl.style.cssText = 'position:fixed;pointer-events:none;opacity:0';
      canvas.after(this.dipEl);
    }
    const dip = this.dipEl;
    dip.style.left = canvas.style.left;
    dip.style.top = canvas.style.top;
    dip.style.width = canvas.style.width;
    dip.style.height = canvas.style.height;
    dip.style.background = colorCss;
    dip.animate([{ opacity: from }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Blurs the frozen frame under the pause menu (§8: "congelación con desenfoque"). */
  setBlur(on: boolean): void {
    this.canvas.classList.toggle('blurred', on);
  }

  setVisible(on: boolean): void {
    this.canvas.style.visibility = on ? 'visible' : 'hidden';
  }

  /** Where a world point on the play plane ends up, in css px of the page (debug and tests). */
  project(worldX: number, worldY: number): { x: number; y: number } {
    this.probe.set(wx(worldX), wy(worldY), 0).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((this.probe.x + 1) / 2) * r.width, y: r.top + ((1 - this.probe.y) / 2) * r.height };
  }

  info(): { calls: number; triangles: number; geometries: number; textures: number } {
    const { render, memory } = this.renderer.info;
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
  }
}
