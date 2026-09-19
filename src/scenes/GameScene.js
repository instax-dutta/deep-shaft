import Phaser from 'phaser';

import { formatNumber } from '../core/numberFormat.js';
import { getResource } from '../data/resources.js';
import { shaftLayoutFor } from './shaftVisual.js';

const INK = '#f4e3c1';
const INK_DIM = '#cbbba0';
const MARKER = 0xffe0a3;

/** Below this band height there is no room for a readable label. */
const MIN_LABEL_BAND_HEIGHT = 26;

function toColor(hex) {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

/**
 * Game scene: renders the mine shaft and turns taps into commands.
 *
 * The scene owns no economy math — it asks the composition layer for a state snapshot, draws it,
 * and dispatches named commands back. Tapping the shaft is the spec's manual mining action, so a
 * tap gets immediate visible feedback rather than only a changing number.
 */
export class GameScene extends Phaser.Scene {
  constructor(context) {
    super({ key: 'GameScene' });
    this.context = context;
    this.lastSignature = null;
    this.strataTexts = [];
  }

  create() {
    this.graphics = this.add.graphics();

    this.input.on('pointerdown', (pointer) => this.handleTap(pointer));
    this.scale.on('resize', () => {
      this.lastSignature = null;
      this.draw();
    });

    this.draw();
  }

  update() {
    this.draw();
  }

  /** Redraws only when something visible actually changed. */
  draw() {
    const state = this.context?.getState?.();
    if (!state || !this.graphics) {
      return;
    }

    const modifiers = this.context.getModifiers?.() ?? {};
    const signature = [
      state.depthTier,
      this.scale.width,
      this.scale.height,
      modifiers.caveIn === true,
      modifiers.luckyVein === true,
    ].join('|');
    if (signature === this.lastSignature) {
      return;
    }
    this.lastSignature = signature;

    const layout = shaftLayoutFor(
      state,
      { width: this.scale.width, height: this.scale.height },
      modifiers,
    );

    this.drawStrata(layout);
    this.drawSwatches(layout);
    this.drawRails(layout);
    this.drawMarker(layout);
    this.drawEventState(layout);
    this.drawLabels(layout);
  }

  drawStrata(layout) {
    const graphics = this.graphics;

    for (const band of layout.bands) {
      graphics.fillStyle(toColor(band.color), 1);
      graphics.fillRect(band.left, band.top, band.width, band.height);

      // Deeper rock sits darker, which is what makes depth read at a glance.
      if (band.shade > 0) {
        graphics.fillStyle(0x000000, band.shade * 0.45);
        graphics.fillRect(band.left, band.top, band.width, band.height);
      }

      graphics.fillStyle(0x000000, 0.25);
      for (const mark of band.marks) {
        graphics.fillRect(mark.x, mark.y, mark.width, mark.height);
      }

      // Seam between strata.
      graphics.fillStyle(0x000000, 0.5);
      graphics.fillRect(band.left, band.top + band.height - 1, band.width, 1);
    }

    const current = layout.bands[layout.bands.length - 1];
    graphics.lineStyle(2, MARKER, 0.7);
    graphics.strokeRect(current.left + 1, current.top + 1, current.width - 2, current.height - 2);
  }

  drawSwatches(layout) {
    const size = 8;
    const gap = 4;

    for (const band of layout.bands) {
      if (band.height < MIN_LABEL_BAND_HEIGHT) {
        continue;
      }
      const y = band.top + band.height - size - 8;
      band.swatches.forEach((swatch, index) => {
        this.graphics.fillStyle(toColor(swatch.color), 1);
        this.graphics.fillRect(band.left + 12 + index * (size + gap), y, size, size);
      });
    }
  }

  drawRails(layout) {
    for (const rail of layout.rails) {
      this.graphics.fillStyle(0x14110e, 0.75);
      this.graphics.fillRect(rail.left, rail.top, rail.width, rail.height);
    }

    this.graphics.fillStyle(0xd9c9a3, 0.9);
    this.graphics.fillRect(0, layout.surfaceLine.y, layout.width, layout.surfaceLine.height);
  }

  drawMarker(layout) {
    const top = layout.markerTop;
    this.graphics.fillStyle(MARKER, 0.95);
    this.graphics.fillTriangle(6, top - 6, 6, top + 6, 16, top);
  }

  drawEventState(layout) {
    if (layout.dimmed) {
      this.graphics.fillStyle(0x000000, 0.6);
      this.graphics.fillRect(0, 0, layout.width, layout.height);
    }
    if (layout.glowing) {
      this.graphics.fillStyle(0xffd166, 0.2);
      this.graphics.fillRect(0, 0, layout.width, layout.height);
    }
  }

  drawLabels(layout) {
    for (const text of this.strataTexts) {
      text.destroy();
    }
    this.strataTexts = [];

    for (const band of layout.bands) {
      if (band.height < MIN_LABEL_BAND_HEIGHT) {
        continue;
      }
      const name = this.add.text(band.left + 12, band.top + 6, band.label, {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '12px',
        color: INK,
      });
      const depth = this.add.text(band.left + 12, band.top + 21, `${band.depthMeters} m`, {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '10px',
        color: INK_DIM,
      });
      this.strataTexts.push(name, depth);
    }
  }

  /** Manual mining: dispatch the tap and show what it produced right where the player tapped. */
  handleTap(pointer) {
    const result = this.context?.dispatch?.({ type: 'mine' });
    if (!result?.ok) {
      return;
    }

    const definition = getResource(result.resourceId);
    const label = `+${formatNumber(result.amount)}${definition ? ` ${definition.name}` : ''}`;

    const text = this.add
      .text(pointer.x, pointer.y, label, {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: INK,
      })
      .setOrigin(0.5)
      .setDepth(10);

    const ring = this.add.circle(pointer.x, pointer.y, 6).setStrokeStyle(2, MARKER, 0.9).setDepth(9);

    this.tweens.add({
      targets: text,
      y: pointer.y - 38,
      alpha: 0,
      duration: 700,
      onComplete: () => text.destroy(),
    });
    this.tweens.add({
      targets: ring,
      scale: 3,
      alpha: 0,
      duration: 400,
      onComplete: () => ring.destroy(),
    });
  }
}
