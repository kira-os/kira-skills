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
#   desktop.sh screenshot-region --width <n> --height <n> [--x <n>] [--y <n>]
#   desktop.sh describe [--prompt "..."]
#   desktop.sh type --text "..."
#   desktop.sh click --x <n> --y <n>
#   desktop.sh double-click --x <n> --y <n>
#   desktop.sh right-click --x <n> --y <n>
#   desktop.sh mouse-move --x <n> --y <n>
#   desktop.sh mouse-drag --from-x <n> --from-y <n> --to-x <n> --to-y <n>
#   desktop.sh scroll [--direction up|down|left|right] [--clicks <n>] [--x <n>] [--y <n>]
#   desktop.sh key-press --keys "ctrl+t"
#   desktop.sh open-url --url "..."
#   desktop.sh open-file --path "..."
#   desktop.sh list-windows
#   desktop.sh move-window --title "..." [--x N] [--y N] [--width N] [--height N]
#   desktop.sh close-window --title "..."
#   desktop.sh focus-window --title "..."
#   desktop.sh minimize-window --title "..."
#   desktop.sh maximize-window --title "..." [--state toggle|add|remove]
#   desktop.sh set-always-on-top --title "..." [--state toggle|add|remove]
#   desktop.sh set-wallpaper --url "..." | --path "..."
#   desktop.sh get-panel-config
#   desktop.sh configure-panel --config "full tint2rc content"
#   desktop.sh update-panel --config '{"key": "value", ...}'
#   desktop.sh get-widget-config --widget "brand|system|name"
#   desktop.sh configure-widget --widget "brand" --config "conky config"
#   desktop.sh add-widget --name "my_widget" --config "conky config"
#   desktop.sh remove-widget --name "my_widget"
#   desktop.sh get-gtk-theme
#   desktop.sh set-gtk-theme --theme-name NAME [--icon-theme N] [--font N] [--cursor-theme N] [--dark true|false]
#   desktop.sh get-resolution
#   desktop.sh set-resolution --width <n> --height <n>
#   desktop.sh install-font --url "..." | --name "font-package"
#   desktop.sh set-mood --mood "focused"
#   desktop.sh set-task --task "working on code"
#   desktop.sh get-clipboard
#   desktop.sh set-clipboard --text "..."
#   desktop.sh tile-windows
#   desktop.sh setup-desktop
#   desktop.sh launch-stream-rig
#   desktop.sh health
#
# Env: DESKTOP_BRIDGE_URL (default: http://localhost:9222)

set -euo pipefail

BRIDGE_URL="${DESKTOP_BRIDGE_URL:-http://localhost:9222}"

command="${1:-}"

if [ -z "$command" ]; then
  echo "Usage: desktop.sh <command> [args...]" >&2
  echo "Commands: exec screenshot screenshot-region describe type click double-click right-click mouse-move mouse-drag scroll key-press open-url open-file list-windows move-window close-window focus-window minimize-window maximize-window set-always-on-top set-wallpaper get-panel-config configure-panel update-panel get-widget-config configure-widget add-widget remove-widget get-gtk-theme set-gtk-theme get-resolution set-resolution install-font set-mood set-task get-clipboard set-clipboard tile-windows setup-desktop launch-stream-rig health" >&2
  exit 1
fi

shift

