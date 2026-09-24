# Geodynamics Liberation Front site: the same make interface as the projects it
# publishes (see PUBLISHING.md).
#
#   make dist        fetch, build and publish every project, then the site, into dist/
#   make site        regenerate only the site pages (projects keep their last output)
#   make check       verify prerequisites (nothing is ever installed by the build)
#   make serve       regenerate the site pages and serve dist/ on http://localhost:8080/
#   make thumbnails  screenshot every project into src/thumbnails/ (after make dist)
#   make background  fetch today's picture into backgrounds/ (does nothing if it exists)
#   make deploy      upload dist/ to Cloudflare Pages
#   make publish     background (if it can), dist, deploy: what the daily job runs
#   make clean       remove dist/ (project checkouts in build/repos are kept)
#
# Each target runs the npm script for the same job in package.json, which the
# publisher service and the GitHub workflow call directly.

PYTHON ?= python3
PORT ?= 8080

.PHONY: dist site check check-packages serve thumbnails background deploy publish clean

dist: check
	npm run -s build

site: check
	npm run -s build:site

check:
	@ok=1; \
	command -v node >/dev/null || { echo "node is required (20 or newer): https://nodejs.org/" >&2; ok=0; }; \
	if command -v node >/dev/null; then \
	  node -e 'process.exit(parseInt(process.versions.node) >= 20 ? 0 : 1)' || { echo "node is too old: 20 or newer is required" >&2; ok=0; }; \
	fi; \
	command -v npm >/dev/null || { echo "npm is required (it comes with node)" >&2; ok=0; }; \
	command -v git >/dev/null || { echo "git is required to fetch the projects" >&2; ok=0; }; \
	[ $$ok = 1 ] || { echo "make check: prerequisites missing, see above" >&2; exit 1; }; \
	echo "prerequisites ok"

# playwright (thumbnails, background) and wrangler (deploy) come from package.json
check-packages: check
	@[ -d node_modules/playwright ] && [ -d node_modules/wrangler ] || { echo "npm packages missing: run npm ci" >&2; exit 1; }

serve: site
	@command -v $(PYTHON) >/dev/null || { echo "python3 is required (for make serve)" >&2; exit 1; }
	$(PYTHON) -m http.server $(PORT) --directory dist

thumbnails: check-packages
	npm run -s thumbnails

background: check-packages
	npm run -s background

deploy: check-packages
	npm run -s deploy

publish: check-packages
	npm run -s publish

clean:
	npm run -s clean
