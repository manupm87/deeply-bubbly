/**
 * Desktop test aid for the D5 peek: I/J/K/L nudge a peek target that starts at Bur.
 *
 * A phone never reaches this — the minimap is the control — but a keyboard has no second finger, and
 * without it the whole "ojeo" cannot be exercised on a desktop at all. It owns the key bookkeeping
 * only; who wins between a key and a finger on the map is `ui/Minimap.ts`'s call.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '@deeply-bubbly/core';

/** Design px the target moves per key event (a held key repeats, so it glides). */
const KEY_STEP_PX = 12;

const STEPS: ReadonlyArray<readonly [string, number, number]> = [
  ['I', 0, -KEY_STEP_PX],
  ['K', 0, KEY_STEP_PX],
  ['J', -KEY_STEP_PX, 0],
  ['L', KEY_STEP_PX, 0],
];

export interface PeekKeysHost {
  /** Where the target starts on the first key event, or null when there is no snapshot yet. */
  origin(): Vec2 | null;
  /** A key moved the target. */
  onTarget(target: Vec2): void;
  /** Every peek key is up again. */
  onRelease(): void;
  /** The minimap is hidden (a screen owns the display); keys do nothing then. */
  blocked(): boolean;
}

export class PeekKeys {
  private readonly held = new Set<string>();
  private target: Vec2 | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: PeekKeysHost,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) return;
    for (const [key, dx, dy] of STEPS) {
      keyboard.on(`keydown-${key}`, () => this.step(key, dx, dy));
      keyboard.on(`keyup-${key}`, () => this.up(key));
    }
  }

  get active(): boolean {
    return this.held.size > 0;
  }

  /** The target the keys are holding, or null when none of them is down. */
  get current(): Vec2 | null {
    return this.active ? this.target : null;
  }

  /** Drops every key without notifying: the caller is already releasing the peek. */
  clear(): void {
    this.held.clear();
    this.target = null;
  }

  private step(key: string, dx: number, dy: number): void {
    if (this.host.blocked()) return;
    if (this.target === null) {
      const origin = this.host.origin();
      if (!origin) return;
      this.target = { x: origin.x, y: origin.y };
    }
    this.held.add(key);
    this.target = { x: this.target.x + dx, y: this.target.y + dy };
    this.host.onTarget(this.target);
  }

  private up(key: string): void {
    this.held.delete(key);
    if (this.held.size > 0) return;
    this.target = null;
    this.host.onRelease();
  }

  destroy(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    for (const [key] of STEPS) {
      keyboard.off(`keydown-${key}`);
      keyboard.off(`keyup-${key}`);
    }
  }
}
