/**
 * The one way a HUD surface takes a touch away from the world.
 *
 * Two things have to happen and BOTH matter (D2: any touch the world sees freezes an aim origin):
 * Phaser propagation is stopped, so the scene-level `POINTER_DOWN` of `GameScene` — and with it
 * `PointerAdapter` — never runs for this event; and the shared `PointerInput` sample the world reads
 * this frame is forced down=false, in case the world's handler already ran this frame.
 *
 * Since D5 that second half is SCOPED TO ONE CONTACT, because there are now two (main.ts enables two
 * active pointers). `PointerInput` is a single shared sample: clearing it for whatever finger touched
 * the HUD used to clear it for the finger that is PULLING THE SLING, and core reads a frozen
 * `aimOrigin` with `down === false` as a release — so reaching for the minimap mid-pull fired the
 * shot. A HUD surface therefore only clears the sample when the contact it swallowed is the one
 * `PointerAdapter` is speaking for (`PointerOwner`); a second finger, or a pull being held with the
 * space bar, is left alone. With no owner wired (a screen with no GameScene under it) the old
 * unconditional behaviour stands: there is no gesture to protect.
 *
 * `ui/Button.ts` and `ui/Minimap.ts` are both HUD surfaces and both need exactly this, so it lives
 * here instead of being written twice with one of the two halves quietly missing.
 */
import type Phaser from 'phaser';
import type { PointerInput } from '@deeply-bubbly/core';

/** Implemented by `PointerAdapter`, published on the context while it is attached. */
export interface PointerOwner {
  /** True when `id` is the contact the world is reading right now (a live gesture, touch only). */
  ownsPointer(id: number): boolean;
}

/** The two fields a HUD surface needs from the context to swallow a touch; `GameContext` has both. */
export interface SwallowTarget {
  pointer: PointerInput;
  pointerOwner: PointerOwner | null;
}

export function swallowPointer(
  event: Phaser.Types.Input.EventData,
  target?: SwallowTarget,
  pointerId?: number,
): void {
  event.stopPropagation();
  if (!target) return;
  const owner = target.pointerOwner;
  // Another finger's gesture (or a keyboard pull): the HUD may not end it.
  if (owner && pointerId !== undefined && !owner.ownsPointer(pointerId)) return;
  target.pointer.down = false;
}
