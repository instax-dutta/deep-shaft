import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

describe('deployment contracts (file contract)', () => {
  it('every deploy target builds the same production bundle into dist/', () => {
    expect(JSON.parse(read('vercel.json'))).toMatchObject({
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
    });
    const netlify = read('netlify.toml');
    expect(netlify).toContain('command = "npm run build"');
    expect(netlify).toContain('publish = "dist"');
    expect(read('Dockerfile')).toContain('RUN npm run build');
  });

  it('the Docker image serves only the built shell from nginx', () => {
    const dockerfile = read('Dockerfile');
    expect(dockerfile).toContain('FROM node:22-alpine AS build');
    expect(dockerfile).toContain('COPY --from=build /app/dist /usr/share/nginx/html');
    expect(dockerfile).toContain('EXPOSE 8080');
    expect(read('.dockerignore')).toContain('node_modules');
  });

  it('the app shell revalidates while hashed assets cache forever', () => {
    const nginx = read('nginx.conf');
    expect(nginx).toContain('max-age=31536000, immutable');
    expect(nginx).toContain('no-cache');
    expect(nginx).toContain('try_files $uri $uri/ /index.html');
  });

  it('the compose file publishes the container port', () => {
    expect(read('docker-compose.yml')).toContain('8080:8080');
  });

  it('the README documents every supported target', () => {
    const readme = read('README.md');
    for (const target of ['Vercel', 'Netlify', 'Cloudflare Pages', 'GitHub Pages', 'Docker']) {
      expect(readme).toContain(target);
    }
  });

  it('the README names the HTTPS requirement of the offline app shell', () => {
    expect(read('README.md')).toMatch(/HTTPS/i);
  });
});
