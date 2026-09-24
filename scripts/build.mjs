#!/usr/bin/env node
// Build the Geodynamics Liberation Front website into dist/.
//
//   node scripts/build.mjs                 fetch, build and publish every project, then the site
//   node scripts/build.mjs --only=a,b      only these project slugs (others keep their last output)
//   node scripts/build.mjs --offline       do not fetch; build from the checkouts already in build/repos
//   node scripts/build.mjs --no-projects   only regenerate the site pages (projects keep their last output)
//
// Every published project is listed in projects.json. Each is checked out at the
// tip of its default branch (or `branch`), its `build` commands are run, and its
// `publish` directory is copied to dist/projects/<slug>/.
//
// projects.local.json (ignored by git) may map a slug to a local working tree:
//   { "across-the-ocean": { "path": "/home/me/work/across-the-ocean" } }
// That tree is then built in place instead of a fresh checkout, for previewing
// work that is not pushed yet. The catalog marks such entries as local.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, render } from './lib/template.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const BUILD = join(ROOT, 'build');
const REPOS = join(BUILD, 'repos');
const DIST = join(ROOT, 'dist');

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }),
);
const only = args.has('only') ? new Set(String(args.get('only')).split(',')) : null;
const offline = args.has('offline');
const noProjects = args.has('no-projects');

