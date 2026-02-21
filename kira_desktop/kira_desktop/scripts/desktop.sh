#!/usr/bin/env bash
#
# Kira Desktop Control CLI
#
# Talks to the desktop bridge API (desktop_bridge.py) running inside
# the kira-desktop container on port 9222.
#
# Usage:
#   desktop.sh exec --command "..."
#   desktop.sh screenshot
#   desktop.sh describe [--prompt "..."]
#   desktop.sh type --text "..."
#   desktop.sh click --x <n> --y <n>
#   desktop.sh open-url --url "..."
#   desktop.sh open-file --path "..."
#   desktop.sh tile-windows
#   desktop.sh setup-desktop
#   desktop.sh health
#
# Env: DESKTOP_BRIDGE_URL (default: http://localhost:9222)

set -euo pipefail

BRIDGE_URL="${DESKTOP_BRIDGE_URL:-http://localhost:9222}"

command="${1:-}"

if [ -z "$command" ]; then
  echo "Usage: desktop.sh <exec|screenshot|describe|type|click|open-url|open-file|tile-windows|setup-desktop|health> [args...]" >&2
  exit 1
fi

shift

# Parse named arguments
declare -A args
while [ $# -gt 0 ]; do
  case "$1" in
    --command|--text|--url|--path|--x|--y|--prompt)
      key="${1#--}"
      if [ $# -lt 2 ]; then
        echo "ERROR: $1 requires a value" >&2
        exit 1
      fi
      args["$key"]="$2"
      shift 2
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Helper: POST JSON to bridge, parse response
api_post() {
  local endpoint="$1"
  local data="${2:-{}}"

  local response
  if ! response=$(curl -s -f -X POST \
    -H "Content-Type: application/json" \
    -d "$data" \
    "${BRIDGE_URL}${endpoint}" 2>&1); then
    echo "ERROR: Desktop bridge POST ${endpoint} failed" >&2
    echo "$response" >&2
    exit 1
  fi

  echo "$response"
}

api_get() {
  local endpoint="$1"

  local response
  if ! response=$(curl -s -f "${BRIDGE_URL}${endpoint}" 2>&1); then
    echo "ERROR: Desktop bridge GET ${endpoint} failed" >&2
    echo "$response" >&2
    exit 1
  fi

  echo "$response"
}

# JSON-escape a string
json_escape() {
  printf '%s' "$1" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()), end="")'
}

case "$command" in
  exec)
    cmd="${args[command]:?Usage: desktop.sh exec --command \"...\"}"
    result=$(api_post "/exec" "{\"command\":$(json_escape "$cmd")}")
    echo "Executed: $cmd"
    echo "$result"
    ;;

  screenshot)
    result=$(api_post "/screenshot" "{}")
    echo "Screenshot captured"
    echo "$result"
    ;;

  describe)
    prompt="${args[prompt]:-}"
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    describe_args=()
    if [ -n "$prompt" ]; then
      describe_args+=(--prompt "$prompt")
    fi
    node "$script_dir/describe.js" "${describe_args[@]}"
    ;;

  type)
    text="${args[text]:?Usage: desktop.sh type --text \"...\"}"
    result=$(api_post "/type" "{\"text\":$(json_escape "$text")}")
    echo "Typed: $text"
    echo "$result"
    ;;

  click)
    x="${args[x]:?Usage: desktop.sh click --x <n> --y <n>}"
    y="${args[y]:?Usage: desktop.sh click --x <n> --y <n>}"
    result=$(api_post "/click" "{\"x\":$x,\"y\":$y}")
    echo "Clicked at ($x, $y)"
    echo "$result"
    ;;

  open-url)
    url="${args[url]:?Usage: desktop.sh open-url --url \"...\"}"
    result=$(api_post "/open_url" "{\"url\":$(json_escape "$url")}")
    echo "Opened URL: $url"
    echo "$result"
    ;;

  open-file)
    path="${args[path]:?Usage: desktop.sh open-file --path \"...\"}"
    result=$(api_post "/open_file" "{\"path\":$(json_escape "$path")}")
    echo "Opened file: $path"
    echo "$result"
    ;;

  tile-windows)
    result=$(api_post "/tile_windows" "{}")
    echo "$result"
    ;;

  setup-desktop)
    result=$(api_post "/setup_desktop" "{}")
    echo "$result"
    ;;

  health)
    result=$(api_get "/health")
    echo "$result"
    ;;

  *)
    echo "Unknown command: $command" >&2
    echo "Usage: desktop.sh <exec|screenshot|describe|type|click|open-url|open-file|tile-windows|setup-desktop|health>" >&2
    exit 1
    ;;
esac
