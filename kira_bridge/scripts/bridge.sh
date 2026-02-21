#!/usr/bin/env bash
#
# Kira Avatar Bridge CLI — Full integration with avatar pipeline + stream-bridge.
#
# Usage:
#   bridge.sh speak "<text>" [emotion]      — Speak with lip sync + notify dashboard
#   bridge.sh emote <emotion>               — Set emotion on avatar + dashboard
#   bridge.sh action <action>               — Trigger avatar action (nod, shake, etc.)
#   bridge.sh status                        — Check avatar + stream-bridge health
#   bridge.sh session <start|stop>          — Manage LiveKit avatar session
#   bridge.sh voice poll                    — Poll for viewer voice messages (STT)
#   bridge.sh thought "<content>" [type]    — Push thought to dashboard
#   bridge.sh code "<file>" "<lang>" "<content>" — Push code update to dashboard
#   bridge.sh terminal "<command>" "<output>" — Push terminal output to dashboard
#   bridge.sh task "<description>" [status] — Update current task on dashboard
#   bridge.sh repo "<owner/repo>"           — Set current GitHub repo on dashboard
#   bridge.sh chat "<message>"              — Send chat message as Kira
#   bridge.sh read-chat [limit]             — Read recent viewer chat messages
#   bridge.sh dashboard-state               — Get full dashboard state JSON
#
# Env (avatar commands): AVATAR_BRIDGE_URL, AVATAR_BRIDGE_TOKEN
# Env (stream commands): STREAM_BRIDGE_URL (default: http://localhost:8766)

set -euo pipefail

# Avatar bridge env — only required for avatar commands (speak, emote, action, session, voice)
BRIDGE_URL="${AVATAR_BRIDGE_URL:-}"
BRIDGE_TOKEN="${AVATAR_BRIDGE_TOKEN:-}"
STREAM_URL="${STREAM_BRIDGE_URL:-http://localhost:8766}"

command="${1:-}"

if [ -z "$command" ]; then
  echo "Usage: bridge.sh <speak|emote|action|status|session|voice|thought|code|terminal|task|repo|chat|read-chat> [args...]" >&2
  exit 1
fi

# Validate avatar bridge env is set for commands that need it
require_avatar_bridge() {
  if [ -z "$BRIDGE_URL" ]; then
    echo "ERROR: AVATAR_BRIDGE_URL not set (required for $command)" >&2
    exit 1
  fi
  if [ -z "$BRIDGE_TOKEN" ]; then
    echo "ERROR: AVATAR_BRIDGE_TOKEN not set (required for $command)" >&2
    exit 1
  fi
}

# ── API helpers ──────────────────────────────────────

avatar_api() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  local args=(
    -s -f
    --max-time 15
    --connect-timeout 5
    -X "$method"
    -H "Content-Type: application/json"
    -H "Authorization: Bearer $BRIDGE_TOKEN"
  )

  if [ -n "$data" ]; then
    args+=(-d "$data")
  fi

  local response
  if ! response=$(curl "${args[@]}" "${BRIDGE_URL}${endpoint}" 2>&1); then
    echo "ERROR: Avatar Bridge API call failed for ${endpoint}" >&2
    echo "$response" >&2
    return 1
  fi

  echo "$response"
}

stream_api() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  local args=(
    -s -f
    --max-time 5
    --connect-timeout 3
    -X "$method"
    -H "Content-Type: application/json"
  )

  if [ -n "$data" ]; then
    args+=(-d "$data")
  fi

  local response
  if ! response=$(curl "${args[@]}" "${STREAM_URL}${endpoint}" 2>&1); then
    # Stream bridge failures are non-fatal — avatar still works
    echo "WARN: Stream bridge call failed for ${endpoint}" >&2
    return 0
  fi

  echo "$response"
}

