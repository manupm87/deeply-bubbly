/**
 * Input → `PointerInput` (SHELL.md "Input", GDD §2.1, DECISIONS-v1.2 D2). Deliberately dumb: it
 * samples ONE pointer state per frame in design px and writes it into `ctx.pointer`. It interprets no
 * gesture — the frozen origin, the pull, the cancel radius and the aim timeout all live in `core`.
 * HUD buttons swallow their own events.
 *
 * The one distinction it DOES make is between the two ways a contact can end, because D2 makes them
 * mean opposite things. A real `pointerup` is a RELEASE: it takes the shot (or cancels it, if the
 * finger came back inside PULL_CANCEL_PX — core decides). Everything else that ends a contact without
 * the player letting go — the tab going away, focus lost, an automatic pause, a `pointercancel`, a
 * drag that walks off the canvas — is an ABORT, and it is handed to core as `GameWorld.cancelAim()`.
 * Handing those to core as a plain `down = false` would fire the shot: the player takes a phone call
 * mid-pull and comes back to a launch she never made. The adapter still interprets nothing; it only
 * reports WHICH of the two endings the browser gave it.
 */
import * as Phaser from 'phaser';
import type { GameContext } from '../context';

/** Where the virtual (keyboard) pointer starts: centre of the thumb zone. */
const KEY_POINTER_FRACTION_Y = 0.8;
/** Design px moved per arrow-key press while the space bar drives a virtual finger. */
const KEY_STEP_PX = 6;

export class PointerAdapter {
  private readonly scene: Phaser.Scene;
  private readonly ctx: GameContext;
  /** Told to core when a contact ends without a release; see the class header. */
  private readonly onAbort: () => void;
  /** Last known position in design px; reused by the keyboard fallback. */
  private lastX = 90;
  private lastY = 256;
  private keyDown = false;
  private attached = false;
  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible') this.abort();
  };
  private readonly onBlur = (): void => this.abort();
  private readonly onPointerCancel = (): void => this.abort();

  constructor(scene: Phaser.Scene, ctx: GameContext, onAbort: () => void = () => ctx.world.cancelAim()) {
    this.scene = scene;
    this.ctx = ctx;
    this.onAbort = onAbort;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const input = this.scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    input.on(Phaser.Input.Events.GAME_OUT, this.onGameOut, this);

    const keyboard = input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-SPACE', this.onSpaceDown, this);
      keyboard.on('keyup-SPACE', this.onSpaceUp, this);
      keyboard.on('keydown-LEFT', this.onArrow(-KEY_STEP_PX, 0), this);
      keyboard.on('keydown-RIGHT', this.onArrow(KEY_STEP_PX, 0), this);
      keyboard.on('keydown-UP', this.onArrow(0, -KEY_STEP_PX), this);
      keyboard.on('keydown-DOWN', this.onArrow(0, KEY_STEP_PX), this);
    }

    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointercancel', this.onPointerCancel);
  }

  destroy(): void {
    if (!this.attached) return;
    this.attached = false;
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.onGameOut, this);
    this.scene.input.keyboard?.removeAllListeners();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    this.abort();
  }

  /**
   * Ends a contact the player did not end (pause, focus loss, tab hidden, pointercancel, a drag off
   * the canvas): the finger goes up AND the gesture is cancelled, so the pull never becomes a shot.
   * Never fabricates a press.
   */
  abort(): void {
    const wasDown = this.ctx.pointer.down;
    this.keyDown = false;
    this.ctx.pointer.down = false;
    if (wasDown) this.onAbort();
  }

  // ---------------------------------------------------------------------------------------------

  /** Canvas css px → design px of the viewport, clamped to the visible rectangle. */
  private sample(pointer: Phaser.Input.Pointer): void {
    const s = this.ctx.scale;
    const x = (pointer.x - s.offsetX) / s.zoom;
    const y = (pointer.y - s.offsetY) / s.zoom;
    this.lastX = Math.min(s.viewW, Math.max(0, x));
    this.lastY = Math.min(s.viewH, Math.max(0, y));
    this.write();
  }

  private write(): void {
    const p = this.ctx.pointer;
    p.x = this.lastX;
    p.y = this.lastY;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.sample(pointer);
    this.ctx.pointer.down = true;
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    // While the finger is up the position still matters: it seeds the keyboard fallback on desktop.
    this.sample(pointer);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    this.sample(pointer);
    if (!this.keyDown) this.ctx.pointer.down = false;
  }

  /**
   * GAME_OUT hands over a timestamp, not a pointer: only the press state is meaningful here. It fires
   * while the finger is still DOWN — a drag that reaches the edge of the canvas, which a 70 design px
   * pull does routinely on a phone — so it is an abort, never a release.
   */
  private onGameOut(): void {
    if (!this.keyDown) this.abort();
  }

  private onSpaceDown(): void {
    if (this.keyDown) return;
    this.keyDown = true;
    if (this.lastY <= 0) this.lastY = this.ctx.scale.viewH * KEY_POINTER_FRACTION_Y;
    this.write();
    this.ctx.pointer.down = true;
  }

  private onSpaceUp(): void {
    this.keyDown = false;
    this.ctx.pointer.down = false;
  }

  private onArrow(dx: number, dy: number): () => void {
    return () => {
      const s = this.ctx.scale;
      this.lastX = Math.min(s.viewW, Math.max(0, this.lastX + dx));
      this.lastY = Math.min(s.viewH, Math.max(0, this.lastY + dy));
      this.write();
    };
  }
}
