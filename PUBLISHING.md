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

5. **Dependencies are checked, never installed.**
   - A `check` target verifies every prerequisite (tools on the PATH, Python
     packages, minimum versions) and prints one line per missing item saying
     what it is and how to get it, then exits non-zero. `dist` depends on
     `check`, so a build on a machine that lacks something stops before doing
     any work.
   - A build never runs `pip install`, `npm install`, `apt`, `brew` or the
     like. Python packages are listed in `requirements.txt`, Node packages in
     `package.json`, and the README says to install them once. The site build
     machine installs what the README asks for and expects nothing else.
   - Vendored JavaScript (checked in under `html/` or `site/`) and CDN links
     are fine and need no check.

6. **Fetched data is verified.** When the build downloads data:
   - Downloads go into a `sources/` directory (ignored by git) and are
     skipped when the file is already there, so a rebuild does not fetch again.
   - Each download is verified before use: a size or, preferably, a SHA-256
     checksum recorded in the repository (for example in `SHA256SUMS` or in
     the fetch script). A file that fails verification is deleted and the
     build fails, so a truncated download is never processed.
   - Each download is retried a few times and, where the dataset has a
     mirror, fetched from the mirror when the primary source fails.
   - The fetch script names each source, its version, and its licence in the
     README (see the data credits sections of the existing projects).

7. **Failures are loud.** Any missing prerequisite, failed download, failed
   verification or failed processing step stops the build with a non-zero
   exit status and a one-line message on stderr that names what went wrong
   and what to do about it. A build never continues with partial output and
   never writes an incomplete `dist/`: build into `site/` or a temporary
   directory and copy to `dist/` only at the end.

That is the whole contract. The build clones the repository, runs `make dist`
in it, and copies `dist/` to `/projects/<slug>/`.

When a project's build fails, the site build prints the project's slug, the
command and its exit status, keeps that project's previously published copy on
the site, carries on with the other projects, and exits non-zero at the end so
the failure is not missed. Nothing broken reaches the site, but nothing new
does either until the build is fixed.

## Makefile templates

A static project with nothing to generate (everything already lives in
`html/`):

```make
.PHONY: dist check clean serve

dist: check
	rm -rf dist
	cp -r html dist

check:
	@command -v python3 >/dev/null || { echo "python3 is required (for make serve)" >&2; exit 1; }

clean:
	rm -rf dist

serve: dist
	python3 -m http.server 8000 --directory dist
```

A project that downloads and processes data first:

```make
PYTHON ?= python3

.PHONY: dist check data fetch clean serve

dist: data
	rm -rf dist
	cp -r site dist

check:
	@command -v $(PYTHON) >/dev/null || { echo "python3 is required" >&2; exit 1; }
	@command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
	@$(PYTHON) -c 'import numpy, shapefile' 2>/dev/null || { echo "missing Python packages: pip install -r tools/requirements.txt" >&2; exit 1; }

data: check fetch
	$(PYTHON) tools/build_data.py        # writes site/data/; exits non-zero on any problem

fetch: check
	tools/fetch_data.sh                  # downloads into sources/, keeps existing files, verifies checksums

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
the browser console. Also check the failure paths: `make check` on a machine
missing a prerequisite must say what is missing, and a fetch script must fail
when a download is truncated (truncate a file in `sources/` and rebuild). Then confirm that no URL in `dist/` starts with `/`:

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
