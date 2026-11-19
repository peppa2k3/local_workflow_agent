#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

action="${1:-}"
root="${2:-}"
sha="${3:-}"

[[ "$action" == apply && "$root" == /opt/agent-local && "$sha" =~ ^[a-f0-9]{40}$ ]] || {
  echo 'Usage: deploy-container.sh apply /opt/agent-local FULL_COMMIT_SHA' >&2
  exit 1
}

release="$root/releases/$sha"
current="$root/current"
env_file="$root/.env"
compose_file="$release/deploy/docker-compose.source.yml"

[[ -d "$release" && -f "$release/index.js" && -f "$compose_file" ]] || {
  echo "Release source or Compose file is missing: $release" >&2
  exit 1
}
[[ -r "$env_file" ]] || { echo "Deployment env file is missing or unreadable: $env_file" >&2; exit 1; }
[[ -L "$current" || ! -e "$current" ]] || { echo "Refusing to replace non-symlink path: $current" >&2; exit 1; }
if ! docker compose version >/dev/null 2>&1; then
  echo 'Docker Compose v2 is required on the VPS' >&2
  exit 1
fi
command -v curl >/dev/null || { echo 'curl is required to verify the public HTTPS endpoint' >&2; exit 1; }

compose_env="$(APP_SOURCE_ROOT="$release" RELEASE_TAG="$sha" docker compose \
  --project-directory "$root" --env-file "$env_file" -f "$compose_file" config --environment)"
config_value() {
  printf '%s\n' "$compose_env" | sed -n "s/^$1=//p"
}
domain="$(config_value CONTROL_DOMAIN)"
[[ "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || { echo 'Set CONTROL_DOMAIN to the public hostname' >&2; exit 1; }
proxy_mode=host
traefik_network="$(config_value TRAEFIK_NETWORK)"
if [[ -n "$traefik_network" ]]; then
  proxy_mode=traefik
  traefik_container="$(config_value TRAEFIK_CONTAINER)"
  traefik_container="${traefik_container:-traefik}"
  [[ "$traefik_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || { echo 'Invalid TRAEFIK_CONTAINER name' >&2; exit 1; }
  [[ "$(docker inspect --type container --format '{{.State.Running}}' "$traefik_container")" == true ]] || {
    echo "Traefik container '$traefik_container' must be running." >&2
    exit 1
  }
  CONTROL_TRAEFIK_IPS="$(docker inspect --type container "$traefik_container" \
    --format '{{range $name, $net := .NetworkSettings.Networks}}{{println $name $net.IPAddress $net.GlobalIPv6Address}}{{end}}' |
    awk -v network="$traefik_network" '$1 == network {
      for (i = 2; i <= NF; i++) {
        if ($i ~ /^[0-9a-fA-F:.]+$/ && $i ~ /[.:]/) {
          printf "%s%s", separator, $i
          separator = ","
        }
      }
    }')"
  [[ -n "$CONTROL_TRAEFIK_IPS" ]] || { echo "Traefik is not attached to '$traefik_network' with an IP address." >&2; exit 1; }
  export CONTROL_TRAEFIK_IPS TRAEFIK_NETWORK="$traefik_network"
fi
unset compose_env

previous="$(readlink "$current" 2>/dev/null || true)"
if [[ -n "$previous" && "$previous" != "$root/releases/"* ]]; then
  echo "Current symlink points outside managed releases: $previous" >&2
  exit 1
fi
previous_sha="${previous##*/}"
if [[ -n "$previous" && ! "$previous_sha" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Current release directory has an invalid commit name: $previous" >&2
  exit 1
fi
existing_container="$(APP_SOURCE_ROOT="$release" RELEASE_TAG="$sha" docker compose \
  --project-directory "$root" --env-file "$env_file" \
  -f "$compose_file" ps -q control)"
rollback_tag=""
rollback_proxy=host
if [[ -n "$existing_container" ]]; then
  if [[ "$existing_container" == *$'\n'* ]]; then
    echo 'Expected one running control container; refusing deployment.' >&2
    exit 1
  fi
  existing_image="$(docker inspect --format '{{.Image}}' "$existing_container")"
  if [[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$existing_container")" != host ]]; then
    rollback_proxy="$proxy_mode"
  fi
  rollback_tag="rollback-${sha:0:12}"
  docker image tag "$existing_image" "local-agent-control:$rollback_tag"
fi

compose() {
  local source="$1" tag="$2" mode="$3"
  shift 3
  local -a files=(-f "$source/deploy/docker-compose.source.yml")
  if [[ "$mode" == traefik ]]; then
    files+=(-f "$source/deploy/docker-compose.source.traefik.yml")
  fi
  APP_SOURCE_ROOT="$source" RELEASE_TAG="$tag" docker compose \
    --project-directory "$root" --env-file "$env_file" \
    "${files[@]}" "$@"
}

rollback_container() {
  if [[ -n "$previous" && -f "$previous/deploy/docker-compose.source.yml" ]]; then
    if compose "$previous" "$previous_sha" "$rollback_proxy" up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control; then
      echo "Previous container release $previous_sha restored and healthy." >&2
      return 0
    fi
    if compose "$previous" "$previous_sha" "$rollback_proxy" build --pull control &&
      compose "$previous" "$previous_sha" "$rollback_proxy" up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control; then
      echo "Previous container release $previous_sha rebuilt, restored, and healthy." >&2
      return 0
    fi
    echo 'Previous container release could not be restored; inspect Docker logs on the VPS.' >&2
  fi
  if [[ -n "$rollback_tag" ]] &&
    compose "$release" "$rollback_tag" "$rollback_proxy" up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control; then
    echo 'Previously running container image restored and healthy.' >&2
    return 0
  fi
  compose "$release" "$sha" "$proxy_mode" rm --force --stop control >/dev/null 2>&1 || true
  echo 'No earlier container release is available for rollback.' >&2
  return 1
}

compose "$release" "$sha" "$proxy_mode" config --quiet
if ! compose "$release" "$sha" "$proxy_mode" build --pull control; then
  echo "Container build failed for $sha; the running release was not changed." >&2
  exit 1
fi

if ! compose "$release" "$sha" "$proxy_mode" up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control; then
  echo "Container health check failed for $sha; attempting rollback." >&2
  compose "$release" "$sha" "$proxy_mode" logs --no-color --tail=30 control >&2 || true
  rollback_container || true
  exit 1
fi

public_health="https://$domain/health"
echo "Checking $public_health through the public HTTPS proxy."
for attempt in {1..24}; do
  if response="$(curl --silent --show-error --fail --connect-timeout 3 --max-time 5 "$public_health" 2>&1)" &&
    [[ "$response" == '{"ok":true}' ]]; then
    break
  fi
  if (( attempt == 24 )); then
    printf 'Public HTTPS health check failed for %s. Check DNS, the router/entrypoint, and TLS certificate.\n%s\n' "$public_health" "${response:0:200}" >&2
    rollback_container || true
    exit 1
  fi
  sleep 5
done

next="$root/current.next.$sha"
rm -f "$next"
ln -s "$release" "$next"
if ! mv -Tf "$next" "$current"; then
  rm -f "$next"
  echo 'Container is healthy, but the current source symlink could not be updated; attempting rollback.' >&2
  rollback_container || true
  exit 1
fi

if [[ -n "$rollback_tag" ]]; then
  docker image rm "local-agent-control:$rollback_tag" >/dev/null 2>&1 || true
fi
echo "Built and deployed container release $sha; container and public HTTPS health checks passed."
