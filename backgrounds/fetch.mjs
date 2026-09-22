#!/usr/bin/env node
// Fetch a background image from a subreddit without the Reddit API.
//
// Loads the subreddit's page in headless Chromium (Playwright), walks the
// image posts in order, and keeps the first picture that passes the filters:
// large enough, not too wide, and dark enough for text to sit on. Writes
//
//   <name>.jpg    the picture (re-encoded as JPEG when the source is not one)
//   <name>.css    template.css with $color, $luma, $width, $height filled in
//   <name>.json   the post and image details
//
// plus latest.jpg / latest.css / latest.json copies, so a page can always
// point at "latest". <name> defaults to the UTC date, YYYY.MM.DD, as before.
// When all three files for <name> already exist nothing is fetched; --force
// fetches and overwrites them anyway.
//
//   node backgrounds/fetch.mjs                      r/EarthPorn, hot, into backgrounds/
//   node backgrounds/fetch.mjs --subreddit=SpacePorn --sort=top --out=/var/www/bg
//   node backgrounds/fetch.mjs --size=2560x1440 --aspect=21:9 --luma=80 --verbose
//   node backgrounds/fetch.mjs --force              replace today's picture
//
// Needs the playwright package and a Chromium (npx playwright install chromium).
// The browser profile is kept in backgrounds/.profile (ignored by git) so reddit
// sees the same returning browser each day. Chromium's headless user agent is
// replaced by the ordinary Chrome one, since reddit blocks headless browsers on
// sight. If the page is still blocked, the public RSS feed of the subreddit is
// used instead.

import { chromium } from 'playwright';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- options ----------------------------------------------------------------

const defaults = {
  subreddit: 'EarthPorn',
  sort: 'hot',            // hot | new | top | rising
  size: '1920x1080',      // minimum width x height
  aspect: '2:1',          // maximum width:height
  luma: '90',             // maximum average luma, 0..255 (Rec. 709)
  out: HERE,              // output directory
  name: 'YYYY.MM.DD',     // output file stem; YYYY, MM, DD are replaced (UTC)
  template: join(HERE, 'template.css'),
  limit: '40',            // how many posts to consider before giving up
  latest: true,           // also write latest.jpg/css/json
  force: false,           // fetch even when <name>.jpg/css/json already exist
  verbose: false,
  help: false,
};

const opts = { ...defaults };
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--(no-)?([\w-]+)(?:=(.*))?$/);
  if (!m) fail(`unexpected argument ${arg}`);
  const [, no, key, value] = m;
  if (!(key in defaults)) fail(`unknown option --${key}`);
  opts[key] = no ? false : value === undefined ? true : value;
}
if (opts.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}

const OUT = resolve(opts.out);
const STEM = (() => {
  const now = new Date();
  return String(opts.name)
    .replace('YYYY', String(now.getUTCFullYear()))
    .replace('MM', String(now.getUTCMonth() + 1).padStart(2, '0'))
    .replace('DD', String(now.getUTCDate()).padStart(2, '0'));
})();
const [minW, minH] = String(opts.size).split(/\D+/).map(Number);
const [arW, arH] = String(opts.aspect).split(/\D+/).map(Number);
const maxAspect = arW / arH;
const maxLuma = Number(opts.luma);
const limit = Number(opts.limit);
if (!(minW > 0 && minH > 0)) fail(`bad --size ${opts.size}, expected WxH`);
if (!(maxAspect > 0)) fail(`bad --aspect ${opts.aspect}, expected W:H`);
if (!(maxLuma >= 0 && maxLuma <= 255)) fail(`bad --luma ${opts.luma}, expected 0..255`);

const log = (...m) => console.log(...m);
const debug = (...m) => { if (opts.verbose) console.log('  ', ...m); };
function fail(msg) { console.error(`fetch: ${msg}`); process.exit(2); }

// ---- reddit listing -----------------------------------------------------------

const BLOCKED = /blocked by network security|whoa there, pardner|too many requests/i;