# Estimate speech duration in seconds from text length
estimate_speech_seconds() {
  local text="$1"
  local char_count=${#text}
  local words=$((char_count / 5))
  local seconds=$((words * 60 / 150))
  if [ "$seconds" -lt 2 ]; then
    seconds=2
  fi
  echo "$seconds"
}

# ── Commands ─────────────────────────────────────────

case "$command" in
  speak)
    require_avatar_bridge
    text="${2:?Usage: bridge.sh speak \"<text>\" [emotion]}"
    emotion="${3:-neutral}"

    # Send to avatar bridge for TTS + lip sync (fire-and-forget — TTS can take 10-20s)
    avatar_api POST "/api/speak" "{\"text\":\"$text\",\"emotion\":\"$emotion\"}" > /dev/null 2>&1 &

    # Notify stream-bridge dashboard that we're speaking
    stream_api POST "/events" "{\"type\":\"speak\",\"data\":{\"text\":\"$text\",\"emotion\":\"$emotion\"}}" > /dev/null 2>&1 &

    echo "Spoke: \"$text\" (emotion: $emotion)"

    disown -a 2>/dev/null || true  # detach TTS background job
    ;;


  emote)
    require_avatar_bridge
    emotion="${2:?Usage: bridge.sh emote <emotion>}"
    result=$(avatar_api POST "/api/emotion" "{\"emotion\":\"$emotion\"}")

    # Update mood on dashboard
    stream_api PATCH "/state" "{\"mood\":\"$emotion\"}" > /dev/null 2>&1 &

    echo "Emotion set: $emotion"
    echo "$result"
    ;;

  action)
    require_avatar_bridge
    action="${2:?Usage: bridge.sh action <action>}"
    result=$(avatar_api POST "/api/action" "{\"action\":\"$action\"}")
    echo "Action triggered: $action"
    echo "$result"
    ;;

  status)
    if [ -n "$BRIDGE_URL" ]; then
      echo "=== Avatar Bridge Health ==="
      avatar_api GET "/api/health" || echo "(avatar bridge unreachable)"
      echo ""
      echo "=== Avatar Pipeline ==="
      avatar_api GET "/api/pipeline/status" || echo "(pipeline status unavailable)"
      echo ""
    else
      echo "=== Avatar Bridge ==="
      echo "(not configured — AVATAR_BRIDGE_URL not set)"
      echo ""
    fi
    echo "=== Stream Bridge ==="
    stream_api GET "/health" || echo "(stream bridge unreachable)"
    ;;

  session)
    require_avatar_bridge
    action="${2:?Usage: bridge.sh session <start|stop>}"
    case "$action" in
      start)
        echo "Starting avatar session..."
        avatar_api POST "/api/session" '{"action":"start"}'
        echo ""
        echo "Fetching viewer token..."
        avatar_api GET "/api/token"
        ;;
      stop)
        echo "Stopping avatar session..."
        avatar_api POST "/api/session" '{"action":"stop"}'
        ;;
      *)
        echo "Usage: bridge.sh session <start|stop>" >&2
        exit 1
        ;;
    esac
    ;;

  voice)
    require_avatar_bridge
    action="${2:?Usage: bridge.sh voice poll}"
    case "$action" in
      poll)
        avatar_api GET "/api/voice-messages"
        ;;
      *)
        echo "Usage: bridge.sh voice poll" >&2
        exit 1
        ;;
    esac
    ;;

  thought)
    content="${2:?Usage: bridge.sh thought \"<content>\" [type]}"
    thought_type="${3:-reasoning}"
    stream_api POST "/events" "{\"type\":\"thought\",\"data\":{\"content\":\"$content\",\"type\":\"$thought_type\"}}"
    echo "Thought pushed: $content"
    ;;

  code)
    file="${2:?Usage: bridge.sh code \"<file>\" \"<language>\" \"<content>\"}"
    language="${3:?Usage: bridge.sh code \"<file>\" \"<language>\" \"<content>\"}"
    content="${4:?Usage: bridge.sh code \"<file>\" \"<language>\" \"<content>\"}"
    # Escape content for JSON
    escaped_content=$(printf '%s' "$content" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    stream_api POST "/events" "{\"type\":\"code_update\",\"data\":{\"file\":\"$file\",\"language\":\"$language\",\"content\":$escaped_content}}"
    echo "Code update pushed: $file"
    ;;

  terminal)
    cmd="${2:?Usage: bridge.sh terminal \"<command>\" \"<output>\"}"
    output="${3:-}"
    escaped_output=$(printf '%s' "$output" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    stream_api POST "/events" "{\"type\":\"terminal_output\",\"data\":{\"command\":\"$cmd\",\"output\":$escaped_output}}"
    echo "Terminal output pushed"
    ;;

  task)
    description="${2:?Usage: bridge.sh task \"<description>\" [status]}"
    status="${3:-coding}"
    stream_api PATCH "/state" "{\"currentTask\":\"$description\",\"status\":\"$status\"}"
    echo "Task updated: $description ($status)"
    ;;

  repo)
    repo_name="${2:?Usage: bridge.sh repo \"<owner/repo>\"}"
    stream_api POST "/events" "{\"type\":\"repo_switch\",\"data\":{\"repo\":\"$repo_name\"}}"
    echo "Repo set: $repo_name"
    ;;

  chat)
    message="${2:?Usage: bridge.sh chat \"<message>\"}"
    stream_api POST "/chat" "{\"sender\":\"Kira\",\"message\":\"$message\",\"is_kira\":true}"
    echo "Chat sent: $message"
    ;;

  read-chat)
    # Fetch recent chat messages from stream bridge, filter to viewer messages only
    limit="${2:-10}"
    state=$(stream_api GET "/state")
    if [ -z "$state" ]; then
      echo "[]"
    else
      echo "$state" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    messages = data.get('chatMessages', [])
    # Filter to non-Kira messages (viewer messages)
    viewer_msgs = [m for m in messages if not m.get('isKira', False)]
    # Take last N
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    recent = viewer_msgs[-limit:]
    print(json.dumps(recent, indent=2))
except Exception as e:
    print(json.dumps([]))
" "$limit"
    fi
    ;;

  dashboard-state)
    # Fetch the full dashboard state (for debugging or checking what viewers see)
    stream_api GET "/state"
    ;;

  *)
    echo "Unknown command: $command" >&2
    echo "Usage: bridge.sh <speak|emote|action|status|session|voice|thought|code|terminal|task|repo|chat|read-chat|dashboard-state>" >&2
    exit 1
    ;;
esac
