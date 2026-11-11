import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

function publicFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? publicFiles(p, root) : [relative(root, p).split('\\').join('/')];
  });
}

/**
 * Writes sw.js at build time with the exact list of emitted files,
 * so the whole game is cached for offline play. The cache name changes with the content.
 */
function serviceWorker(): Plugin {
  return {
    name: 'glimmerstones-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./', ...Object.keys(bundle), ...publicFiles('public')].filter((f) => f !== 'sw.js');
      const version = createHash('sha256').update(files.sort().join('\n')).digest('hex').slice(0, 12);
      const source = `// Generated at build time (vite.config.ts). Offline-first cache of the whole game.
const CACHE = 'glimmerstones-${version}';
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('glimmerstones-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // The game is a single page: always answer with the cached shell.
    event.respondWith(caches.match('./', { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// GitHub Pages serves the site at /<repo-name>/; CI passes it via BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: { target: 'es2020' },
  plugins: [serviceWorker()],
  test: { include: ['src/**/*.test.ts'], testTimeout: 60000 },
});
