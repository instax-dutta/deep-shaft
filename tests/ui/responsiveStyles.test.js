/**
 * Responsive stylesheet contract.
 *
 * Layout itself is verified for real in `scripts/browser-responsive.mjs`, which measures the
 * production bundle at eight viewports. These tests guard the *decisions* in the stylesheet that
 * a browser run cannot pin down, because they are the ones that silently rot:
 *
 * - the breakpoint duplicated between CSS and `config.ui.mobileBreakpointPx`
 * - the HUD column count being tied to the viewport rather than to the panel column it lives in
 * - the resource value line having no line-break opportunity, which is what let labels spill out
 *   of their card and past the viewport edge on medium widths
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { config } from '../../src/data/config.js';

const CSS = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');

/**
 * Every declaration of `property` across every rule matching `selector`.
 *
 * A selector legitimately appears more than once — `#app-root` is declared once for phones and
 * again inside the wider-screen media query — so a helper that only read the first rule would miss
 * the declaration actually under test.
 */
function declaredValues(selector, property) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rules = CSS.matchAll(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'gm'));

  const values = [];
  for (const rule of rules) {
    const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'm').exec(rule[1]);
    if (match) {
      values.push(match[1].trim());
    }
  }
  return values;
}

function declaredValue(selector, property) {
  return declaredValues(selector, property)[0] ?? null;
}

describe('responsive stylesheet', () => {
  it('keeps the layout breakpoint in step with the configured value', () => {
    // CSS cannot read the config module, so the number is written twice by necessity. This is the
    // guard that stops the two copies drifting apart.
    const match = /@media \(min-width:\s*(\d+)px\)/.exec(CSS);

    expect(match).not.toBeNull();
    expect(Number(match[1])).toBe(config.ui.mobileBreakpointPx);
  });

  it('lets the HUD column count follow the panel column, not the viewport', () => {
    // The panel column is 340-560px wide across every side-by-side viewport, so a viewport-derived
    // column count produced cramped cards on tablets and stretched ones on desktop.
    const tracks = declaredValue('.hud', 'grid-template-columns');

    expect(tracks).toContain('auto-fit');
  });

  it('gives every resource value a line-break opportunity instead of a bare margin', () => {
    // The failure this fixes: the resource name and amount sat side by side with no break between
    // them, so a narrow card could neither wrap nor shrink and the label escaped the card.
    expect(declaredValue('.hud__value', 'flex-wrap')).toBe('wrap');
    expect(declaredValue('.hud__value', 'display')).toBe('flex');
    expect(CSS).not.toMatch(/\.hud__value\s*>\s*\*\s*\+\s*\*/);
  });

  it('lets a HUD card shrink below its content width', () => {
    // A grid item defaults to `min-width: auto`, which refuses to shrink and forces overflow.
    expect(declaredValue('.hud__stat', 'min-width')).toBe('0');
  });

  it('caps the panel column so wide screens do not stretch it without limit', () => {
    const tracks = declaredValues('#app-root', 'grid-template-columns');

    // The side-by-side rule must bound the panel column; an unbounded `1fr` let it grow to
    // 835px on a 1920px screen, stretching panel content into very long lines.
    expect(tracks.some((value) => value.includes('clamp('))).toBe(true);
  });
});
