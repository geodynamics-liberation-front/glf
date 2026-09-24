# Installing the daily publish

The site's front page shows that day's picture from r/EarthPorn. Reddit blocks
requests from cloud addresses, so the picture is fetched, and the site built
and deployed, from a small always-on machine on the home network. This
directory holds everything for that machine:

| file                      | purpose                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `setup.sh`                | one-shot installer for a fresh Debian machine; safe to run again        |
| `glf-publish.service`     | the job: pull this repository, `npm ci`, `make publish`                 |
| `glf-publish.timer`       | runs the service at 06:15 every day, catching up if the machine was off |
| `glf-publish.env.example` | template for `/etc/glf-publish.env`, which holds the Cloudflare token   |

Each run does, as the `glf` user in `/opt/glf`:

1. `git pull --ff-only` of this repository's main branch, so pushed site
   changes go live with the next run.
2. `npm ci`, in case the packages changed.
3. `make publish`, which checks the prerequisites and then fetches today's
   picture (a failure here is ignored and the previous pictures are kept),
   fetches and builds every project and assembles `dist/`, and uploads `dist/`
   to Cloudflare Pages. It is the same as running `make background`,
   `make dist` and `make deploy` in turn.

## 1. Make the machine

Any Debian 12 or 13 machine with root access works. A Proxmox LXC container
is ideal:

- Template: `debian-12-standard` or `debian-13-standard`. Unprivileged is fine.
- Resources: 2 cores, 2 GB of memory, 8 GB of disk. Chromium and the project
  builds are the heavy parts; the checkouts and downloaded datasets under
  `/opt/glf/build/` grow to a few hundred megabytes.
- Network: outbound access to the internet (GitHub, Reddit, NodeSource,
  Cloudflare). No inbound ports are needed.
- Start on boot: yes, so the timer keeps running after a Proxmox restart.

Log in as root and set the time zone. The timer's 06:15 is in the machine's
local time:

```
timedatectl set-timezone America/Los_Angeles
```

## 2. Run the setup script

As root:

```
apt update && apt install -y curl && curl -fsSL https://raw.githubusercontent.com/geodynamics-liberation-front/glf/main/publisher/setup.sh | bash
```

The script:

- installs git, make, Python 3 with numpy and pyshp (Across the Ocean's
  data build needs them), and Node 22 from NodeSource if the machine has no
  Node 20 or newer;
- creates the system user `glf`;
- clones this repository to `/opt/glf` and runs `npm ci`;
- installs the Chromium that Playwright uses, with its system libraries;
- installs the service and timer into `/etc/systemd/system/`, copies the
  environment template to `/etc/glf-publish.env` (mode 600, owned by root)
  if it is not there yet, and enables and starts the timer.

It ends by printing the time of the next run. It takes a few minutes the
first time, mostly downloading Chromium. Running it again updates the
checkout and packages and re-installs the units; it never touches an
existing `/etc/glf-publish.env`.

To review the script before running it, download it first:

```
curl -fsSLO https://raw.githubusercontent.com/geodynamics-liberation-front/glf/main/publisher/setup.sh
less setup.sh
bash setup.sh
```

## 3. Put the Cloudflare token in place

The deploy needs an API token with the "Cloudflare Pages: Edit" permission
for the account:

1. Sign in at dash.cloudflare.com, open My Profile, API Tokens, Create Token.
2. Use the "Custom token" template. Give it one permission: Account,
   Cloudflare Pages, Edit. Limit it to the GLF account. Leave the rest as is.
3. Copy the token. It is shown only once.

Edit `/etc/glf-publish.env` and fill in the token:

```
CLOUDFLARE_ACCOUNT_ID=31a84ddc1e015204f5da51123d3dd06d
CLOUDFLARE_API_TOKEN=<the token>
```

The account ID is already filled in by the template. It is shown on the
right of the zone's Overview page if it ever needs checking.

## 4. Test it

Start the service by hand and watch the log:

```
systemctl start --no-block glf-publish.service && journalctl -u glf-publish -f
```