const config = JSON.parse(readFileSync(join(ROOT, 'projects.json'), 'utf8'));
const local = existsSync(join(ROOT, 'projects.local.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'projects.local.json'), 'utf8'))
  : {};

const log = (...m) => console.log('[glf]', ...m);

function git(cwd, ...argv) {
  return execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

// Same, but swallows git's stderr (for lookups that may legitimately fail).
function gitQuiet(cwd, ...argv) {
  return execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function defaultBranch(repo) {
  const out = git(ROOT, 'ls-remote', '--symref', repo, 'HEAD');
  const m = out.match(/^ref: refs\/heads\/(\S+)\s+HEAD/m);
  if (!m) throw new Error(`cannot determine default branch of ${repo}`);
  return m[1];
}

// Check out the tip of the project's branch into build/repos/<slug>.
function checkout(p) {
  const dir = join(REPOS, p.slug);
  if (offline) {
    if (!existsSync(dir)) throw new Error(`${p.slug}: --offline but no checkout in ${dir}`);
    log(`${p.slug}: offline, using existing checkout`);
    return dir;
  }
  const branch = p.branch || defaultBranch(p.repo);
  if (!existsSync(join(dir, '.git'))) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(REPOS, { recursive: true });
    log(`${p.slug}: cloning ${p.repo} (${branch})`);
    execFileSync('git', ['clone', '--quiet', '--depth', '1', '--branch', branch, p.repo, dir], { stdio: 'inherit' });
  } else {
    log(`${p.slug}: fetching ${branch}`);
    git(dir, 'remote', 'set-url', 'origin', p.repo);
    git(dir, 'fetch', '--quiet', '--depth', '1', 'origin', branch);
    git(dir, 'reset', '--quiet', '--hard', 'FETCH_HEAD');
    git(dir, 'clean', '-fdq'); // keeps ignored files (downloaded datasets, caches)
  }
  return dir;
}

function describe(dir) {
  try {
    return {
      sha: gitQuiet(dir, 'rev-parse', 'HEAD'),
      short: gitQuiet(dir, 'rev-parse', '--short', 'HEAD'),
      date: gitQuiet(dir, 'log', '-1', '--format=%cI'),
      dirty: gitQuiet(dir, 'status', '--porcelain').length > 0,
    };
  } catch {
    return { sha: '', short: '', date: '', dirty: true };
  }
}

// The contract (PUBLISHING.md): `make dist` produces the site in dist/.
const DEFAULT_BUILD = ['make dist'];
const DEFAULT_PUBLISH = 'dist';

// When this build is started by the site's own make (`make dist`), make's flags
// and command-line variables travel in the environment and would reach every
// project's `make dist` (a `make -i` here would make them ignore their errors).
// Projects are built the same way however the site build was started.
const PROJECT_ENV = { ...process.env };
for (const k of ['MAKEFLAGS', 'MFLAGS', 'MAKELEVEL', 'MAKEOVERRIDES']) delete PROJECT_ENV[k];

function runBuild(p, dir) {
  for (const cmd of p.build || DEFAULT_BUILD) {
    log(`${p.slug}: $ ${cmd}`);
    const r = spawnSync('sh', ['-c', cmd], { cwd: dir, stdio: 'inherit', env: PROJECT_ENV });
    if (r.status !== 0) throw new Error(`${p.slug}: "${cmd}" exited with ${r.status}`);
  }
}

function publish(p, dir) {
  const publishDir = p.publish || DEFAULT_PUBLISH;
  const from = join(dir, publishDir);
  if (!existsSync(from) || !statSync(from).isDirectory())
    throw new Error(`${p.slug}: publish directory ${publishDir} not found`);
  if (!existsSync(join(from, 'index.html'))) throw new Error(`${p.slug}: ${publishDir}/ has no index.html`);
  const to = join(DIST, 'projects', p.slug);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true, dereference: true });
  const n = countFiles(to);
  log(`${p.slug}: published ${n} files to projects/${p.slug}/`);
}

function countFiles(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
  return n;
}

function buildProject(p) {
  const override = local[p.slug];
  let dir, info;
  if (override?.path) {
    dir = resolve(ROOT, override.path);
    log(`${p.slug}: LOCAL override, building in place: ${dir}`);
    info = { ...describe(dir), local: true };
  } else {
    dir = checkout(p);
    info = { ...describe(dir), local: false };
  }
  runBuild(p, dir);
  publish(p, dir);
  return info;
}

// ---- site -----------------------------------------------------------------

function sortedProjects(built) {
  return [...config.projects]
    .map((p) => ({ ...p, build: built[p.slug] || {} }))
    .sort((a, b) => (b.added || '').localeCompare(a.added || '') || a.name.localeCompare(b.name));
}

function tagList(projects) {
  const counts = new Map();
  for (const p of projects) for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// One thumbnail on the projects page: title, picture, link and GitHub icons,
// tags, and the write-up that opens when the picture is clicked.
function projectEntry(p) {
  const href = `/projects/${p.slug}/`;
  const thumb = existsSync(join(SRC, 'thumbnails', `${p.slug}.png`)) ? `/assets/thumbnails/${p.slug}.png` : '';
  const tags = (p.tags || []).map((t) => `<a href="/projects/#${esc(t)}" data-tag="${esc(t)}">${esc(t)}</a>`).join('');
  const b = p.build;
  const built = b.short
    ? `<p class="built">${b.local ? 'Built from a local copy' : `Built from commit <a href="${esc(p.repo)}/commit/${esc(b.sha)}">${esc(b.short)}</a>`}${b.date ? `, ${esc(b.date.slice(0, 10))}` : ''}.</p>`
    : '';
  const paragraphs = (p.description && p.description.length ? p.description : [esc(p.summary)])
    .map((t) => `<p>${t}</p>`)
    .join('\n');
  return `
<div class="thumbnail" id="${esc(p.slug)}" data-tags="${esc((p.tags || []).join(' '))}">
  ${esc(p.name)}
  <img class="thumbnail" src="${thumb}" alt="${esc(p.name)}: click to read about it" tabindex="0" width="240" height="142" loading="lazy">
  <div class="icons">
    <a href="${href}" title="Open ${esc(p.name)}"><img src="/assets/images/link.svg" alt="Open"></a>
    <a href="${esc(p.repo)}" title="Source on GitHub"><img src="/assets/images/github-mark.svg" alt="GitHub"></a>
  </div>
  <div class="tags">${tags}</div>
  <div class="description">
${paragraphs}
${built}
  </div>
</div>`;
}

function latestItem(p) {
  return `<li><a class="name" href="/projects/${esc(p.slug)}/">${esc(p.name)}</a> <span class="summary">${esc(p.summary)}</span></li>`;
}

// Publish the pictures of the day: the newest 30 dated sets from backgrounds/,
// plus an index the front page reads.
function buildBackgrounds() {
  const src = join(ROOT, 'backgrounds');
  const out = join(DIST, 'backgrounds');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const dates = readdirSync(src)
    .filter((f) => /^\d{4}\.\d{2}\.\d{2}\.jpg$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort()
    .reverse()
    .slice(0, 30);
  const days = [];
  for (const d of dates) {
    let meta = {};
    try {
      if (existsSync(join(src, `${d}.json`))) {
        const j = JSON.parse(readFileSync(join(src, `${d}.json`), 'utf8'));
        meta = { title: j.post?.title, author: j.post?.author, permalink: j.post?.permalink, color: j.image?.color };
      }
    } catch (e) {
      console.error(`[glf] backgrounds: bad metadata for ${d}: ${e.message}`);
    }
    cpSync(join(src, `${d}.jpg`), join(out, `${d}.jpg`));
    if (existsSync(join(src, `${d}.css`))) cpSync(join(src, `${d}.css`), join(out, `${d}.css`));
    days.push({
      date: d,
      title: meta.title || '',
      author: meta.author || '',
      permalink: meta.permalink || '',
      color: meta.color || '',
    });
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), days }, null, 2));
  log(`backgrounds: ${days.length} days${days.length ? `, latest ${days[0].date}` : ''}`);
}

