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

/** PNG exposes its pixel dimensions in the IHDR chunk: signature (8 bytes), length + type (8), then width, height. */
function pngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const matchesSignature = signature.every((byte, index) => bytes[index] === byte);

  expect(matchesSignature).toBe(true);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
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

      expect(pngSize(bytes)).toEqual({ width, height });
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
});
