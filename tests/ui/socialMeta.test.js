import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pngSize } from '../helpers/png.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const DOMAIN = 'https://deepshaft.sdad.pro';

/** Pulls every `property`/`name` -> content pair the social crawlers read. */
function head() {
  const tags = {};
  for (const match of html.matchAll(/<(?:meta|link)\b[^>]*>/g)) {
    const tag = match[0];
    const key = /(?:property|name|rel)="([^"]+)"/.exec(tag)?.[1];
    if (!key) {
      continue;
    }
    const content = /content="([^"]*)"/.exec(tag)?.[1]
      ?? /href="([^"]*)"/.exec(tag)?.[1]
      ?? '';
    tags[key] = content;
  }
  return tags;
}

describe('social sharing metadata (file contract)', () => {
  const tags = head();

  it('the Open Graph card names the game and describes it', () => {
    expect(tags['og:title']).toContain('Deep Shaft');
    expect(tags['og:description']?.length).toBeGreaterThan(20);
    expect(tags['og:type']).toBe('website');
    expect(tags['og:url']).toBe(`${DOMAIN}/`);
  });

  it('the share image is an absolute URL on the game domain', () => {
    expect(tags['og:image']).toBe(`${DOMAIN}/og-image.png`);
  });

  it('Twitter cards use the large image format with the same copy', () => {
    expect(tags['twitter:card']).toBe('summary_large_image');
    expect(tags['twitter:title']).toContain('Deep Shaft');
    expect(tags['twitter:image']).toBe(`${DOMAIN}/og-image.png`);
  });

  it('the canonical URL points at the live domain', () => {
    expect(tags['canonical']).toBe(`${DOMAIN}/`);
  });

  it('the committed og-image is a real 1200x630 PNG', () => {
    const path = join(root, 'public', 'og-image.png');
    expect(existsSync(path)).toBe(true);
    const size = pngSize(readFileSync(path));
    expect(size).toEqual({ width: 1200, height: 630 });
  });
});
