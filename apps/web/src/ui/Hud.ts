/**
 * Top band of the HUD: air pips on the left, depth ribbon on the right. It owns nothing else —
 * screens, pause and tutorial are separate overlays — and it never touches the world.
 */
import type Phaser from 'phaser';
import type { GameEvent, Tuning, WorldSnapshot } from '@deeply-bubbly/core';
import { AirPips } from './AirPips';
import { DepthMeter } from './DepthMeter';
import type { HudLayout } from './layout';

export class Hud {
  private readonly pips: AirPips;
  private readonly depth: DepthMeter;

  constructor(scene: Phaser.Scene, layout: HudLayout, tuningOf?: () => Tuning) {
    this.pips = new AirPips(scene, layout);
    this.depth = new DepthMeter(scene, layout, tuningOf);
  }

  layout(layout: HudLayout): void {
    this.pips.layout(layout);
    this.depth.layout(layout);
  }

  sync(snapshot: WorldSnapshot): void {
    this.pips.sync(snapshot.hud, snapshot.timeMs);
    this.depth.sync(snapshot.hud);
  }

  handleEvent(event: GameEvent): void {
    this.pips.handleEvent(event);
  }

  setVisible(value: boolean): void {
    this.pips.setVisible(value);
    this.depth.setVisible(value);
  }

  destroy(): void {
    this.pips.destroy();
    this.depth.destroy();
  }
}