`--no-block` matters: the service is a oneshot, so without it `systemctl
start` waits for the whole run to finish before the journal is even opened.
The first two steps (pull and `npm ci`) run quietly, so the first lines to
appear are `prerequisites ok` from `make publish`, then the picture fetcher's,
after a few seconds.

The first run is the slow one: every project is cloned and built, and
Across the Ocean downloads about 130 MB of data. The run is done when the
log shows the wrangler upload finishing and the unit going inactive. Then:

- https://therealglf.org shows today's picture (check the date in the
  caption, or open https://therealglf.org/backgrounds/index.json).
- `ls /opt/glf/backgrounds/` has a `YYYY.MM.DD.jpg` for today.

If the picture fetch failed, the run still deploys the site with the pictures
it already has. Look for the fetcher's lines in the log to see why; see
Troubleshooting below.

## 5. Check the timer

```
systemctl list-timers glf-publish.timer
```

shows the next run. The timer fires at 06:15 plus up to 15 minutes of random
delay, and if the machine was off at that time it runs as soon as it is
back up.

## Operating it

| task                | command                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| see the last run    | `journalctl -u glf-publish -n 200`                                                                                                        |
| follow a run        | `journalctl -u glf-publish -f`                                                                                                            |
| publish now         | `systemctl start --no-block glf-publish.service`, then follow the log                                                                     |
| pause the daily run | `systemctl disable --now glf-publish.timer`                                                                                               |
| resume it           | `systemctl enable --now glf-publish.timer`                                                                                                |
| change the time     | `systemctl edit glf-publish.timer`, then set `OnCalendar=` under `[Timer]` (write an empty `OnCalendar=` line first to clear the default) |
| update the machine  | rerun the setup script from step 2                                                                                                        |

Nothing on the machine needs to be updated for ordinary site changes: the
service pulls this repository's main branch before every run. Rerun the setup
script when `setup.sh` itself, the units, or the system dependencies change,
or after a Playwright upgrade in `package.json` (it fetches the matching
Chromium).

Only the machine's local `backgrounds/` holds the pictures fetched since it
was installed; they are ignored by git. The build publishes the newest 30
days of them. If the machine is rebuilt, the site goes back to only the
pictures committed to the repository until new ones accumulate.

## Troubleshooting

**Chromium will not start ("No usable sandbox", "Failed to move to new
namespace").** Some containers cannot run Chromium's sandbox. Uncomment
`GLF_NO_SANDBOX=1` in `/etc/glf-publish.env` and start the service again.

**"blocked; waiting" or "no posts found" from the fetcher.** Reddit is rate
limiting or blocking the page. The fetcher waits and retries, then falls back
to the subreddit's RSS feed. If it still fails, the run keeps the previous
picture and tries again tomorrow. A persistent failure usually means the
machine's address is on a blocked range, or Reddit changed its markup; run
the fetcher by hand to see the details:

```
runuser -u glf -- bash -c 'cd /opt/glf && node backgrounds/fetch.mjs --verbose'
```

**The deploy fails with an authentication error.** The token in
`/etc/glf-publish.env` is missing, wrong, or was made without the Pages Edit
permission. Fix the file; there is no need to restart anything, the service
reads it on every start.

**`git pull` fails and the run stops.** Something edited files in `/opt/glf`
by hand. Discard the changes and run again:

```
runuser -u glf -- bash -c 'cd /opt/glf && git checkout -- . && git pull --ff-only'
```

**A project fails to build.** The log names it, and the run stops before
the deploy, so the live site is left as it was. Fix the project in its own
repository; the next run picks up the push. To publish the other projects in
the meantime, build without the broken one and deploy by hand:

```
set -a; . /etc/glf-publish.env; set +a
runuser -u glf -- bash -c 'cd /opt/glf && node scripts/build.mjs --only=<the other slugs> && make deploy'
```

**The run takes too long.** The service allows two hours. If a run is killed
for exceeding that, the log says so; it is almost always a network problem
during a project's data download.

## Removing it

```
systemctl disable --now glf-publish.timer
rm /etc/systemd/system/glf-publish.service /etc/systemd/system/glf-publish.timer /etc/glf-publish.env
systemctl daemon-reload
userdel -r glf
rm -rf /opt/glf
```
