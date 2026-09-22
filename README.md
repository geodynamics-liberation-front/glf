# Geodynamics Liberation Front

The public site for the Geodynamics Liberation Front: an intro page, an about
page, and a tagged catalog of published projects. Each published project lives
in its own repository; this repository holds the site, the list of what to
publish, and a few small tools (see `backgrounds/`).

```
projects.json          the site settings and the list of published projects
src/pages/             page templates (index, about, projects)
src/partials/          head, nav and footer shared by the pages
src/assets/            stylesheet, page scripts, icons, favicon
src/thumbnails/        screenshots for the projects page (scripts/thumbnail.mjs)
backgrounds/           the picture of the day: fetcher and downloaded pictures (see below)
scripts/build.mjs      the build: fetch every project, build it, assemble dist/
scripts/lib/           template helper
scripts/thumbnail.mjs  captures a project screenshot for the projects page
.github/workflows/     builds and deploys to Cloudflare Pages
build/                 checkouts and state, not in git
dist/                  the finished site, not in git
```

## Building

Needs Node 20 or newer and git. Individual projects may need more (Across the
Ocean's data build needs Python 3 with numpy and pyshp, and downloads about
130 MB the first time).

```
npm run build          # fetch, build and publish every project, then the site
npm run serve          # http://localhost:8080/
npm run thumbnails     # screenshot every project into src/thumbnails/ (after a build)
```

The design follows the original 2016 site: the front page is that day's
picture from r/EarthPorn with the mission statement scrolling over it, the
projects page is a grid of screenshots that open into write-ups, and the type
is Quicksand and Roboto.

`scripts/build.mjs` takes a few flags:

| flag | effect |
| --- | --- |
| `--only=slug,slug` | build only these projects; others keep their last output |
| `--offline` | do not fetch; build from the checkouts already in `build/repos/` |
| `--no-projects` | regenerate the site pages only |

The build always checks out the tip of each project's default branch (or the
`branch` given in `projects.json`), so a rebuild picks up whatever was last
pushed. The catalog records the commit each project was built from.

## Publishing a project

Every published project follows the contract in [PUBLISHING.md](PUBLISHING.md):
`make dist` at the repository root produces a self-contained static site in
`dist/`. Point an agent at that file to make a project publishable. Then add
an entry to `projects.json`:

```json
{
  "slug": "plate-tectonic-passport",
  "name": "Tectonic Plate Passport",
  "summary": "One sentence or two, in plain words, about what it is.",
  "repo": "https://github.com/geodynamics-liberation-front/plate-tectonic-passport",
  "branch": "main",
  "tags": ["geophysics", "print"],
  "added": "2026-10-01"
}
```

| field | meaning |
| --- | --- |
| `slug` | URL path: the project appears at `/projects/<slug>/` |
| `repo` | the git URL to clone |
| `branch` | optional; the remote's default branch is used when omitted |
| `build` | optional override of the contract: shell commands run in the checkout instead of `make dist` |
| `publish` | optional override: the directory copied to the site instead of `dist/` |
| `description` | optional paragraphs (HTML allowed) shown when the project's picture is clicked |
| `tags` | any words; the catalog builds its filter list from them |
| `added` | the date it was first published; the catalog sorts newest first |

Projects should use relative URLs, since they are served under a subfolder.
After the first build, run `node scripts/thumbnail.mjs <slug>` to capture its
picture for the projects page and commit `src/thumbnails/<slug>.png`.

## Previewing unpublished work

`projects.local.json` (ignored by git) points a slug at a local working tree,
which is then built in place instead of a fresh checkout:

```json
{ "across-the-ocean": { "path": "../across-the-ocean" } }
```

The catalog marks such entries as a local copy. Delete the file, or the entry,
to go back to building from the repository.

## Hosting

The site is served by Cloudflare Pages at https://therealglf.org, with DNS on
Cloudflare and the domain registered at Namecheap. Cloudflare provides the
certificate (Universal SSL) at no cost and renews it.

