import Phaser from 'phaser';

/**
 * Boot scene: the asset-loading and one-time initialization hook.
 *
 * v1 draws the shaft with Phaser graphics rather than an image pack, so there is nothing to
 * preload yet; the scene exists as the documented place for that work and to hand control to
 * the game scene.
 */
export class BootScene extends Phaser.Scene {
  constructor(context) {
    super({ key: 'BootScene' });
    this.context = context;
  }

  create() {
    this.scene.start('GameScene');
  }
}
