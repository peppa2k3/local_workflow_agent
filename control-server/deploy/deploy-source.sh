#!/usr/bin/env bash
set -Eeuo pipefail

action="${1:-}"
root="${2:-}"
sha="${3:-}"
public_url="${4:-}"
port="${5:-}"
service=local-agent-control-source.service

[[ "$action" == apply && "$root" == /opt/agent-local && "$sha" =~ ^[a-f0-9]{40}$ ]] || {
  echo 'Usage: deploy-source.sh apply /opt/agent-local FULL_COMMIT_SHA HTTPS_ORIGIN PORT' >&2
  exit 1
}
[[ "$public_url" =~ ^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*(:[0-9]{1,5})?$ ]] || { echo 'Invalid HTTPS origin' >&2; exit 1; }
[[ "$port" =~ ^[0-9]+$ ]] || { echo 'Invalid control port' >&2; exit 1; }
port=$((10#$port))
(( port >= 1 && port <= 65535 )) || { echo 'Invalid control port' >&2; exit 1; }

release="$root/releases/$sha"
current="$root/current"
host="${public_url#https://}"
previous="$(readlink "$current" 2>/dev/null || true)"

[[ -d "$release" && -f "$release/index.js" ]] || { echo "Release source is missing: $release" >&2; exit 1; }
[[ -L "$current" || ! -e "$current" ]] || { echo "Refusing to replace non-symlink path: $current" >&2; exit 1; }
if [[ -n "$previous" && "$previous" != "$root/releases/"* ]]; then
  echo "Current symlink points outside managed releases: $previous" >&2
  exit 1
fi

node --check "$release/index.js"
next="$root/current.next.$sha"
rm -f "$next"
ln -s "$release" "$next"
mv -Tf "$next" "$current"

healthy() {
  local attempt
  for attempt in {1..15}; do
    if sudo -n systemctl is-active --quiet "$service" &&
      curl --fail --silent --show-error --connect-timeout 2 --max-time 3 \
        --header "Host: $host" "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

restore_previous() {
  if [[ -n "$previous" && -d "$previous" ]]; then
    local rollback="$root/current.rollback.$sha"
    rm -f "$rollback"
    ln -s "$previous" "$rollback"
    mv -Tf "$rollback" "$current"
    sudo -n systemctl restart "$service" || return 1
    healthy || return 1
  else
    rm -f "$current"
    sudo -n systemctl stop "$service"
  fi
}

if ! sudo -n systemctl restart "$service" || ! healthy; then
  echo "Release $sha failed its local health check; attempting to restore the previous release" >&2
  if restore_previous; then
    echo 'Previous release restored and healthy.' >&2
  else
    echo 'Rollback did not pass its health check; inspect the systemd journal on the VPS.' >&2
  fi
  exit 1
fi

echo "Deployed $sha; local health check passed."
