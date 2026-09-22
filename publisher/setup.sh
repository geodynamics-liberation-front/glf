#!/usr/bin/env bash
# Set up a Debian machine (a Proxmox LXC container is ideal) to publish
# therealglf.org every morning. Run as root on a fresh Debian 12 or 13:
#
#   apt install -y curl && curl -fsSL https://raw.githubusercontent.com/geodynamics-liberation-front/glf/main/publisher/setup.sh | bash
#
# then put the Cloudflare API token in /etc/glf-publish.env and run
#
#   systemctl start glf-publish.service && journalctl -u glf-publish -f
#
# What it does: installs git, make, Python with numpy and pyshp, Node 22 and
# the Chromium that Playwright needs; creates the glf user; clones the site
# repository to /opt/glf; installs its packages; installs the systemd service
# and timer. Safe to run again.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

REPO=https://github.com/geodynamics-liberation-front/glf.git
DIR=/opt/glf

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q git make curl unzip ca-certificates gnupg python3 python3-numpy python3-pyshp
if ! command -v node >/dev/null || [ "$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')" -lt 20 ]; then
  echo "== Node 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

echo "== user and repository"
id glf >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash glf
if [ ! -d "$DIR/.git" ]; then
  git clone --quiet "$REPO" "$DIR"
  chown -R glf:glf "$DIR"
fi
sudo -u glf -H bash -c "cd '$DIR' && git pull --ff-only --quiet && npm ci --no-audit --no-fund --silent"

echo "== Chromium for Playwright (with its system libraries)"
sudo -u glf -H bash -c "cd '$DIR' && npx playwright install chromium"
(cd "$DIR" && npx playwright install-deps chromium)

echo "== systemd"
install -m 644 "$DIR/publisher/glf-publish.service" /etc/systemd/system/
install -m 644 "$DIR/publisher/glf-publish.timer" /etc/systemd/system/
if [ ! -f /etc/glf-publish.env ]; then
  install -m 600 -o root -g root "$DIR/publisher/glf-publish.env.example" /etc/glf-publish.env
  echo "!! Put the Cloudflare API token in /etc/glf-publish.env"
fi
systemctl daemon-reload
systemctl enable --now glf-publish.timer

echo
echo "done. Next run: $(systemctl list-timers glf-publish.timer --no-legend | awk '{print $1, $2, $3}')"
echo "Test now with: systemctl start glf-publish.service && journalctl -u glf-publish -f"
