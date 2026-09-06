/**
 * Phase 'campaignComplete' (§12): the placeholder celebration at the bottom of the campaign. It shares
 * only `Overlay` with the station and fail screens — same dim, same fade — and none of their layout:
 * there is no run to summarise here, just the depth reached and the way back to the world map.
 */
import type Phaser from 'phaser';
import type { WorldSnapshot } from '@deeply-bubbly/core';
import type { GameContext } from '../context';
import { UI } from '../palette';
import { Button } from './Button';
import type { HudLayout } from './layout';
import { Overlay, bottomSlots } from './Overlay';
import { formatMeters, pixelText } from './text';

export class CampaignCompleteScreen extends Overlay {
  private readonly title: Phaser.GameObjects.Text;
  private readonly depthText: Phaser.GameObjects.Text;
  private readonly button: Button;

  constructor(scene: Phaser.Scene, ctx: GameContext, layout: HudLayout, labels: { title: string; giant: string }) {
    super(scene, layout, ctx.pointer, 0.85);
    this.title = pixelText(scene, {
      x: 0,
      y: 0,
      text: labels.title,
      size: 12,
      zoom: layout.zoom,
      color: UI.amber,
      originX: 0.5,
      originY: 0.5,
    });
    this.depthText = pixelText(scene, {
      x: 0,
      y: 0,
      text: '',
      size: 10,
      zoom: layout.zoom,
      color: UI.white,
      originX: 0.5,
      originY: 0.5,
    });
    const slots = bottomSlots(layout);
    this.button = new Button(scene, {
      ...slots.giant,
      zoom: layout.zoom,
        touch: layout.touch,
      label: labels.giant,
      size: 10,
      tone: 'primary',
      input: ctx,
      // The bottom of the campaign is the end of a session, not the start of another run: it goes back
      // to the world map, where every choice of where to dive is made (WORLD-MAP.md §3).
      onTap: () => ctx.bus.emit('toMap'),
    });
    this.add(this.title, this.depthText, this.button.root);
    this.place(layout);
  }

  override layout(layout: HudLayout): void {
    super.layout(layout);
    this.place(layout);
  }

  private place(layout: HudLayout): void {
    const cx = layout.viewW / 2;
    this.title.setPosition(cx, Math.round(layout.viewH * 0.34));
    this.depthText.setPosition(cx, Math.round(layout.viewH * 0.46));
    const slots = bottomSlots(layout);
    this.button.setPosition(slots.giant.x, slots.giant.y);
  }

  present(snapshot: WorldSnapshot): void {
    this.depthText.setText(formatMeters(snapshot.hud.depthM));
    this.show();
  }

  override destroy(): void {
    this.button.destroy();
    super.destroy();
  }
}