async function listPosts(page, context, subreddit, sort, want) {
  const path = sort === 'hot' ? '' : `${sort}/`;
  const url = `https://www.reddit.com/r/${subreddit}/${path}`;
  const pauses = [0, 15000, 45000];
  for (let attempt = 0; attempt < pauses.length; attempt++) {
    if (pauses[attempt]) { log(`blocked; waiting ${pauses[attempt] / 1000}s before trying again`); await page.waitForTimeout(pauses[attempt]); }
    debug(`loading ${url}`);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    debug(`status ${resp?.status()} at ${page.url()}`);
    await page.waitForSelector('shreddit-post', { state: 'attached', timeout: 15000 }).catch(() => {});
    if (await page.$('shreddit-post')) return collectPosts(page, want);
    const text = await page.evaluate(() => document.body?.innerText.slice(0, 400) ?? '');
    debug(`no posts; page says: ${text.replace(/\s+/g, ' ')}`);
    if (!BLOCKED.test(text)) break; // some other page: no point retrying
  }
  log('falling back to the RSS feed');
  return rssPosts(context, subreddit, sort);
}

// The page renders a few posts, hydrates to a screenful a moment later, and
// virtualizes the list as it scrolls. Poll and scroll, collecting by id, until
// we have enough or the list stops growing.
async function collectPosts(page, want) {
  const seen = new Map();
  let idle = 0;
  for (let i = 0; i < 30 && seen.size < want && idle < 5; i++) {
    await page.waitForTimeout(600);
    const batch = await page.$$eval('shreddit-post', els => els.map(e => ({
      id: e.getAttribute('id'),
      title: e.getAttribute('post-title') ?? '',
      url: e.getAttribute('content-href'),
      domain: e.getAttribute('domain'),
      permalink: e.getAttribute('permalink') ? `https://www.reddit.com${e.getAttribute('permalink')}` : '',
      author: e.getAttribute('author'),
      score: Number(e.getAttribute('score')) || 0,
      created: e.getAttribute('created-timestamp') ?? '',
      skip: e.hasAttribute('is-promoted') || e.getAttribute('post-type') === 'ad' || e.getAttribute('post-type') === 'sticky',
    })));
    const before = seen.size;
    for (const p of batch) if (p.id && !seen.has(p.id) && !p.skip) { delete p.skip; seen.set(p.id, p); }
    idle = seen.size > before ? 0 : idle + 1;
    debug(`posts collected: ${seen.size}`);
    if (seen.size < want) await page.mouse.wheel(0, 3000);
  }
  return [...seen.values()];
}

// Fallback: the subreddit's public Atom feed. Each entry carries the title, the
// author, the permalink and, in its HTML content, the link to the picture.
async function rssPosts(context, subreddit, sort) {
  const path = sort === 'hot' ? '' : `${sort}/`;
  const url = `https://www.reddit.com/r/${subreddit}/${path}.rss`;
  debug(`loading ${url}`);
  const resp = await context.request.get(url, { timeout: 45000 });
  if (!resp.ok()) { debug(`feed returned ${resp.status()}`); return []; }
  const xml = await resp.text();
  const unesc = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const posts = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const pick = re => (e.match(re) || [])[1] || '';
    const html = unesc(pick(/<content[^>]*>([\s\S]*?)<\/content>/));
    const link = (html.match(/<a href="([^"]+)">\[link\]<\/a>/) || [])[1] || '';
    posts.push({
      id: pick(/<id>([^<]+)<\/id>/),
      title: unesc(pick(/<title>([^<]*)<\/title>/)),
      url: unesc(link),
      domain: link ? new URL(link).hostname : '',
      permalink: pick(/<link href="([^"]+)"/),
      author: pick(/<name>\/?u\/([^<]+)<\/name>/),
      score: 0,
      created: pick(/<published>([^<]+)<\/published>/),
    });
  }
  return posts.filter(p => p.url);
}

