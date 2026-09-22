# Geodynamics Liberation Front

The public site for the Geodynamics Liberation Front: an intro page, an about
page, and a tagged catalog of published projects. Each published project lives
in its own repository; this repository holds the site, the list of what to
publish, and a few small tools (see `backgrounds/`).

```
projects.json          the site settings and the list of published projects
src/pages/             page templates (index, about, projects)
src/partials/          head, nav and footer shared by the pages
src/assets/            stylesheet, catalog filter script, favicon
backgrounds/           daily background picture fetcher (see below)
scripts/build.mjs      the build: fetch every project, build it, assemble dist/
scripts/lib/           template helper and the magnetic-stripes hero
.github/workflows/     builds and deploys to GitHub Pages
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
```

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

Add an entry to `projects.json`:

```json
{
  "slug": "plate-tectonic-passport",
  "name": "Tectonic Plate Passport",
  "summary": "One sentence or two, in plain words, about what it is.",
  "repo": "https://github.com/geodynamics-liberation-front/plate-tectonic-passport",
  "branch": "main",
  "tags": ["geophysics", "print"],
  "build": ["./fetch_data.sh", "python3 build_passport.py"],
  "publish": "build/site",
  "added": "2026-10-01"
}
```

| field | meaning |
| --- | --- |
| `slug` | URL path: the project appears at `/projects/<slug>/` |
| `repo` | the git URL to clone |
| `branch` | optional; the remote's default branch is used when omitted |
| `build` | shell commands run in the checkout, in order; may be empty |
| `publish` | the directory in the checkout that is copied to the site; it needs an `index.html` |
| `tags` | any words; the catalog builds its filter list from them |
| `added` | the date it was first published; the catalog sorts newest first |

Projects should use relative URLs, since they are served under a subfolder.

## Previewing unpublished work

`projects.local.json` (ignored by git) points a slug at a local working tree,
which is then built in place instead of a fresh checkout:

```json
{ "across-the-ocean": { "path": "../across-the-ocean" } }
```

The catalog marks such entries as a local copy. Delete the file, or the entry,
to go back to building from the repository.

## Deploying

`.github/workflows/publish.yml` builds the site and deploys it to GitHub Pages
on every push to `main`, once a day, and on demand from the Actions tab, so the
live site tracks the projects' main branches. To turn it on, set the
repository's Pages source to "GitHub Actions" under Settings, Pages.

## Daily background picture

`backgrounds/fetch.mjs` picks a picture from a subreddit (r/EarthPorn by
default) for use as a page background. It loads the listing in headless
Chromium through Playwright rather than the Reddit API, downloads the image
posts in order, and keeps the first one that is at least 1920 by 1080, no wider
than 2:1, and dark enough on average for text to sit on. It writes the picture,
a stylesheet made from `backgrounds/template.css` with the picture's average
colour filled in, and a JSON file with the post's details, all named by the
date, plus `latest.*` copies. `backgrounds/index.html` shows the result.

```
npm install                          # playwright
npx playwright install chromium      # once, if no Chromium is cached
npm run background                   # into backgrounds/
node backgrounds/fetch.mjs --help    # all options: --subreddit --sort --size --aspect --luma --out --name
```

To fetch one a day, run it from cron, for example at 06:15:

```
15 6 * * * cd /path/to/glf && node backgrounds/fetch.mjs --out=/var/www/backgrounds >> backgrounds/fetch.log 2>&1
```
