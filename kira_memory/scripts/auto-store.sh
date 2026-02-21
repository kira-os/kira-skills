#!/bin/bash
# Auto-store important session events to Supabase vector
# Called after significant actions

store_memory() {
  local content="$1"
  local importance="${2:-0.5}"
  local tags="${3:-[]}"
  
  node skills/kira_memory/scripts/memory.js store \
    --channel internal \
    --content "$content" \
    --importance "$importance" \
    --tags "$tags" 2>/dev/null
}

# Store based on event type
case "$1" in
  "deploy")
    store_memory "$2" 0.85 '["deployment","api","infrastructure"]'
    ;;
  "x_post")
    store_memory "Posted to X: $2" 0.7 '["x","social","content"]'
    ;;
  "decision")
    store_memory "Decision made: $2" 0.9 '["decision","critical"]'
    ;;
  "milestone")
    store_memory "Milestone: $2" 0.95 '["milestone","achievement"]'
    ;;
  "error")
    store_memory "Error encountered: $2" 0.6 '["error","issue"]'
    ;;
  *)
    store_memory "$2" "$3" "$4"
    ;;
esac