### One-time setup

1. Sign in at dash.cloudflare.com and add the site `therealglf.org` on the
   Free plan. Cloudflare scans the existing records and shows two nameservers.
2. At Namecheap, open Domain List, Manage, Nameservers, choose Custom DNS and
   enter the two Cloudflare nameservers. Propagation takes minutes to a few
   hours; Cloudflare emails when the zone is active.
3. Create the Pages project and make the first deployment from this machine:

       npx wrangler@4 login
       npx wrangler@4 pages project create glf --production-branch=main
       npm run build && npm run deploy

   The site is now at https://glf-3lx.pages.dev.
4. In the Pages project, open Custom domains and add `therealglf.org` and
   `www.therealglf.org`. Cloudflare creates the DNS records itself when the
   zone is on Cloudflare; delete the old A record for the university host if
   the scan imported it. Do the same for `therealglf.com` if that domain is
   kept.
5. Pages serves both hostnames over HTTPS and redirects plain HTTP itself.
   To send www (or the .com domain) to the canonical https://therealglf.org,
   add a Redirect Rule for the zone under Rules; a Pages `_redirects` file
   cannot match hostnames.

### The daily publish

The picture of the day is fetched from this machine, since Reddit blocks
requests from cloud addresses, so the daily publish runs here too:

```
npm run publish        # fetch today's picture (if it can), build, deploy
```

It is meant to run every morning on a small always-on Debian machine on the
home network (a Proxmox LXC container), because Reddit blocks cloud addresses.
`publisher/` has a setup script and a systemd service and timer for that:

```
apt install -y curl && curl -fsSL https://raw.githubusercontent.com/geodynamics-liberation-front/glf/main/publisher/setup.sh | bash
```

Then put a Cloudflare API token (Cloudflare Pages: Edit) in
`/etc/glf-publish.env` and run `systemctl start glf-publish.service` once to
check it. The timer runs at 06:15 each day, catches up if the machine was off,
and logs to `journalctl -u glf-publish`. The service pulls this repository's
main branch first, so pushed site changes go live with the next run.

The build publishes the newest 30 days of pictures found in `backgrounds/`
under `/backgrounds/` with an `index.json` the front page reads.

### Deployments from GitHub

`.github/workflows/publish.yml` builds the site on every push and on demand,
which checks that every project still builds from a fresh clone. It deploys
only when the Cloudflare secrets below are set; without them the deploy step
is skipped and the run still passes. Such a deployment carries only the pictures committed
to the repository (the 2016 ones), until the next daily publish from here. It needs two repository secrets under
Settings, Secrets and variables, Actions:

| secret | value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | shown on the right of the zone's Overview page |
| `CLOUDFLARE_API_TOKEN` | a token made at My Profile, API Tokens, with the "Cloudflare Pages: Edit" permission for the account |

`src/_headers` sets caching (project data files are versioned by query string
and cached for a year); the build copies it to `dist/`.

## Daily background picture

`backgrounds/fetch.mjs` picks a picture from a subreddit (r/EarthPorn by
default) for use as a page background. It loads the listing in headless
Chromium through Playwright rather than the Reddit API, downloads the image
posts in order, and keeps the first one that is at least 1920 by 1080, no wider
than 2:1, and dark enough on average for text to sit on. It writes the picture,
a stylesheet made from `backgrounds/template.css` with the picture's average
colour filled in, and a JSON file with the post's details, all named by the
date, plus `latest.*` copies. The front page shows the newest and lets visitors
page back through earlier days; `backgrounds/index.html` is a minimal demo.

```
npm install                          # playwright
npx playwright install chromium      # once, if no Chromium is cached
npm run background                   # into backgrounds/
node backgrounds/fetch.mjs --help    # all options: --subreddit --sort --size --aspect --luma --out --name
```

