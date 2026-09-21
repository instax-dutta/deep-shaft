import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Relative base keeps the static build deployable from any path.
  base: './',
  define: {
    // The app version reaches diagnostics and the boot fallback; the source must not read
    // package.json at runtime.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  test: {
    // Core, data, and platform tests are pure Node. DOM tests opt in per file
    // with a `@vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: false,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  },
});
