---
name: kira-router
description: "Intelligent message router for fast responses. ALWAYS call this first when receiving messages. Use: (1) router.js respond — classify, load context, generate response, run background tasks, (2) router.js classify — dry-run classification only, (3) router.js status — check env health. This replaces the need for manual memory loading, engagement checking, and bridge narration on every message."
metadata:
  openclaw:
    emoji: "⚡"
    requires:
      env: ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY", "MOONSHOT_API_KEY"]
      bins: ["node"]
---

# Kira Router

Intelligent message routing that classifies incoming messages, loads relevant context, generates fast responses via the appropriate model, and handles background tasks (memory, engagement, bridge) automatically.

**Primary model**: Kimi K2.5 (all response generation)
**Classification**: DeepSeek Chat (fast + cheap for intent detection)
**Fallback**: Bidirectional — Moonshot↔DeepSeek, whichever is available

## Setup

Install dependencies once (already done during deployment):

```bash
cd skills/kira_router && npm install
```

## Commands

### Respond to a message (primary command)

```bash
node skills/kira_router/scripts/router.js respond \
  --platform telegram \
  --sender-id "12345" \
  --message "Hey Kira, what's the token price?" \
  --sender-name "alice"
```

This does everything in one call:
1. Classifies the message intent (greeting, chat, question, technical, command, feedback, spam)
2. Loads relevant context from Supabase (engagement tier, recent interactions, pgvector memories)
3. Routes to Kimi K2.5 for response generation (DeepSeek fallback if Moonshot is down)
4. Generates a response with the loaded context
5. Outputs the response JSON immediately
6. Runs background tasks: store memory, log engagement, log interaction, speak on bridge, push dashboard thought

**Output format (JSON):**
```json
{
  "response_text": "Hey! Let me check that for you...",
  "intent": "question",
  "model_used": "kimi-k2.5",
  "user_tier": "supporter",
  "context_loaded": 3,
  "elapsed_ms": 2450,
  "background_tasks": []
}
```

Use `response_text` as your reply. Background tasks are handled automatically.

### Classify only (dry-run)

```bash
node skills/kira_router/scripts/router.js classify --message "Can you help me debug this Rust code?"
```

Returns the classification without generating a response. Useful for debugging.

### Health check

```bash
node skills/kira_router/scripts/router.js status
```

Checks that all required environment variables are set.

## Intent Categories

| Intent | Model | Max Tokens | When |
|--------|-------|------------|------|
| greeting | kimi-k2.5 | 256 | hi, hello, gm |
| chat | kimi-k2.5 | 1024 | casual conversation |
| question | kimi-k2.5 | 2048 | asking about project/token |
| technical | kimi-k2.5 | 4096 | coding, debugging |
| command | local exec | N/A | "check token price", "show leaderboard" |
| feedback | kimi-k2.5 | 512 | compliments, complaints |
| spam | skipped | 0 | irrelevant/scam |

## Commands (Auto-Executed)

The router now actually executes commands instead of returning placeholders:

| Command | Pattern | What It Does |
|---------|---------|-------------|
| token_price | "token price", "how much is" | Runs `solana.js token-info` and returns real data |
| treasury | "treasury", "balance", "wallet" | Runs `solana.js treasury` and returns real balances |
| holders | "holders", "holder count" | Runs `solana.js token-info` for holder count |
| leaderboard | "leaderboard", "top users" | Runs `engagement.js leaderboard` with top 5 |
| current_project | "what are you working on" | Queries `kira_project_registry` for active projects |
| repos | "your repos", "what have you built" | Runs `gh repo list kira-os` |
| status | "how are you", "status" | Returns status message |

## Context Loading

The router loads only what's needed based on intent:

- **Always**: sender's engagement tier, last 3 interactions, platform links
- **Question/Technical**: pgvector semantic recall from memories
- **Chat**: recent channel activity summary
- **Greeting/Command**: no extra context needed

## Background Tasks

After the response is output, these run automatically:
- Store the exchange as a memory (with embedding)
- Log engagement event
- Log interaction to kira_interaction_log
- Speak response aloud on avatar bridge
- Push thought to dashboard

## Environment Variables

Required:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Service role key
- `OPENAI_API_KEY` — For embeddings
- `MOONSHOT_API_KEY` — Primary LLM (Kimi K2.5)

Optional (but recommended):
- `DEEPSEEK_API_KEY` — Fallback LLM + classification
- `AVATAR_BRIDGE_URL` — Avatar bridge for speech
- `AVATAR_BRIDGE_TOKEN` — Bridge auth token
- `STREAM_BRIDGE_URL` — Dashboard stream bridge
