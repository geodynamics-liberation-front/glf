# Publishing a project on therealglf.org

This is the contract between a Geodynamics Liberation Front project and the
site build. Point an agent at this file when making a project publishable.
The site build in this repository (`scripts/build.mjs`) does the same thing
for every project, so a project needs to follow these rules and nothing else.

## The contract

1. **The project is a git repository** in the geodynamics-liberation-front
   organization on GitHub. The site builds from the tip of its default branch
   (`main`), so only push what is ready to publish.

2. **`make dist` builds the site.** The repository root has a `Makefile` with
   a `dist` target that produces everything the browser needs in a directory
   called `dist/` at the repository root. `dist/` is ignored by git.
   - The target runs from a fresh clone with no arguments and no environment
     variables. It downloads or generates whatever it needs.
   - It is safe to run again: downloads are kept, and a rebuild overwrites
     `dist/` cleanly (`rm -rf dist` first, or equivalent).
   - Prerequisites (Python packages, system tools) are listed in the README.
     Keep them modest; the site build machine has Node, Python 3 with numpy
     and pyshp, make, git and standard Unix tools.
   - `make clean` removes `dist/` and other generated files.

3. **`dist/` is a self-contained static site.**
   - `dist/index.html` is the entry point.
   - All URLs to the project's own files are relative (`js/app.js`,
     `data/coast.bin`, `../` is fine), never absolute (`/js/app.js`), because
     the project is served under `https://therealglf.org/projects/<slug>/`.
   - Third-party libraries may be loaded from a CDN or vendored into `dist/`.
   - No server-side code. Nothing outside `dist/` is published.
   - No single file over 25 MB, and keep the whole of `dist/` under about
     100 MB. Files that the browser only fetches on demand (high-resolution
     data, optional layers) are fine.
   - When data files change, change their URLs too (a version query string or
     a new filename), since the site caches project data for a year.

4. **A README** at the repository root says what the project is, how to run
   it locally, its prerequisites, and its data sources and credits.

That is the whole contract. The build clones the repository, runs `make dist`
in it, and copies `dist/` to `/projects/<slug>/`.

## Makefile templates

A static project with nothing to generate (everything already lives in
`html/`):

```make
.PHONY: dist clean serve

dist:
	rm -rf dist
	cp -r html dist

clean:
	rm -rf dist

serve: dist
	python3 -m http.server 8000 --directory dist
```

A project that downloads and processes data first:

```make
PYTHON ?= python3

.PHONY: dist data fetch clean serve

dist: data
	rm -rf dist
	cp -r site dist

data: fetch
	$(PYTHON) tools/build_data.py        # writes site/data/

fetch:
	tools/fetch_data.sh                  # downloads into sources/, keeps existing files

clean:
	rm -rf dist site/data

serve: dist
	$(PYTHON) -m http.server 8000 --directory dist
```

Add `/dist/` (and any generated directories) to `.gitignore`.

## Checking a project before publishing

From a fresh clone:

```
git clone https://github.com/geodynamics-liberation-front/<slug>.git
cd <slug>
make dist
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000/ and check that everything loads with no 404s in
the browser console. Then confirm that no URL in `dist/` starts with `/`:

```
grep -rn 'src="/\|href="/\|fetch("/\|fetch(`/' dist --include=*.html --include=*.js
```

## Adding the project to the site

In this repository, add an entry to `projects.json`:

```json
{
  "slug": "<slug>",
  "name": "Project Name",
  "summary": "One or two plain sentences saying what it is.",
  "description": ["Optional paragraphs shown on the projects page.", "..."],
  "repo": "https://github.com/geodynamics-liberation-front/<slug>",
  "tags": ["geophysics", "interactive"],
  "added": "2026-10-01"
}
```

`build` and `publish` fields exist for projects that cannot follow the
contract, defaulting to `["make dist"]` and `"dist"`. Do not use them for new
projects.

Then, from this repository:

```
npm run build                          # builds every project, including the new one
node scripts/thumbnail.mjs <slug>      # screenshot for the projects page
npm run build:site && npm run deploy   # publish
git add projects.json src/thumbnails/<slug>.png && git commit && git push
```

Publishing runs daily from Robert's machine (`npm run publish`), so a project
pushed to `main` appears on the site by the next morning.
