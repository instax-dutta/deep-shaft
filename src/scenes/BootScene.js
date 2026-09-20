import Phaser from 'phaser';

import { artLoadList } from '../data/artPack.js';

/**
 * Boot scene: the asset-loading hook.
 *
 * Every texture the shaft draws comes from the art pack, listed in `data/artPack.js` — the same
 * module the pack generator renders from and the pack contract test verifies, so a texture cannot
 * be loaded under a key the pack does not declare. A missing file surfaces as Phaser's
 * missing-texture placeholder rather than silently drawing nothing.
 */
export class BootScene extends Phaser.Scene {
  constructor(context) {
    super({ key: 'BootScene' });
    this.context = context;
  }

  preload() {
    for (const { key, url } of artLoadList()) {
      this.load.image(key, url);
    }
  }

  create() {
    this.scene.start('GameScene');
  }
}
