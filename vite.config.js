import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base keeps the static build deployable from any path.
  base: './',
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
  },
});
