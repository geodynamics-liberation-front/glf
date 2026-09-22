#!/usr/bin/env node
// Capture a 960x568 screenshot of a built project for the projects page.
//
//   node scripts/thumbnail.mjs across-the-ocean [more slugs]   (or --all)
//
// Serves dist/ on a local port, opens /projects/<slug>/ in headless Chromium
// and writes src/thumbnails/<slug>.png. Run after `npm run build`.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'src', 'thumbnails');
const config = JSON.parse(readFileSync(join(ROOT, 'projects.json'), 'utf8'));

const args = process.argv.slice(2);
const slugs = args.includes('--all') ? config.projects.map(p => p.slug) : args.filter(a => !a.startsWith('--'));
if (!slugs.length) { console.error('usage: node scripts/thumbnail.mjs <slug>... | --all'); process.exit(2); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 568 }, deviceScaleFactor: 1 });
  for (const slug of slugs) {
    const url = `http://127.0.0.1:${port}/projects/${slug}/`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1500);
    const file = join(OUT, `${slug}.png`);
    await page.screenshot({ path: file });
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
  server.close();
}
