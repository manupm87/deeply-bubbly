/**
 * Start / title screen: the game's name and the ONE choice of GDD §3.1 — "cada estación alcanzada queda
 * desbloqueada para siempre y se puede empezar la partida desde ahí". *Se puede*: reaching Zone 3 must
 * never take the surface away from a player who wants to swim it again, so the two ways in are always
 * side by side, and neither of them ever writes to the save.
 *
 * One component, two entry points (there is no second copy of this screen anywhere):
 *   · boot, for a returning player (`save.unlockedStation >= 0`) — a first-ever player never sees it,
 *     §8 forbids a modal before the wordless tutorial;
 *   · the pause menu's "Salir", so the choice is also reachable in the middle of a dive.
 *
 * "Seguir" resumes the world as it stands — at boot that world is already built at the unlocked
 * station, so the choice costs no rebuild and the label can promise the depth it starts at; mid-dive it
 * is the dive on screen. "Desde la superficie" asks `main.ts` for a brand new run through 'newRun'.
 */
import type Phaser from 'phaser';
import { pxToMeters } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { UI } from '../palette';
import { Button } from './Button';
import type { HudLayout } from './layout';
import { Overlay } from './Overlay';
import { formatMeters, pixelText } from './text';
import { strings } from './strings';

/** The game's name: a proper noun, not translated, and outside the < 40 word budget of pillar 5. */
const GAME_TITLE = 'Deeply Bubbly';

export interface StartScreenActions {
  /** Play the world as it stands (it already starts at the unlocked station). */
  onContinue: () => void;
  /** Start a fresh run from 0 m; the unlocked station stays unlocked. */
  onSurface: () => void;
}

/**
 * The checkpoint THIS world dives from — the run's own (`lastStationIndex`), and the save's only
 * before the first frame has been simulated. Never `save.unlockedStation` on top of a live run: the
 * button resumes the world that exists, so promising the deepest station the player OWNS would lie to
 * anyone who is in the middle of a run from the surface.
 */
function currentStationIndex(ctx: GameContext): number {
  const index = ctx.snapshot?.run.lastStationIndex ?? ctx.save.unlockedStation;
  return Math.min(index, ctx.campaign.immersions.length - 1);
}

/**
 * Depth of that station's checkpoint. The px → m curve is piecewise by zone and lives in core
 * (`level/depth.ts`); the shell reads `stationY` off the campaign it is playing and converts with the
 * same function the HUD ribbon uses, so there is no second conversion to keep in sync.
 */
function stationDepthM(ctx: GameContext, index: number): number {
  const immersion = ctx.campaign.immersions[index];
  return immersion === undefined ? 0 : pxToMeters(immersion.stationY);
}

export class StartScreen extends Overlay {
  private readonly ctx: GameContext;
  private readonly title: Phaser.GameObjects.Text;
  private readonly continueButton: Button;
  private readonly surfaceButton: Button;

  constructor(scene: Phaser.Scene, ctx: GameContext, layout: HudLayout, actions: StartScreenActions) {
    super(scene, layout, ctx.pointer, 0.92);
    this.ctx = ctx;
    const s = strings();

    this.title = pixelText(scene, {
      x: 0,
      y: 0,
      text: GAME_TITLE,
      size: 12,
      zoom: layout.zoom,
      color: UI.cyan,
      originX: 0.5,
      originY: 0.5,
    });

    const size = this.buttonSize(layout);
    this.continueButton = new Button(scene, {
      id: 'start.continue',
      x: 0,
      y: 0,
      ...size,
      zoom: layout.zoom,
      touch: layout.touch,
      label: this.continueLabel(),
      size: 10,
      tone: 'primary',
      input: ctx,
      onTap: actions.onContinue,
    });
    this.surfaceButton = new Button(scene, {
      id: 'start.surface',
      x: 0,
      y: 0,
      ...size,
      zoom: layout.zoom,
      touch: layout.touch,
      label: s.fromSurface,
      size: 10,
      tone: 'ghost',
      input: ctx,
      onTap: actions.onSurface,
    });

    this.add(this.title, this.continueButton.root, this.surfaceButton.root);
    this.place(layout);
  }

  override layout(layout: HudLayout): void {
    super.layout(layout);
    const size = this.buttonSize(layout);
    this.continueButton.setSize(size.w, size.h);
    this.surfaceButton.setSize(size.w, size.h);
    this.place(layout);
  }

  /** Both actions are giant and both live in the bottom third (§8): they are read with the thumb. */
  private buttonSize(layout: HudLayout): { w: number; h: number } {
    return {
      w: Math.round(layout.viewW * 0.78),
      h: Math.min(40, Math.max(30, Math.round(layout.viewH * 0.09))),
    };
  }

  private place(layout: HudLayout): void {
    const cx = Math.round(layout.viewW / 2);
    this.title.setPosition(cx, Math.round(layout.viewH * 0.3));
    this.continueButton.setPosition(cx, Math.round(layout.viewH * 0.72));
    this.surfaceButton.setPosition(cx, Math.round(layout.viewH * 0.86));
  }

  /**
   * "Seguir · 83 m" when this run really dives from a checkpoint, plain "Bajar" when it does not —
   * during the very first dive, and during a run taken from the surface, where the only honest promise
   * is "carry on with what is on screen".
   */
  private continueLabel(): string {
    const s = strings();
    const index = currentStationIndex(this.ctx);
    if (index < 0) return s.dive;
    return `${s.resume} · ${formatMeters(stationDepthM(this.ctx, index))}`;
  }

  /** Re-read on every open: a station banked during this dive is already part of the offer. */
  override show(): void {
    this.continueButton.setLabel(this.continueLabel());
    super.show();
  }

  override destroy(): void {
    this.continueButton.destroy();
    this.surfaceButton.destroy();
    super.destroy();
  }
}