// Turn a post's link into a direct image URL, or null when it is not a single image.
function imageURL(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url, 'https://www.reddit.com'); } catch { return null; }
  const ext = /\.(jpe?g|png|webp)$/i;
  if (u.hostname === 'preview.redd.it') { u.hostname = 'i.redd.it'; u.search = ''; }
  if (u.hostname === 'i.redd.it' || u.hostname === 'i.imgur.com') return ext.test(u.pathname) ? u.href : `${u.origin}${u.pathname}.jpg`;
  if (u.hostname === 'imgur.com' || u.hostname === 'm.imgur.com') {
    if (/^\/(a|gallery|t)\//.test(u.pathname)) return null;
    return `https://i.imgur.com${u.pathname.replace(ext, '')}.jpg`;
  }
  if (u.hostname.endsWith('reddit.com') || u.hostname.endsWith('redd.it')) return null; // galleries, videos, self posts
  return ext.test(u.pathname) ? u.href : null;
}

// ---- image analysis (in the browser, via canvas) --------------------------------

// The evaluate has no timeout of its own, and a renderer that stalls or dies
// while decoding a large image would otherwise hang the run for good.
async function analyze(page, bytes, contentType, wantJPEG) {
  const dataUrl = `data:${contentType};base64,${bytes.toString('base64')}`;
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('analysis timed out after 60s')), 60000); });
  const work = page.evaluate(async ({ dataUrl, wantJPEG }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    // Average colour from a small downscale (drawImage averages the pixels).
    const s = 160 / Math.max(w, h);
    const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, cw, ch);
    const d = ctx.getImageData(0, 0, cw, ch).data;
    let r = 0, g = 0, b = 0; const n = cw * ch;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    let jpeg = null;
    if (wantJPEG) {
      const full = document.createElement('canvas'); full.width = w; full.height = h;
      full.getContext('2d').drawImage(img, 0, 0);
      jpeg = full.toDataURL('image/jpeg', 0.92).split(',')[1];
    }
    return { width: w, height: h, r: r / n, g: g / n, b: b / n, jpeg };
  }, { dataUrl, wantJPEG });
  try { return await Promise.race([work, timeout]); } finally { clearTimeout(timer); }
}

const hex = v => Math.round(v).toString(16).padStart(2, '0');

// ---- main ------------------------------------------------------------------------

if (!opts.force && ['jpg', 'css', 'json'].every(ext => existsSync(join(OUT, `${STEM}.${ext}`)))) {
  log(`${join(OUT, STEM)}.{jpg,css,json} already exist; nothing to do (use --force to replace them)`);
  process.exit(0);
}

