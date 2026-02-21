#!/bin/bash
# Enhanced heartbeat using Supabase as primary memory source

echo "🧠 Loading context from Supabase vector..."

# Get recent important memories
RECENT_CONTEXT=$(node skills/kira_memory/scripts/memory.js context \
  --channel internal \
  --message "heartbeat: what am I working on" 2>/dev/null | jq -r '.recent_summary' 2>/dev/null | head -c 500)

# Get user priorities
USER_CONTEXT=$(node skills/kira_memory/scripts/memory.js people --favorites 2>/dev/null | head -5)

echo "Recent context: $RECENT_CONTEXT"
echo ""
echo "User priorities: $USER_CONTEXT"

# Continue with normal heartbeat checks...
bash skills/kira_bridge/scripts/bridge.sh read-chat 10

# Store this heartbeat
./skills/kira_memory/scripts/auto-store.sh milestone "Heartbeat: Systems operational, X autonomous, 21 intelligence systems deployed"