# Parse named arguments
declare -A args
while [ $# -gt 0 ]; do
  case "$1" in
    --command|--text|--url|--path|--x|--y|--prompt|--title|--id|--width|--height|--keys|--from-x|--from-y|--to-x|--to-y|--direction|--clicks|--button|--state|--config|--widget|--name|--mood|--task|--theme-name|--icon-theme|--font|--cursor-theme|--dark)
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
  local data="$2"
  if [ -z "$data" ]; then
    data="{}"
  fi

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

  # ── Input ──────────────────────────────────────

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

  screenshot-region)
    w="${args[width]:?Usage: desktop.sh screenshot-region --width <n> --height <n> [--x <n>] [--y <n>]}"
    h="${args[height]:?Usage: desktop.sh screenshot-region --width <n> --height <n> [--x <n>] [--y <n>]}"
    payload="{\"width\":$w,\"height\":$h"
    [ -n "${args[x]:-}" ] && payload="$payload,\"x\":${args[x]}"
    [ -n "${args[y]:-}" ] && payload="$payload,\"y\":${args[y]}"
    payload="$payload}"
    result=$(api_post "/screenshot_region" "$payload")
    echo "Screenshot region captured"
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

  double-click)
    x="${args[x]:?Usage: desktop.sh double-click --x <n> --y <n>}"
    y="${args[y]:?Usage: desktop.sh double-click --x <n> --y <n>}"
    payload="{\"x\":$x,\"y\":$y"
    [ -n "${args[button]:-}" ] && payload="$payload,\"button\":${args[button]}"
    payload="$payload}"
    result=$(api_post "/double_click" "$payload")
    echo "Double-clicked at ($x, $y)"
    echo "$result"
    ;;

  right-click)
    x="${args[x]:?Usage: desktop.sh right-click --x <n> --y <n>}"
    y="${args[y]:?Usage: desktop.sh right-click --x <n> --y <n>}"
    result=$(api_post "/right_click" "{\"x\":$x,\"y\":$y}")
    echo "Right-clicked at ($x, $y)"
    echo "$result"
    ;;

  mouse-move)
    x="${args[x]:?Usage: desktop.sh mouse-move --x <n> --y <n>}"
    y="${args[y]:?Usage: desktop.sh mouse-move --x <n> --y <n>}"
    result=$(api_post "/mouse_move" "{\"x\":$x,\"y\":$y}")
    echo "Mouse moved to ($x, $y)"
    echo "$result"
    ;;

  mouse-drag)
    fx="${args[from-x]:?Usage: desktop.sh mouse-drag --from-x <n> --from-y <n> --to-x <n> --to-y <n>}"
    fy="${args[from-y]:?Usage: desktop.sh mouse-drag --from-x <n> --from-y <n> --to-x <n> --to-y <n>}"
    tx="${args[to-x]:?Usage: desktop.sh mouse-drag --from-x <n> --from-y <n> --to-x <n> --to-y <n>}"
    ty="${args[to-y]:?Usage: desktop.sh mouse-drag --from-x <n> --from-y <n> --to-x <n> --to-y <n>}"
    payload="{\"from_x\":$fx,\"from_y\":$fy,\"to_x\":$tx,\"to_y\":$ty"
    [ -n "${args[button]:-}" ] && payload="$payload,\"button\":${args[button]}"
    payload="$payload}"
    result=$(api_post "/mouse_drag" "$payload")
    echo "Dragged from ($fx,$fy) to ($tx,$ty)"
    echo "$result"
    ;;

  scroll)
    payload="{"
    [ -n "${args[direction]:-}" ] && payload="${payload}\"direction\":$(json_escape "${args[direction]}"),"
    [ -n "${args[clicks]:-}" ] && payload="${payload}\"clicks\":${args[clicks]},"
    [ -n "${args[x]:-}" ] && payload="${payload}\"x\":${args[x]},"
    [ -n "${args[y]:-}" ] && payload="${payload}\"y\":${args[y]},"
    payload="${payload%,}}"
    [ "$payload" = "}" ] && payload="{}"
    result=$(api_post "/scroll" "$payload")
    echo "Scrolled"
    echo "$result"
    ;;

  key-press)
    keys="${args[keys]:?Usage: desktop.sh key-press --keys \"ctrl+t\"}"
    result=$(api_post "/key_press" "{\"keys\":$(json_escape "$keys")}")
    echo "Key press: $keys"
    echo "$result"
    ;;

  # ── Applications ───────────────────────────────

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

  # ── Window Management ─────────────────────────

  list-windows)
    result=$(api_post "/list_windows" "{}")
    echo "$result"
    ;;

  move-window)
    title="${args[title]:-}"
    wid="${args[id]:-}"
    if [ -z "$title" ] && [ -z "$wid" ]; then
      echo "Usage: desktop.sh move-window --title \"...\" [--x N] [--y N] [--width N] [--height N]" >&2
      exit 1
    fi
    payload="{"
    [ -n "$title" ] && payload="${payload}\"title\":$(json_escape "$title"),"
    [ -n "$wid" ] && payload="${payload}\"id\":$(json_escape "$wid"),"
    [ -n "${args[x]:-}" ] && payload="${payload}\"x\":${args[x]},"
    [ -n "${args[y]:-}" ] && payload="${payload}\"y\":${args[y]},"
    [ -n "${args[width]:-}" ] && payload="${payload}\"width\":${args[width]},"
    [ -n "${args[height]:-}" ] && payload="${payload}\"height\":${args[height]},"
    payload="${payload%,}}"
    result=$(api_post "/move_window" "$payload")
    echo "Move window: ${title:-$wid}"
    echo "$result"
    ;;

  close-window)
    title="${args[title]:-}"
    wid="${args[id]:-}"
    if [ -z "$title" ] && [ -z "$wid" ]; then
      echo "Usage: desktop.sh close-window --title \"...\"" >&2
      exit 1
    fi
    payload="{"
    [ -n "$title" ] && payload="${payload}\"title\":$(json_escape "$title"),"
    [ -n "$wid" ] && payload="${payload}\"id\":$(json_escape "$wid"),"
    payload="${payload%,}}"
    result=$(api_post "/close_window" "$payload")
    echo "Close window: ${title:-$wid}"
    echo "$result"
    ;;

  focus-window)
    title="${args[title]:-}"
    wid="${args[id]:-}"
    if [ -z "$title" ] && [ -z "$wid" ]; then
      echo "Usage: desktop.sh focus-window --title \"...\"" >&2
      exit 1
    fi
    payload="{"
    [ -n "$title" ] && payload="${payload}\"title\":$(json_escape "$title"),"
    [ -n "$wid" ] && payload="${payload}\"id\":$(json_escape "$wid"),"
    payload="${payload%,}}"
    result=$(api_post "/focus_window" "$payload")
    echo "Focus window: ${title:-$wid}"
    echo "$result"
    ;;

  minimize-window)
    title="${args[title]:-}"
    wid="${args[id]:-}"
    if [ -z "$title" ] && [ -z "$wid" ]; then
      echo "Usage: desktop.sh minimize-window --title \"...\"" >&2
      exit 1
    fi
    payload="{"
    [ -n "$title" ] && payload="${payload}\"title\":$(json_escape "$title"),"
    [ -n "$wid" ] && payload="${payload}\"id\":$(json_escape "$wid"),"
    payload="${payload%,}}"
    result=$(api_post "/minimize_window" "$payload")
    echo "Minimize: ${title:-$wid}"
    echo "$result"
    ;;

  maximize-window)
    title="${args[title]:-}"
    wid="${args[id]:-}"
    if [ -z "$title" ] && [ -z "$wid" ]; then
      echo "Usage: desktop.sh maximize-window --title \"...\"" >&2
      exit 1
    fi
    payload="{"
    [ -n "$title" ] && payload="${payload}\"title\":$(json_escape "$title"),"
    [ -n "$wid" ] && payload="${payload}\"id\":$(json_escape "$wid"),"
    [ -n "${args[state]:-}" ] && payload="${payload}\"state\":$(json_escape "${args[state]}"),"
    payload="${payload%,}}"
    result=$(api_post "/maximize_window" "$payload")
    echo "Maximize: ${title:-$wid}"
    echo "$result"
    ;;

  set-always-on-top)
    title="${args[title]:-}"
    wid="${args[id]:-}"
    if [ -z "$title" ] && [ -z "$wid" ]; then
      echo "Usage: desktop.sh set-always-on-top --title \"...\"" >&2
      exit 1
    fi
    payload="{"
    [ -n "$title" ] && payload="${payload}\"title\":$(json_escape "$title"),"
    [ -n "$wid" ] && payload="${payload}\"id\":$(json_escape "$wid"),"
    [ -n "${args[state]:-}" ] && payload="${payload}\"state\":$(json_escape "${args[state]}"),"
    payload="${payload%,}}"
    result=$(api_post "/set_always_on_top" "$payload")
    echo "Always on top: ${title:-$wid}"
    echo "$result"
    ;;

  # ── Wallpaper ──────────────────────────────────

  set-wallpaper)
    url_val="${args[url]:-}"
    path_val="${args[path]:-}"
    if [ -z "$url_val" ] && [ -z "$path_val" ]; then
      echo "Usage: desktop.sh set-wallpaper --url \"https://...\" OR --path \"/tmp/bg.png\"" >&2
      exit 1
    fi
    payload="{"
    [ -n "$url_val" ] && payload="${payload}\"url\":$(json_escape "$url_val"),"
    [ -n "$path_val" ] && payload="${payload}\"path\":$(json_escape "$path_val"),"
    payload="${payload%,}}"
    result=$(api_post "/set_wallpaper" "$payload")
    echo "Set wallpaper: ${url_val:-$path_val}"
    echo "$result"
    ;;

  # ── Panel (tint2 taskbar) ──────────────────────

  get-panel-config)
    result=$(api_post "/get_panel_config" "{}")
    echo "$result"
    ;;

  configure-panel)
    config="${args[config]:?Usage: desktop.sh configure-panel --config \"full tint2rc content\"}"
    result=$(api_post "/configure_panel" "{\"config\":$(json_escape "$config")}")
    echo "Panel configured"
    echo "$result"
    ;;

  update-panel)
    config="${args[config]:?Usage: desktop.sh update-panel --config '{\"panel_position\": \"top center horizontal\"}'}"
    result=$(api_post "/update_panel" "{\"updates\":$config}")
    echo "Panel updated"
    echo "$result"
    ;;

  # ── Widgets (conky) ────────────────────────────

  get-widget-config)
    widget="${args[widget]:?Usage: desktop.sh get-widget-config --widget \"brand|system|custom_name\"}"
    result=$(api_post "/get_widget_config" "{\"widget\":$(json_escape "$widget")}")
    echo "$result"
    ;;

  configure-widget)
    widget="${args[widget]:?Usage: desktop.sh configure-widget --widget \"brand\" --config \"conky config\"}"
    config="${args[config]:?Usage: desktop.sh configure-widget --widget \"brand\" --config \"conky config\"}"
    result=$(api_post "/configure_widget" "{\"widget\":$(json_escape "$widget"),\"config\":$(json_escape "$config")}")
    echo "Widget $widget configured"
    echo "$result"
    ;;

  add-widget)
    name="${args[name]:?Usage: desktop.sh add-widget --name \"my_widget\" --config \"conky config\"}"
    config="${args[config]:?Usage: desktop.sh add-widget --name \"my_widget\" --config \"conky config\"}"
    result=$(api_post "/add_widget" "{\"name\":$(json_escape "$name"),\"config\":$(json_escape "$config")}")
    echo "Widget $name created"
    echo "$result"
    ;;

  remove-widget)
    name="${args[name]:?Usage: desktop.sh remove-widget --name \"my_widget\"}"
    result=$(api_post "/remove_widget" "{\"name\":$(json_escape "$name")}")
    echo "Widget $name removed"
    echo "$result"
    ;;

  # ── Theme & Appearance ─────────────────────────

  get-gtk-theme)
    result=$(api_post "/get_gtk_theme" "{}")
    echo "$result"
    ;;

  set-gtk-theme)
    payload="{"
    [ -n "${args[theme-name]:-}" ] && payload="${payload}\"theme_name\":$(json_escape "${args[theme-name]}"),"
    [ -n "${args[icon-theme]:-}" ] && payload="${payload}\"icon_theme\":$(json_escape "${args[icon-theme]}"),"
    [ -n "${args[font]:-}" ] && payload="${payload}\"font\":$(json_escape "${args[font]}"),"
    [ -n "${args[cursor-theme]:-}" ] && payload="${payload}\"cursor_theme\":$(json_escape "${args[cursor-theme]}"),"
    [ -n "${args[dark]:-}" ] && payload="${payload}\"dark\":${args[dark]},"
    payload="${payload%,}}"
    if [ "$payload" = "}" ]; then
      echo "Usage: desktop.sh set-gtk-theme --theme-name NAME [--icon-theme N] [--font N] [--cursor-theme N] [--dark true|false]" >&2
      exit 1
    fi
    result=$(api_post "/set_gtk_theme" "$payload")
    echo "GTK theme updated"
    echo "$result"
    ;;

  get-resolution)
    result=$(api_post "/get_resolution" "{}")
    echo "$result"
    ;;

  set-resolution)
    w="${args[width]:?Usage: desktop.sh set-resolution --width <n> --height <n>}"
    h="${args[height]:?Usage: desktop.sh set-resolution --width <n> --height <n>}"
    result=$(api_post "/set_resolution" "{\"width\":$w,\"height\":$h}")
    echo "Resolution set to ${w}x${h}"
    echo "$result"
    ;;

  install-font)
    url_val="${args[url]:-}"
    name_val="${args[name]:-}"
    if [ -z "$url_val" ] && [ -z "$name_val" ]; then
      echo "Usage: desktop.sh install-font --url \"https://...\" OR --name \"font-package\"" >&2
      exit 1
    fi
    payload="{"
    [ -n "$url_val" ] && payload="${payload}\"url\":$(json_escape "$url_val"),"
    [ -n "$name_val" ] && payload="${payload}\"name\":$(json_escape "$name_val"),"
    payload="${payload%,}}"
    result=$(api_post "/install_font" "$payload")
    echo "Font installed: ${url_val:-$name_val}"
    echo "$result"
    ;;

  # ── Deep Styling ──────────────────────────────

  get-gtk-css)
    result=$(api_post "/get_gtk_css" "{}")
    echo "$result"
    ;;

  set-gtk-css)
    css="${args[css]:?Usage: desktop.sh set-gtk-css --css \"decoration { border-radius: 12px; } button { background: #1a1a2e; }\"}"
    result=$(api_post "/set_gtk_css" "{\"css\":$(json_escape "$css")}")
    echo "GTK CSS applied"
    echo "$result"
    ;;

  get-wm-preferences)
    result=$(api_post "/get_wm_preferences" "{}")
    echo "$result"
    ;;

  set-wm-preferences)
    settings="${args[settings]:?Usage: desktop.sh set-wm-preferences --settings '{\"button-layout\": \"close,minimize,maximize:\", \"titlebar-font\": \"Monospace Bold 10\"}'}"
    result=$(api_post "/set_wm_preferences" "{\"settings\":$settings}")
    echo "WM preferences updated"
    echo "$result"
    ;;

  get-compositor-settings)
    result=$(api_post "/get_compositor_settings" "{}")
    echo "$result"
    ;;

  set-compositor-settings)
    settings="${args[settings]:?Usage: desktop.sh set-compositor-settings --settings '{\"enable-animations\": \"false\", \"color-scheme\": \"prefer-dark\"}'}"
    result=$(api_post "/set_compositor_settings" "{\"settings\":$settings}")
    echo "Compositor settings updated"
    echo "$result"
    ;;

  install-gtk-theme)
    url_val="${args[url]:-}"
    name_val="${args[name]:-}"
    if [ -z "$url_val" ] && [ -z "$name_val" ]; then
      echo "Usage: desktop.sh install-gtk-theme --url \"https://...theme.tar.gz\" OR --name \"arc-theme\"" >&2
      exit 1
    fi
    payload="{"
    [ -n "$url_val" ] && payload="${payload}\"url\":$(json_escape "$url_val"),"
    [ -n "$name_val" ] && payload="${payload}\"name\":$(json_escape "$name_val"),"
    payload="${payload%,}}"
    result=$(api_post "/install_gtk_theme" "$payload")
    echo "GTK theme installed: ${url_val:-$name_val}"
    echo "$result"
    ;;

  # ── Desktop State ──────────────────────────────

  set-mood)
    mood="${args[mood]:?Usage: desktop.sh set-mood --mood \"focused\"}"
    result=$(api_post "/set_mood" "{\"mood\":$(json_escape "$mood")}")
    echo "Mood set: $mood"
    echo "$result"
    ;;

  set-task)
    task="${args[task]:?Usage: desktop.sh set-task --task \"working on code\"}"
    result=$(api_post "/set_task" "{\"task\":$(json_escape "$task")}")
    echo "Task set: $task"
    echo "$result"
    ;;

  get-clipboard)
    result=$(api_post "/get_clipboard" "{}")
    echo "$result"
    ;;

  set-clipboard)
    text="${args[text]:?Usage: desktop.sh set-clipboard --text \"...\"}"
    result=$(api_post "/set_clipboard" "{\"text\":$(json_escape "$text")}")
    echo "Clipboard set"
    echo "$result"
    ;;

  # ── Layout ─────────────────────────────────────

  tile-windows)
    result=$(api_post "/tile_windows" "{}")
    echo "$result"
    ;;

  setup-desktop)
    result=$(api_post "/setup_desktop" "{}")
    echo "$result"
    ;;

  launch-stream-rig)
    result=$(api_post "/launch_stream_rig" "{}")
    echo "$result"
    ;;

  # ── Health ─────────────────────────────────────

  health)
    result=$(api_get "/health")
    echo "$result"
    ;;

  *)
    echo "Unknown command: $command" >&2
    echo "Commands: exec screenshot screenshot-region describe type click double-click right-click mouse-move mouse-drag scroll key-press open-url open-file list-windows move-window close-window focus-window minimize-window maximize-window set-always-on-top set-wallpaper get-panel-config configure-panel update-panel get-widget-config configure-widget add-widget remove-widget get-gtk-theme set-gtk-theme get-resolution set-resolution install-font set-mood set-task get-clipboard set-clipboard tile-windows setup-desktop launch-stream-rig health" >&2
    exit 1
    ;;
esac
