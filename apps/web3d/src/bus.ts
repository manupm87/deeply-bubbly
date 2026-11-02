/** Small typed event bus: what `Phaser.Events.EventEmitter` was to `apps/web`. */
import type { GameEvent, Tuning } from '@deeply-bubbly/core';

export interface BusEvents {
  gameEvent: [GameEvent];
  pause: [];
  resume: [];
  autoPause: [];
  settingsChanged: [];
  tuningChanged: [Tuning];
  scaleChanged: [];
  hitstop: [number];
  shake: [number, number];
  /** Throw the world away and build one at this checkpoint (-1 = surface). */
  newRun: [{ startStationIndex: number }];
  toMap: [];
  restart: [];
  continue: [];
}

type Listener<K extends keyof BusEvents> = (...args: BusEvents[K]) => void;

export class Bus {
  private readonly listeners = new Map<keyof BusEvents, Set<(...args: never[]) => void>>();

  /** Returns the unsubscribe function. */
  on<K extends keyof BusEvents>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const stored = listener as unknown as (...args: never[]) => void;
    set.add(stored);
    return () => set.delete(stored);
  }

  emit<K extends keyof BusEvents>(event: K, ...args: BusEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copied: a listener may tear down others (a 'toMap' destroys the whole run UI).
    for (const listener of [...set]) (listener as unknown as Listener<K>)(...args);
  }
}
