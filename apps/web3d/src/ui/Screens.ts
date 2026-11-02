/**
 * Station, fail and campaign-complete screens, chosen by `snapshot.phase`. They fade in over the frozen
 * scene and talk to the world only through `continueDescent()` / `restart()`.
 */
import type { GameEvent, WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { Button, Overlay, el } from './dom';
import { S, formatMeters } from './strings';

const MAX_SHELLS = 3;
const SHELL_STEP_MS = 180;

const clampShells = (value: number): number => Math.max(0, Math.min(MAX_SHELLS, Math.round(value)));

/** Shared framing of the station and fail screens (GDD §8: identical framing, different verb). */
class ResultScreen extends Overlay {
  private readonly depth: HTMLDivElement;
  private readonly pearls: HTMLSpanElement;
  private readonly shells: HTMLSpanElement[] = [];
  protected readonly slot: Button;
  protected readonly actions: HTMLDivElement;

  constructor(parent: HTMLElement, id: string, giant: { label: string; onTap: () => void }, slotLabel: string, showShells: boolean) {
    super(parent, `screen screen-${id}`);
    this.depth = el('div', 'screen-depth', this.root);
    const shellRow = el('div', 'screen-shells', this.root);
    for (let i = 0; showShells && i < MAX_SHELLS; i++) this.shells.push(el('span', 'shell', shellRow));
    const pearlRow = el('div', 'screen-pearls', this.root);
    el('span', 'pearl', pearlRow);
    this.pearls = el('span', '', pearlRow);
    const actions = el('div', 'screen-actions', this.root);
    new Button({ id: `${id}.giant`, label: giant.label, tone: 'primary', parent: actions, onTap: giant.onTap });
    this.slot = new Button({ label: slotLabel, tone: 'disabled', parent: actions, className: 'btn-slot' });
    this.actions = actions;
  }

  present(snapshot: WorldSnapshot, shellsEarned: number): void {
    this.depth.textContent = formatMeters(snapshot.hud.depthM);
    this.pearls.textContent = String(Math.max(0, Math.round(snapshot.hud.pearls)));
    this.shells.forEach((shell, i) => {
      const won = i < shellsEarned;
      shell.className = won ? 'shell shell-won' : 'shell';
      shell.style.animationDelay = `${i * SHELL_STEP_MS}ms`;
    });
    this.show();
  }
}

class StationScreen extends ResultScreen {
  constructor(parent: HTMLElement, ctx: GameContext) {
    super(
      parent,
      'station',
      {
        label: S.keepDiving,
        onTap: () => {
          ctx.world.continueDescent();
          ctx.bus.emit('continue');
        },
      },
      S.doublePearls,
      true,
    );
    new Button({ id: 'station.map', label: S.map, tone: 'ghost', parent: this.actions, className: 'btn-small', onTap: () => ctx.bus.emit('toMap') });
  }
}

class DeadScreen extends ResultScreen {
  private idleMs = 0;
  private readonly onActivity = (): void => {
    this.idleMs = 0;
  };
  private readonly restart: () => void;

  constructor(parent: HTMLElement, private readonly ctx: GameContext) {
    const restart = (): void => {
      ctx.world.restart();
      ctx.bus.emit('restart');
    };
    super(parent, 'dead', { label: S.again, onTap: restart }, S.secondBreath, false);
    this.restart = restart;
    window.addEventListener('pointerdown', this.onActivity);
  }

  override present(snapshot: WorldSnapshot, shellsEarned: number): void {
    this.idleMs = 0;
    this.slot.setVisible(snapshot.run.failCountThisImmersion >= this.ctx.tuning.AD_OFFER_MIN_FAILS);
    super.present(snapshot, shellsEarned);
  }

  /** Auto-restart after a while: a child who walks away comes back to a playable screen. */
  tick(dtMs: number): void {
    if (!this.visible) return;
    this.idleMs += dtMs;
    if (this.idleMs >= this.ctx.tuning.DEAD_IDLE_AUTO_MS) {
      this.idleMs = 0;
      this.restart();
    }
  }

  destroy(): void {
    window.removeEventListener('pointerdown', this.onActivity);
  }
}

class CampaignScreen extends Overlay {
  private readonly depth: HTMLDivElement;

  constructor(parent: HTMLElement, ctx: GameContext) {
    super(parent, 'screen screen-complete');
    el('div', 'screen-title', this.root, S.bottomReached);
    this.depth = el('div', 'screen-depth', this.root);
    const actions = el('div', 'screen-actions', this.root);
    new Button({ id: 'complete.map', label: S.map, tone: 'primary', parent: actions, onTap: () => ctx.bus.emit('toMap') });
  }

  present(snapshot: WorldSnapshot): void {
    this.depth.textContent = formatMeters(snapshot.hud.depthM);
    this.show();
  }
}

export class ScreensController {
  private readonly station: StationScreen;
  private readonly dead: DeadScreen;
  private readonly complete: CampaignScreen;
  private shellsBaseline = 0;
  private pendingShells: number | null = null;
  private lastPhase: WorldSnapshot['phase'] | null = null;

  constructor(parent: HTMLElement, ctx: GameContext) {
    this.station = new StationScreen(parent, ctx);
    this.dead = new DeadScreen(parent, ctx);
    this.complete = new CampaignScreen(parent, ctx);
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
      this.lastPhase = phase;
    }
    if (phase === 'playing') this.shellsBaseline = snapshot.run.shells;
    this.dead.tick(dtMs);
  }

  destroy(): void {
    this.dead.destroy();
  }
}