// A short hash of everything under src/assets, appended to asset URLs so that
// browsers and the CDN fetch new versions after a change.
function assetVersion() {
  const h = createHash('sha1');
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)))
      e.isDirectory() ? walk(join(dir, e.name)) : h.update(e.name).update(readFileSync(join(dir, e.name)));
  };
  walk(join(SRC, 'assets'));
  return h.digest('hex').slice(0, 10);
}

function buildSite(built) {
  const projects = sortedProjects(built);
  const tags = tagList(projects);
  const vars = {
    site: config.site,
    v: assetVersion(),
    year: String(new Date().getFullYear()),
    socialLinks: config.site.social.map((s) => `<a href="${esc(s.url)}">${esc(s.name)}</a>`).join(''),
    projectCount: String(projects.length),
    projectEntries: projects.map(projectEntry).join('\n'),
    latestList: projects.slice(0, 5).map(latestItem).join('\n'),
    tagFilters: tags
      .map(
        ([t, n]) =>
          `<button type="button" class="tag-filter" data-tag="${esc(t)}" aria-pressed="false">${esc(t)}<span class="tag-count">${n}</span></button>`,
      )
      .join(''),
  };

  mkdirSync(DIST, { recursive: true });
  // 404.html at the root is what Cloudflare Pages serves, with a 404 status, for
  // anything that does not exist; without it every missing file is answered
  // with the front page and a 200, which the cache then keeps for a day.
  const pages = {
    'index.html': 'index.html',
    'about.html': 'about/index.html',
    'projects.html': 'projects/index.html',
    '404.html': '404.html',
  };
  for (const [tpl, out] of Object.entries(pages)) {
    const html = render(readFileSync(join(SRC, 'pages', tpl), 'utf8'), vars, join(SRC, 'partials'));
    mkdirSync(dirname(join(DIST, out)), { recursive: true });
    writeFileSync(join(DIST, out), html);
  }
  rmSync(join(DIST, 'assets'), { recursive: true, force: true });
  cpSync(join(SRC, 'assets'), join(DIST, 'assets'), { recursive: true });
  if (existsSync(join(SRC, 'thumbnails')))
    cpSync(join(SRC, 'thumbnails'), join(DIST, 'assets', 'thumbnails'), { recursive: true });
  if (existsSync(join(SRC, '_headers'))) cpSync(join(SRC, '_headers'), join(DIST, '_headers'));
  writeFileSync(
    join(DIST, 'projects.json'),
    JSON.stringify({ generated: new Date().toISOString(), projects }, null, 2),
  );
  buildBackgrounds();
  log(`site: ${Object.keys(pages).length} pages, ${projects.length} projects, ${tags.length} tags`);
}

// ---- main -----------------------------------------------------------------

mkdirSync(BUILD, { recursive: true });
const statePath = join(BUILD, 'state.json');
const built = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const failures = [];

if (!noProjects) {
  for (const p of config.projects) {
    if (only && !only.has(p.slug)) continue;
    try {
      built[p.slug] = { ...buildProject(p), at: new Date().toISOString() };
    } catch (e) {
      failures.push(p.slug);
      console.error(`[glf] ${p.slug}: FAILED: ${e.message}`);
    }
  }
  writeFileSync(statePath, JSON.stringify(built, null, 2));
}

for (const p of config.projects) {
  if (!existsSync(join(DIST, 'projects', p.slug, 'index.html'))) {
    console.error(`[glf] warning: projects/${p.slug}/ has no index.html in dist (not built yet?)`);
  }
}

buildSite(built);

if (failures.length) {
  console.error(`[glf] ${failures.length} project(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
log(`done: ${DIST}`);
