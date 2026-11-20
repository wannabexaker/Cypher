#!/bin/sh
# Deploy Cypher on the Raspberry Pi from origin/main.
#
#   scripts/deploy-pi.sh           light mode (default): ClamAV and the scanner
#                                  stay off, file uploads are refused
#                                  (docs/deploy/RPI-LIGHT.md)
#   scripts/deploy-pi.sh --full    full stack with ClamAV (docs/deploy/RPI.md)
#
# Resets the checkout to origin/main, rebuilds and starts the stack, waits for
# /api/health, prints the deployed version, then reclaims build disk. Works
# from any directory; it acts on the repository it lives in. Needs
# .env.production next to the compose files.

# Everything runs inside main(): the shell parses the whole function before
# executing it, so `git reset` replacing this file mid-run cannot break it.
main() {
  set -eu

  mode=light
  case "${1:-}" in
    "" | --light) mode=light ;;
    --full) mode=full ;;
    -h | --help)
      sed -n '2,12p' "$0"
      return 0
      ;;
    *)
      echo "usage: $0 [--light | --full]" >&2
      return 2
      ;;
  esac

  # Resolve symlinks so a link such as ~/deploy-cypher.sh still finds the repo.
  cd "$(dirname "$(readlink -f "$0")")/.."
  if [ ! -f .env.production ]; then
    echo "missing .env.production in $(pwd)" >&2
    return 1
  fi

  git fetch -q origin
  git reset -q --hard origin/main
  echo "HEAD: $(git log --oneline -1)"

  set -- --env-file .env.production -f docker-compose.prod.yml -f docker-compose.pi.yml
  if [ "$mode" = light ]; then
    set -- "$@" -f docker-compose.pi-light.yml
  fi

  echo "mode: $mode"
  docker compose "$@" up -d --build
  if [ "$mode" = light ]; then
    # A plain `up` never starts the scanner profile, but it does not stop it
    # either: coming from full mode, ClamAV would keep running.
    docker compose "$@" --profile scanner stop clamav scanner >/dev/null 2>&1 || true
  fi

  # The app is published on 127.0.0.1:3001 by docker-compose.pi.yml.
  echo "waiting for /api/health ..."
  tries=0
  until curl -fsS -m 5 http://127.0.0.1:3001/api/health >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 60 ]; then
      echo "app not healthy after 5 minutes:" >&2
      curl -sS -m 5 http://127.0.0.1:3001/api/health >&2 || true
      echo >&2
      return 1
    fi
    sleep 5
  done
  echo "health: $(curl -sS -m 5 http://127.0.0.1:3001/api/health)"
  echo "DEPLOY_OK $(git describe --tags --always) ($mode)"

  # Reclaim disk left behind by the build: dangling image layers and build
  # cache. Never touches running containers, volumes or data.
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f >/dev/null 2>&1 || true
  echo "PRUNED"
}

main "$@"
exit $?
