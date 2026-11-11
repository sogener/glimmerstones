/**
 * Renders the app icons (public/icons/*.png) with the game's own gem code.
 * Needs Playwright with Chromium (dev machine only; the PNGs are committed).
 * Usage: node scripts/make-icons.mjs
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ICONS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-64.png', size: 64 },
];

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.goto(`http://localhost:5199/scripts/icon.html?size=${icon.size}&maskable=${icon.maskable ? 1 : 0}`);
  await page.waitForFunction(() => document.title === 'ready');
  const data = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  writeFileSync(new URL(`../public/icons/${icon.file}`, import.meta.url), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote', icon.file);
}
await browser.close();
await server.close();
