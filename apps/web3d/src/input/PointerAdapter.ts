/**
 * Input → `PointerInput` (GDD §2.1, DECISIONS-v1.2 D2), the same contract as
 * `apps/web/src/input/PointerAdapter.ts`, on plain DOM pointer events.
 *
 * Deliberately dumb: it writes ONE sample in design px into `ctx.pointer` and interprets no gesture.
 * The one distinction it makes is how a contact ended, because D2 makes the two endings opposites. A
 * real `pointerup` is a RELEASE (`pointer.down = false`, core decides shot or cancel). Everything else
 * — tab hidden, focus lost, automatic pause, `pointercancel`, a drag that leaves the window — is an
 * ABORT and goes to `GameWorld.cancelAim()`, or the player would find a shot she never let go of.
 *
 * Presses count on the canvas and on the bare page around it: as in `apps/web`, a finger on the bars of a
 * wide screen is still a slingshot, clamped to the edge of the view. Every HUD control is a DOM element
 * of its own, so a touch on the minimap or a button is not one of those targets and cannot open an aim.
 * Moves and releases are read on `window` and filtered by the owned pointer id, so a drag may wander over
 * the HUD, and the finger holding the minimap can neither steer this pull nor fire it by lifting.
 */
import type { GameContext } from '../context';

const KEY_POINTER_FRACTION_Y = 0.8;
const KEY_STEP_PX = 6;

export class PointerAdapter {
  private readonly ctx: GameContext;
  private lastX = 90;
  private lastY = 256;
  private keyDown = false;
  private ownedId: number | null = null;
  private enabled = false;

  constructor(private readonly canvas: HTMLElement, ctx: GameContext) {
    this.ctx = ctx;
    document.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVisibility);
    document.documentElement.addEventListener('mouseleave', this.onMouseLeave);
  }

  /** The map owns the screen while disabled: nothing here may open an aim on a world nobody sees. */
  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) this.abort();
  }

  /**
   * Ends a contact the player did not end: the finger goes up AND the gesture is cancelled, so the
   * pull never becomes a shot. Never fabricates a press.
   */
  abort(): void {
    const wasDown = this.ctx.pointer.down;
    this.keyDown = false;
    this.ownedId = null;
    this.ctx.pointer.down = false;
    if (wasDown) this.ctx.world.cancelAim();
  }

  // ---------------------------------------------------------------------------------------------

  private sample(clientX: number, clientY: number): void {
    const s = this.ctx.scale;
    this.lastX = Math.min(s.viewW, Math.max(0, (clientX - s.offsetX) / s.zoom));
    this.lastY = Math.min(s.viewH, Math.max(0, (clientY - s.offsetY) / s.zoom));
    this.write();
  }

  private write(): void {
    this.ctx.pointer.x = this.lastX;
    this.ctx.pointer.y = this.lastY;
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.target !== this.canvas && e.target !== document.body && e.target !== document.documentElement) return;
    // First contact wins and keeps the world until it ends; a second finger is not a second gesture.
    if (this.ownedId !== null) return;
    e.preventDefault();
    this.ownedId = e.pointerId;
    this.sample(e.clientX, e.clientY);
    this.ctx.pointer.down = true;
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (this.ownedId !== null) {
      if (e.pointerId !== this.ownedId) return;
      // A finger or mouse that left the page is the GAME_OUT of `apps/web`: an abort, not a release.
      if (e.clientX < 0 || e.clientY < 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        this.abort();
        return;
      }
      this.sample(e.clientX, e.clientY);
      return;
    }
    // While nothing is pressed a hovering mouse seeds the keyboard fallback on desktop.
    if (e.pointerType === 'mouse') this.sample(e.clientX, e.clientY);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (this.ownedId !== e.pointerId) return;
    this.ownedId = null;
    this.sample(e.clientX, e.clientY);
    if (!this.keyDown) this.ctx.pointer.down = false;
  };

  /** Only the contact the world is reading can abort its gesture; the minimap finger's cancel cannot. */
  private readonly onCancel = (e: PointerEvent): void => {
    if (this.ownedId === e.pointerId) this.abort();
  };

  private readonly onBlur = (): void => this.abort();

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible') this.abort();
  };

  private readonly onMouseLeave = (): void => {
    if (!this.keyDown && this.ownedId !== null) this.abort();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    const step = ARROWS[e.key];
    if (step) {
      const s = this.ctx.scale;
      this.lastX = Math.min(s.viewW, Math.max(0, this.lastX + step[0]));
      this.lastY = Math.min(s.viewH, Math.max(0, this.lastY + step[1]));
      this.write();
      e.preventDefault();
      return;
    }
    if (e.key !== ' ' || this.keyDown) return;
    // A focused HUD button keeps its own Space behaviour.
    if (document.activeElement instanceof HTMLButtonElement) return;
    e.preventDefault();
    this.keyDown = true;
    if (this.lastY <= 0) this.lastY = this.ctx.scale.viewH * KEY_POINTER_FRACTION_Y;
    this.write();
    this.ctx.pointer.down = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key !== ' ' || !this.keyDown) return;
    this.keyDown = false;
    this.ctx.pointer.down = false;
  };
}

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-KEY_STEP_PX, 0],
  ArrowRight: [KEY_STEP_PX, 0],
  ArrowUp: [0, -KEY_STEP_PX],
  ArrowDown: [0, KEY_STEP_PX],
};