const PROFILE = join(HERE, '.profile');
mkdirSync(PROFILE, { recursive: true });
// Containers often have a small /dev/shm, which crashes Chromium's renderer on
// large images unless it keeps its shared memory elsewhere; some cannot run
// Chromium's sandbox at all.
const launchArgs = ['--disable-dev-shm-usage'];
if (process.env.GLF_NO_SANDBOX) launchArgs.push('--no-sandbox');
const launchOpts = { headless: true, viewport: { width: 1440, height: 900 }, args: launchArgs };
let context = await chromium.launchPersistentContext(PROFILE, launchOpts);
// Headless Chromium announces itself as "HeadlessChrome/151.0.7922.34", which
// reddit blocks outright. Relaunch as the same version of ordinary Chrome; the
// context's request client (used for the RSS feed) sends the same user agent.
const headlessUA = await context.pages()[0].evaluate(() => navigator.userAgent);
if (/HeadlessChrome/.test(headlessUA)) {
  await context.close();
  launchOpts.userAgent = headlessUA.replace('HeadlessChrome', 'Chrome');
  debug(`user agent: ${launchOpts.userAgent}`);
  context = await chromium.launchPersistentContext(PROFILE, launchOpts);
}
try {
  const page = context.pages()[0] ?? await context.newPage();
  const posts = await listPosts(page, context, opts.subreddit, opts.sort, limit);
  log(`r/${opts.subreddit}/${opts.sort}: ${posts.length} posts`);
  if (!posts.length) fail('no posts found; reddit may have changed its markup or blocked the request');

  // The listing tab is reddit's whole web app and holds a few hundred MB;
  // let it go before decoding images, which is what needs the memory.
  let canvasPage = await context.newPage();
  await canvasPage.goto('about:blank');
  await page.close();

  let chosen = null;
  let considered = 0;
  for (const post of posts) {
    if (considered >= limit) break;
    const src = imageURL(post.url);
    if (!src) { debug(`skip (not a single image): ${post.url}`); continue; }
    considered++;
    debug(`downloading ${src}`);
    let resp;
    try {
      resp = await context.request.get(src, { headers: { Referer: 'https://www.reddit.com/' }, timeout: 60000, maxRedirects: 5 });
    } catch (e) { debug(`skip (download failed): ${src}: ${e.message}`); continue; }
    const type = (resp.headers()['content-type'] || '').split(';')[0].trim();
    if (!resp.ok() || !type.startsWith('image/')) { debug(`skip (${resp.status()} ${type || 'no type'}): ${src}`); continue; }
    const bytes = await resp.body();
    if (bytes.length > 40 * 1024 * 1024) { debug(`skip (${(bytes.length / 1e6).toFixed(0)} MB, too large): ${src}`); continue; }
    debug(`analyzing ${(bytes.length / 1e6).toFixed(1)} MB ${type}`);

    let a;
    try { a = await analyze(canvasPage, bytes, type, false); }
    catch (e) {
      debug(`skip (undecodable): ${src}: ${e.message}`);
      // A stuck or crashed tab stays that way: replace it before the next image.
      await canvasPage.close().catch(() => {});
      canvasPage = await context.newPage();
      await canvasPage.goto('about:blank');
      continue;
    }
    const luma = 0.2126 * a.r + 0.7152 * a.g + 0.0722 * a.b;
    const aspect = a.width / a.height;
    const reasons = [];
    if (a.width < minW || a.height < minH) reasons.push(`size ${a.width}x${a.height} < ${minW}x${minH}`);
    if (aspect > maxAspect) reasons.push(`aspect ${aspect.toFixed(2)} > ${maxAspect.toFixed(2)}`);
    if (luma > maxLuma) reasons.push(`luma ${luma.toFixed(0)} > ${maxLuma}`);
    if (reasons.length) { debug(`reject ${src}: ${reasons.join(', ')}`); continue; }

    let jpegBytes = bytes;
    if (type !== 'image/jpeg') {
      debug(`re-encoding ${type} as JPEG`);
      jpegBytes = Buffer.from((await analyze(canvasPage, bytes, type, true)).jpeg, 'base64');
    }
    chosen = {
      post,
      image: {
        source: src, content_type: type, width: a.width, height: a.height,
        color: `#${hex(a.r)}${hex(a.g)}${hex(a.b)}`, luma: Math.round(luma * 10) / 10,
      },
      fetched: new Date().toISOString(),
    };
    log(`chose "${post.title}" by u/${post.author}: ${a.width}x${a.height}, luma ${luma.toFixed(0)}, ${chosen.image.color}`);
    debug(post.permalink);
    writeOutput(chosen, jpegBytes);
    break;
  }
  if (!chosen) {
    console.error(`fetch: none of ${considered} image posts passed the filters (size >= ${minW}x${minH}, aspect <= ${opts.aspect}, luma <= ${maxLuma}); try --luma or --size, or run with --verbose`);
    process.exit(1);
  }
} finally {
  await context.close();
}

function writeOutput(chosen, jpegBytes) {
  const stem = STEM, out = OUT;
  mkdirSync(out, { recursive: true });

  const vars = { color: chosen.image.color, luma: String(chosen.image.luma), width: String(chosen.image.width), height: String(chosen.image.height), title: chosen.post.title, author: chosen.post.author };
  const css = existsSync(opts.template)
    ? readFileSync(opts.template, 'utf8').replace(/\$\{?(\w+)\}?/g, (m, k) => (k in vars ? vars[k] : m))
    : `body { background: ${vars.color}; }\n`;

  const files = { jpg: jpegBytes, css, json: JSON.stringify(chosen, null, 2) + '\n' };
  for (const [ext, data] of Object.entries(files)) {
    writeFileSync(join(out, `${stem}.${ext}`), data);
    if (opts.latest) copyFileSync(join(out, `${stem}.${ext}`), join(out, `latest.${ext}`));
  }
  log(`wrote ${join(out, stem)}.{jpg,css,json}${opts.latest ? ' and latest.*' : ''}`);
}
