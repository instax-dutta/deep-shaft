/**
 * Accessibility stylesheet contract.
 *
 * Motion preferences and focus visibility cannot be asserted through jsdom's layout model, so the
 * stylesheet decisions are pinned here by reading the CSS — the same approach as
 * `responsiveStyles.test.js`.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const CSS = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');

describe('accessibility stylesheet', () => {
  it('disables motion under prefers-reduced-motion', () => {
    const media = /@media \(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(CSS);

    expect(media).not.toBeNull();
    expect(media[1]).toMatch(/transition[^;]*:\s*none/);
    expect(media[1]).toMatch(/animation[^;]*:\s*none/);
  });

  it('shows a visible focus ring for keyboard users', () => {
    expect(CSS).toMatch(/:focus-visible/);
    expect(CSS).toMatch(/:focus-visible[^{]*\{[^}]*outline/);
  });
});
