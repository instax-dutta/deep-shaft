import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = readFileSync(join(root, 'src', 'ui', 'styles.css'), 'utf8');

/** The block a selector declares, so assertions read like decisions, not substrings. */
function ruleFor(selector) {
  const flat = css.replace(/\s+/g, ' ');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(flat);
  return match ? match[1] : null;
}

describe('mobile ergonomics (stylesheet contract)', () => {
  it('interactive elements opt out of the double-tap zoom delay', () => {
    const block = ruleFor('button, select, input, textarea');
    expect(block).toContain('touch-action: manipulation');
  });

  it('taps never flash the platform highlight or select game copy', () => {
    const bodyBlock = ruleFor('html, body');
    expect(bodyBlock).toContain('-webkit-tap-highlight-color: transparent');

    const buttonBlock = ruleFor('button, select, input, textarea');
    expect(buttonBlock).toContain('user-select: none');
  });

  it('the panel column stops page-level rubber-banding and pull-to-refresh', () => {
    const panels = ruleFor('.panels');
    expect(panels).toContain('overscroll-behavior');
  });

  it('the app root has a viewport-height fallback for browsers without dvh', () => {
    const block = ruleFor('#app-root');
    const vh = block.indexOf('height: 100vh');
    const dvh = block.indexOf('height: 100dvh');
    expect(vh).toBeGreaterThanOrEqual(0);
    expect(dvh).toBeGreaterThan(vh);
  });

  it('the shell keeps content clear of the notch in standalone mode', () => {
    const block = ruleFor('#app-root');
    expect(block).toContain('env(safe-area-inset-top)');
  });

  it('the HUD never overlays controls while scrolling', () => {
    // A sticky HUD was tried and reverted: at phone widths the HUD is several cards tall, and
    // controls scrolled beneath it ate the tap (a click would hit the HUD instead). The browser
    // smoke timed out on exactly that. No overlay on the scroll content.
    const hud = ruleFor('.hud');
    expect(hud ?? '').not.toContain('position: sticky');
  });

  it('form controls are large enough that iOS will not zoom into them', () => {
    // iOS Safari zooms any focused control whose computed font-size is below 16px.
    const textarea = ruleFor('.settings__save-text');
    expect(textarea).toMatch(/16px|1rem/);
  });
});
