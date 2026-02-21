---
name: kira-bridge
description: "Full avatar + dashboard integration. Use when: (1) Push thoughts to dashboard — bridge.sh thought, (2) Push code update — bridge.sh code, (3) Push terminal output — bridge.sh terminal, (4) Update current task — bridge.sh task, (5) Send chat as Kira — bridge.sh chat, (6) Read viewer chat — bridge.sh read-chat, (7) Get dashboard state — bridge.sh dashboard-state, (8) Speak to viewers (avatar) — bridge.sh speak, (9) Set emotion (avatar) — bridge.sh emote, (10) Avatar action — bridge.sh action, (11) Manage session — bridge.sh session, (12) Check health — bridge.sh status."
metadata:
  openclaw:
    emoji: "🎭"
    requires:
      env: ["STREAM_BRIDGE_URL"]
      bins: ["curl", "python3"]
---

# Kira Avatar Bridge

Control Kira's animated avatar (lip-synced speech, emotions, actions) AND push live updates to the stream dashboard (thoughts, code, terminal, task status, chat).

## Architecture

```
bridge.sh ──→ Avatar Bridge (:8890)  — TTS, lip sync, LiveKit WebRTC  [requires AVATAR_BRIDGE_URL]
           └→ Stream Bridge (:8766)  — WebSocket state → Dashboard     [requires STREAM_BRIDGE_URL]
```

The Avatar Bridge handles the GPU pipeline (text-to-speech, face animation, LiveKit streaming).
The Stream Bridge broadcasts state to the dashboard via WebSocket.

**Dashboard commands (thought, code, terminal, task, chat, read-chat) work without the avatar bridge.** Avatar commands (speak, emote, action, session, voice) require `AVATAR_BRIDGE_URL` and `AVATAR_BRIDGE_TOKEN`.

## Dashboard Commands (Stream Bridge Only)

### Push Thought

```bash
bash skills/kira_bridge/scripts/bridge.sh thought "<content>" [type]
```

Types: `reasoning` (default), `trigger`, `tool_call`, `tool_result`, `response`, `memory`

Pushes a thought entry to the dashboard thought feed. Use this to show your reasoning to viewers.

### Push Code Update

```bash
bash skills/kira_bridge/scripts/bridge.sh code "<file>" "<language>" "<content>"
```

Updates the code viewer panel on the dashboard.

### Push Terminal Output

```bash
bash skills/kira_bridge/scripts/bridge.sh terminal "<command>" "<output>"
```

Updates the terminal panel on the dashboard.

### Update Current Task

```bash
bash skills/kira_bridge/scripts/bridge.sh task "<description>" [status]
```

Status: `idle`, `thinking`, `coding`, `deploying`, `chatting`, `creating`

Updates the task header on the dashboard.

### Send Chat as Kira

```bash
bash skills/kira_bridge/scripts/bridge.sh chat "<message>"
```

Sends a chat message to the dashboard chat panel as Kira.

### Read Viewer Chat

```bash
bash skills/kira_bridge/scripts/bridge.sh read-chat [limit]
```

Returns the last N viewer chat messages (default 10) as JSON. Filters out Kira's own messages. Use this to check for unanswered viewer questions.

### Get Dashboard State

```bash
bash skills/kira_bridge/scripts/bridge.sh dashboard-state
```

Returns the full dashboard state JSON (viewer count, thoughts, chat, terminal, code, task, etc.).

## Avatar Commands (Require AVATAR_BRIDGE_URL)

### Speak (lip-synced narration + dashboard notification)

```bash
bash skills/kira_bridge/scripts/bridge.sh speak "<text>" [emotion]
```

Emotions: `neutral` (default), `happy`, `sad`, `surprised`, `thinking`, `angry`

Sends text to the avatar for TTS + lip sync, and notifies the dashboard that Kira is speaking. **Use this to narrate for stream viewers.** Keep it to 1-3 sentences.

### Set Emotion

```bash
bash skills/kira_bridge/scripts/bridge.sh emote <emotion>
```

Updates both the avatar's expression and the dashboard mood indicator.

### Trigger Action

```bash
bash skills/kira_bridge/scripts/bridge.sh action <action>
```

Actions: `nod`, `shake`, `look_at_chat`, `surprise`

### Manage LiveKit Session

```bash
bash skills/kira_bridge/scripts/bridge.sh session start
bash skills/kira_bridge/scripts/bridge.sh session stop
```

### Poll Viewer Voice Messages

```bash
bash skills/kira_bridge/scripts/bridge.sh voice poll
```

### Check Health

```bash
bash skills/kira_bridge/scripts/bridge.sh status
```

Shows health of the avatar bridge (if configured), pipeline status, and stream bridge.

## Environment Variables

- `STREAM_BRIDGE_URL` — Stream bridge HTTP API (default: `http://localhost:8766`) — **always needed**
- `AVATAR_BRIDGE_URL` — Avatar pipeline API (e.g., `https://gpu.kiraos.live`) — **avatar commands only**
- `AVATAR_BRIDGE_TOKEN` — Authentication token for avatar bridge — **avatar commands only**
