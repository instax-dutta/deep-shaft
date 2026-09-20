/**
 * Installability contract.
 *
 * A web app manifest, its icons, and a service worker are static files: nothing in Vitest can
 * boot them, and the browser run cannot tell a missing icon from a merely unused one. These tests
 * assert the *decisions* a browser cannot report — that the manifest is linked, that every icon it
 * promises exists at the size it claims, that the paths survive the relative build base, and that
 * the worker caches the built shell rather than a hardcoded asset list.
 *
 * Real registration, activation, and offline reload are measured in headless Chromium by
 * `scripts/browser-pwa.mjs`.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { pngSize } from '../helpers/png.js';

const ROOT = new URL('../../', import.meta.url);

function readText(path) {
  return readFileSync(new URL(path, ROOT), 'utf8');
}

function readBytes(path) {
  return readFileSync(new URL(path, ROOT));
}

const HTML = readText('index.html');
const MANIFEST = JSON.parse(readText('public/manifest.webmanifest'));
const WORKER = readText('public/sw.js');
const ART_MANIFEST = JSON.parse(readText('public/art/pack.json'));

/** Every icon link in index.html, as `{ file, widths }` with the path relative to `public/`. */
function linkedIcons() {
  return [...HTML.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map((match) => {
    const tag = match[0];
    return {
      file: /href="([^"]+)"/.exec(tag)[1].replace(/^\.\//, ''),
      declared: /sizes="(\d+)x(\d+)"/.exec(tag)?.slice(1, 3).map(Number) ?? null,
    };
  });
}

describe('web app manifest', () => {
  it('is linked from index.html together with an icon', () => {
    expect(HTML).toMatch(/<link[^>]+rel="manifest"[^>]*>/);
    expect(HTML).toMatch(/<link[^>]+rel="icon"[^>]*>/);
    expect(HTML).toMatch(/<link[^>]+rel="apple-touch-icon"[^>]*>/);
  });

  it('declares the identity, launch target, and display mode a browser needs to install it', () => {
    expect(MANIFEST.name).toBe('Deep Shaft');
    expect(typeof MANIFEST.short_name).toBe('string');
    expect(MANIFEST.start_url).toBeTruthy();
    expect(MANIFEST.display).toBe('standalone');
    expect(MANIFEST.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(MANIFEST.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('declares 192 and 512 pixel icons, including a maskable one', () => {
    const sizes = MANIFEST.icons.map((icon) => icon.sizes);
    const purposes = MANIFEST.icons.map((icon) => icon.purpose ?? 'any');

    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(purposes).toContain('maskable');
    expect(MANIFEST.icons.every((icon) => icon.type === 'image/png')).toBe(true);
  });

  it('points at icon files that exist at the size they claim', () => {
    for (const icon of MANIFEST.icons) {
      const bytes = readBytes(`public/${icon.src}`);
      const [width, height] = icon.sizes.split('x').map(Number);

      expect(pngSize(bytes), icon.src).toEqual({ width, height });
    }
  });

  it('links only icons that exist, including the favicon and touch icon', () => {
    const icons = linkedIcons();

    expect(icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of icons) {
      const bytes = readBytes(`public/${icon.file}`);

      if (icon.declared) {
        const [width, height] = icon.declared;
        expect(pngSize(bytes), icon.file).toEqual({ width, height });
      }
    }
  });

  it('uses relative paths so the static build works from any deployment path', () => {
    expect(MANIFEST.start_url.startsWith('./')).toBe(true);
    expect(MANIFEST.icons.every((icon) => !icon.src.startsWith('/'))).toBe(true);
    expect(HTML).not.toMatch(/rel="(manifest|icon|apple-touch-icon)"[^>]*href="\//);
  });
});

describe('service worker', () => {
  it('caches the app shell and its build assets on install', () => {
    expect(WORKER).toMatch(/addEventListener\(\s*'install'/);
    expect(WORKER).toContain('caches.open');
    expect(WORKER).toContain('addAll');
  });

  it('derives the cached assets from the built shell instead of a hardcoded list', () => {
    // Hashed bundle names are unknowable at author time, so the worker reads the built HTML back
    // out of the cache and keeps the references it finds. It runs in a worker, where there is no
    // DOMParser, so the references come from the markup text rather than from a selector. A
    // hardcoded asset list would 404 on the next build, which this guards against.
    expect(WORKER).toMatch(/text\(\)/);
    expect(WORKER).toMatch(/src|href/);
    expect(WORKER).not.toMatch(/assets\/index-/);
  });

  it('serves same-origin requests from the cache and deletes superseded caches on activate', () => {
    expect(WORKER).toMatch(/addEventListener\(\s*'fetch'/);
    expect(WORKER).toContain('caches.match');
    expect(WORKER).toMatch(/addEventListener\(\s*'activate'/);
    expect(WORKER).toMatch(/caches\.delete/);
  });

  it('caches the art pack the game loads, which the built HTML never references', () => {
    // Phaser fetches these at boot, so they cannot be found by reading index.html. The worker reads
    // the emitted pack manifest instead — and the pack must be non-empty for that to mean anything.
    expect(ART_MANIFEST.files.length).toBeGreaterThan(0);
    expect(WORKER).toContain('art/pack.json');
    expect(WORKER).toMatch(/pack\??\.files/);
  });

  it('caches the manifest icons so an offline launch has them', () => {
    expect(WORKER).toContain('manifest.webmanifest');
    expect(WORKER).toMatch(/manifest\??\.icons/);
  });
});
