import Phaser from 'phaser';

import { formatNumber } from '../core/numberFormat.js';
import { MINERAL_COLORS, INK_COLOR, INK_DIM_COLOR } from '../data/artPalette.js';
import { getResource } from '../data/resources.js';
import { shaftLayoutFor } from './shaftVisual.js';

const INK = INK_COLOR;
const MARKER = 0xffe0a3;

/** Explicit layer order: art, then decoration over it, then readable text on top. */
const DEPTH = Object.freeze({
  strata: 0,
  minerals: 1,
  marker: 2,
  rails: 3,
  overlay: 4,
  labels: 5,
});

/** Below this band height there is no room for a readable label. */
const MIN_LABEL_BAND_HEIGHT = 26;

/** How much a deeper stratum darkens, applied as a tint over the rock tile. */
const MAX_DEPTH_DARKENING = 0.45;

function toColor(hex) {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

/** Multiplying a band's tint is how depth darkens the rock without redrawing it. */
function shadeTint(shade) {
  const factor = Math.round(255 * (1 - Math.min(1, shade) * MAX_DEPTH_DARKENING));
  return (factor << 16) | (factor << 8) | factor;
}

/**
 * Game scene: renders the mine shaft from the art pack and turns taps into commands.
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
    this.art = [];
  }

  create() {
    this.overlay = this.add.graphics().setDepth(DEPTH.overlay);

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
    if (!state || !this.overlay) {
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

    this.clearArt();
    this.drawStrata(layout);
    this.drawMinerals(layout);
    this.drawMarker(layout);
    this.drawRails(layout);
    this.drawOverlay(layout);
    this.drawLabels(layout);
  }

  /** Art is rebuilt with the layout rather than reconciled: it only changes when depth does. */
  clearArt() {
    for (const object of this.art) {
      object.destroy();
    }
    this.art = [];
  }

  /** One stretched rock tile per stratum, darkening with depth. */
  drawStrata(layout) {
    for (const band of layout.bands) {
      const sprite = this.add
        .tileSprite(band.left, band.top, band.width, band.height, band.textureKey)
        .setOrigin(0, 0)
        .setTileScale(band.tileScaleX, band.tileScaleY)
        .setDepth(DEPTH.strata)
        .setTint(shadeTint(band.shade));

      this.art.push(sprite);
    }
  }

  /** Mineral sprites, tinted with the same legend colours the swatches use. */
  drawMinerals(layout) {
    for (const band of layout.bands) {
      for (const mineral of band.minerals) {
        const sprite = this.add
          .image(mineral.x + mineral.size / 2, mineral.y + mineral.size / 2, mineral.key)
          .setDisplaySize(mineral.size, mineral.size)
          .setDepth(DEPTH.minerals)
          .setTint(toColor(MINERAL_COLORS[mineral.category]));

        this.art.push(sprite);
      }
    }
  }

  drawMarker(layout) {
    const marker = this.add
      .image(layout.marker.x, layout.marker.y, layout.marker.textureKey)
      .setOrigin(0, 0.5)
      .setDisplaySize(layout.marker.size, layout.marker.size)
      .setDepth(DEPTH.marker);

    this.art.push(marker);
  }

  drawRails(layout) {
    for (const rail of layout.rails) {
      const sprite = this.add
        .tileSprite(rail.left, rail.top, rail.width, rail.height, rail.textureKey)
        .setOrigin(0, 0)
        .setTileScale(rail.tileScaleX, rail.tileScaleY)
        .setDepth(DEPTH.rails);

      this.art.push(sprite);
    }
  }

  /** Swatches, surface line, the current-stratum outline, and event tinting. */
  drawOverlay(layout) {
    const graphics = this.overlay;
    graphics.clear();

    const current = layout.bands[layout.bands.length - 1];
    graphics.lineStyle(2, MARKER, 0.7);
    graphics.strokeRect(current.left + 1, current.top + 1, current.width - 2, current.height - 2);

    const size = 8;
    const gap = 4;
    for (const band of layout.bands) {
      if (band.height < MIN_LABEL_BAND_HEIGHT) {
        continue;
      }
      const y = band.top + band.height - size - 8;
      band.swatches.forEach((swatch, index) => {
        graphics.fillStyle(toColor(swatch.color), 1);
        graphics.fillRect(band.left + 12 + index * (size + gap), y, size, size);
      });
    }

    graphics.fillStyle(toColor(INK), 0.9);
    graphics.fillRect(0, layout.surfaceLine.y, layout.width, layout.surfaceLine.height);

    if (layout.dimmed) {
      graphics.fillStyle(0x000000, 0.6);
      graphics.fillRect(0, 0, layout.width, layout.height);
    }
    if (layout.glowing) {
      graphics.fillStyle(0xffd166, 0.2);
      graphics.fillRect(0, 0, layout.width, layout.height);
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
      const name = this.add
        .text(band.left + 12, band.top + 6, band.label, {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '12px',
          color: INK,
        })
        .setDepth(DEPTH.labels);
      const depth = this.add
        .text(band.left + 12, band.top + 21, `${band.depthMeters} m`, {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '10px',
          color: INK_DIM_COLOR,
        })
        .setDepth(DEPTH.labels);
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
