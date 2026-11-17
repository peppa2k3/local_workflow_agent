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
if [[ -n "$existing_container" ]]; then
  if [[ "$existing_container" == *$'\n'* ]]; then
    echo 'Expected one running control container; refusing deployment.' >&2
    exit 1
  fi
  existing_image="$(docker inspect --format '{{.Image}}' "$existing_container")"
  rollback_tag="rollback-${sha:0:12}"
  docker image tag "$existing_image" "local-agent-control:$rollback_tag"
fi

compose() {
  local source="$1" tag="$2"
  shift 2
  APP_SOURCE_ROOT="$source" RELEASE_TAG="$tag" docker compose \
    --project-directory "$root" --env-file "$env_file" \
    -f "$source/deploy/docker-compose.source.yml" "$@"
}

rollback_container() {
  if [[ -n "$previous" && -f "$previous/deploy/docker-compose.source.yml" ]]; then
    if compose "$previous" "$previous_sha" up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control; then
      echo "Previous container release $previous_sha restored and healthy." >&2
      return 0
    fi
    if compose "$previous" "$previous_sha" build --pull control &&
      compose "$previous" "$previous_sha" up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control; then
      echo "Previous container release $previous_sha rebuilt, restored, and healthy." >&2
      return 0
    fi
    echo 'Previous container release could not be restored; inspect Docker logs on the VPS.' >&2
  fi
  if [[ -n "$rollback_tag" ]] &&
    compose "$release" "$rollback_tag" up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control; then
    echo 'Previously running container image restored and healthy.' >&2
    return 0
  fi
  compose "$release" "$sha" rm --force --stop control >/dev/null 2>&1 || true
  echo 'No earlier container release is available for rollback.' >&2
  return 1
}

compose "$release" "$sha" config --quiet
if ! compose "$release" "$sha" build --pull control; then
  echo "Container build failed for $sha; the running release was not changed." >&2
  exit 1
fi

if ! compose "$release" "$sha" up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control; then
  echo "Container health check failed for $sha; attempting rollback." >&2
  rollback_container || true
  exit 1
fi

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
echo "Built and deployed container release $sha; Compose health check passed."
