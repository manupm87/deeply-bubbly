/**
 * Decides which overlay screen matches `snapshot.phase` and keeps the shell-count animation fed.
 * It holds no game rule: the phase, the pearls and the shells all come from the snapshot.
 */
import type Phaser from 'phaser';
import type { GameEvent, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import type { HudLayout } from './layout';
import { CampaignCompleteScreen, DeadScreen, StationScreen, clampShells } from './Screens';
import { strings } from './strings';

export class ScreensController {
  private readonly station: StationScreen;
  private readonly dead: DeadScreen;
  private readonly complete: CampaignCompleteScreen;
  /** run.shells when the current immersion started, to derive the shells just earned. */
  private shellsBaseline = 0;
  private pendingShells: number | null = null;
  private lastPhase: WorldSnapshot['phase'] | null = null;

  constructor(scene: Phaser.Scene, ctx: GameContext, layout: HudLayout) {
    const s = strings();
    this.station = new StationScreen(scene, ctx, layout, { giant: s.keepDiving, slot: s.doublePearls });
    this.dead = new DeadScreen(scene, ctx, layout, { giant: s.again, slot: s.secondBreath });
    this.complete = new CampaignCompleteScreen(scene, ctx, layout, {
      title: s.bottomReached,
      giant: s.again,
    });
  }

  layout(layout: HudLayout): void {
    this.station.layout(layout);
    this.dead.layout(layout);
    this.complete.layout(layout);
  }

  handleEvent(event: GameEvent): void {
    if (event.type === 'immersionComplete') this.pendingShells = clampShells(event.shells);
  }

  get anyVisible(): boolean {
    return this.station.visible || this.dead.visible || this.complete.visible;
  }

  sync(snapshot: WorldSnapshot, dtMs: number): void {
    const phase = snapshot.phase;
    if (phase !== this.lastPhase) {
      this.onPhase(snapshot, phase);
      this.lastPhase = phase;
    }
    if (phase === 'playing') this.shellsBaseline = snapshot.run.shells;
    this.dead.tick(dtMs);
  }

  private onPhase(snapshot: WorldSnapshot, phase: WorldSnapshot['phase']): void {
    this.station.hide();
    this.dead.hide();
    this.complete.hide();
    if (phase === 'station') {
      const earned = this.pendingShells ?? clampShells(snapshot.run.shells - this.shellsBaseline);
      this.pendingShells = null;
      this.station.present(snapshot, earned);
    } else if (phase === 'dead' || phase === 'gameOver') {
      this.dead.present(snapshot, 0);
    } else if (phase === 'campaignComplete') {
      this.complete.present(snapshot);
    }
  }

  destroy(): void {
    this.station.destroy();
    this.dead.destroy();
    this.complete.destroy();
  }
}
