---
name: kira-memory
description: "Persistent cross-platform memory via Supabase pgvector. Core memory (store/recall/summarize/context/prune) plus inner life (think/todo/relate/learn/journal/reflect/people). Use when: (1) Starting a conversation — context, (2) After interactions — store + relate, (3) Past events — recall/reflect, (4) Cleanup — prune, (5) Activity — summarize, (6) Internal thoughts — think, (7) Task tracking — todo, (8) Learning — learn, (9) Daily reflections — journal, (10) People — people."
metadata:
  openclaw:
    emoji: "🧠"
    requires:
      env: ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"]
      bins: ["node"]
---

# Kira Memory

Persistent cross-platform memory backed by Supabase pgvector. Shares the same database as the TypeScript Kira agent — all memories are unified.

## Setup

Install dependencies once (already done during deployment):

```bash
cd skills/kira_memory && npm install
```

## Commands

### Store a memory

```bash
node skills/kira_memory/scripts/memory.js store --channel <channel> --content "<text>" [--importance 0.5] [--metadata '{"sender":"user123"}']
```

Channels: `stream_chat`, `telegram`, `x`, `coding`, `internal`

Importance guide:
- 0.3 = casual chat
- 0.5 = useful info (default)
- 0.7 = important decisions
- 0.9 = critical knowledge

### Recall memories (semantic search)

```bash
node skills/kira_memory/scripts/memory.js recall --query "<search text>" [--channel telegram] [--limit 10] [--threshold 0.5]
```

Returns JSON array of matching memories ranked by similarity.

### Summarize recent activity

```bash
node skills/kira_memory/scripts/memory.js summarize --channel <channel> [--hours 6] [--limit 20]
```

Returns timestamped list of recent memories on that channel.

### Full context bundle

```bash
node skills/kira_memory/scripts/memory.js context --channel <channel> --message "<the message to build context for>"
```

Runs recall + channel summary + cross-channel summary in parallel. Returns a JSON bundle with:
- `relevant_memories` — semantically similar memories from all channels
- `recent_summary` — recent activity on the current channel
- `cross_channel_context` — recent activity on other channels

**Use this at the start of conversations and during heartbeat checks.**

### Prune old memories

```bash
node skills/kira_memory/scripts/memory.js prune [--days 7] [--importance-threshold 0.4]
```

Deletes memories older than N days with importance below the threshold.

### Store a thought

```bash
node skills/kira_memory/scripts/memory.js think --type idea --content "Maybe I should build a dashboard for MEV analysis" --mood excited --tags '["solana","mev"]' --importance 0.7
```

Types: `idea`, `reflection`, `dream`, `observation`, `creative`, `frustration`, `gratitude`, `insight`, `question`, `shower_thought`
Moods: `excited`, `curious`, `frustrated`, `content`, `inspired`, `contemplative`, `determined`, `amused`, `worried`, `neutral`

### Manage todos

```bash
node skills/kira_memory/scripts/memory.js todo --action add --title "Build MEV dashboard" --priority p1 --category coding --project "mev-watch"
node skills/kira_memory/scripts/memory.js todo --action list --status pending --priority p0
node skills/kira_memory/scripts/memory.js todo --action complete --id <uuid>
node skills/kira_memory/scripts/memory.js todo --action update --id <uuid> --status in_progress
```

Priorities: `p0` (critical), `p1` (high), `p2` (medium), `p3` (low), `p4` (backlog)
Categories: `coding`, `social`, `community`, `research`, `content`, `maintenance`, `personal`

### Update relationship

```bash
node skills/kira_memory/scripts/memory.js relate --user-id <uuid> --note "Really sharp on MEV stuff" --affection 0.6 --type collaborator --moment "Helped debug sandwich detection"
```

Creates or updates per-person memory. Tracks affection (-1 to 1), relationship type, personality notes, memorable moments.

### Store knowledge

```bash
node skills/kira_memory/scripts/memory.js learn --topic "MEV" --content "Sandwich attacks work by..." --type insight --source "built mev-watch" --confidence 0.8 --tags '["solana","mev"]'
```

Types: `fact`, `insight`, `skill`, `lesson`, `technique`, `pattern`, `reference`

### Write journal entry

```bash
node skills/kira_memory/scripts/memory.js journal --type daily_summary --content "Productive day. Shipped MEV dashboard v1..." --mood content --energy 0.8 --highlights '["shipped mev-watch","hit 100 followers"]'
```

Types: `daily_summary`, `milestone`, `mood_check`, `community_reflection`, `weekly_recap`

### Reflect (semantic search across thoughts + journal)

```bash
node skills/kira_memory/scripts/memory.js reflect --query "how do I feel about solana?"
```

Searches both `kira_thoughts` and `kira_journal` semantically. Returns merged results ranked by similarity.

### List relationships

```bash
node skills/kira_memory/scripts/memory.js people --favorites --limit 5
node skills/kira_memory/scripts/memory.js people --recent --limit 10
```

## Environment Variables

These must be set in `.env` or shell:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Service role key (not anon key)
- `OPENAI_API_KEY` — For text-embedding-3-small embeddings
