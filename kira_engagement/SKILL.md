---
name: kira-engagement
description: "Engagement scoring and community prioritization. Use when: (1) Checking who to respond to — use engagement.js priority, (2) Viewing user scores — use engagement.js score, (3) Rating users — use engagement.js rate, (4) Logging engagement events — use engagement.js log, (5) Viewing leaderboard — use engagement.js leaderboard, (6) Linking platform identities — use engagement.js link, (7) Recalculating scores — use engagement.js recalculate."
metadata:
  openclaw:
    emoji: "📊"
    requires:
      env: ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
      bins: ["node"]
---

# Kira Engagement

Track and score community engagement across all platforms. Determines response priority based on a composite score of Telegram activity, X engagement, token holdings, and Kira's subjective affinity.

## Setup

Install dependencies once (already done during deployment):

```bash
cd skills/kira_engagement && npm install
```

## Commands

### Get a user's engagement score

```bash
node skills/kira_engagement/scripts/engagement.js score --user-id <uuid>
```

Returns all engagement metrics and current tier for a specific user.

### Leaderboard

```bash
node skills/kira_engagement/scripts/engagement.js leaderboard --limit 10
```

Shows top engaged users ranked by composite score.

### Rate a user (Kira's subjective opinion)

```bash
node skills/kira_engagement/scripts/engagement.js rate --user-id <uuid> --delta 0.3 --reason "asked a great technical question"
node skills/kira_engagement/scripts/engagement.js rate --user-id <uuid> --delta -0.5 --reason "repeated spam"
```

Adjusts kira_affinity score (clamped to -1.0 to 1.0). Positive delta = Kira likes them more. Negative = less.

### Log an engagement event

```bash
node skills/kira_engagement/scripts/engagement.js log --user-id <uuid> --event telegram_message
node skills/kira_engagement/scripts/engagement.js log --user-id <uuid> --event x_like --points 3
```

Events: `telegram_message` (1pt), `x_like` (3pt), `x_reply` (5pt), `x_repost` (8pt), `kira_upvote` (15pt), `kira_downvote` (-20pt), `token_buy`, `token_sell`

### Recalculate scores

```bash
# Recalculate one user
node skills/kira_engagement/scripts/engagement.js recalculate --user-id <uuid>

# Recalculate all users
node skills/kira_engagement/scripts/engagement.js recalculate
```

### Response priority

```bash
node skills/kira_engagement/scripts/engagement.js priority --platform telegram --limit 10
```

Returns users Kira should prioritize responding to, sorted by composite score.

### Link platform identity

```bash
node skills/kira_engagement/scripts/engagement.js link --user-id <uuid> --platform telegram --platform-id 123456789
```

Links a user's identity across platforms (Telegram ID, X handle, wallet address).

## Scoring Algorithm

### Points Per Event

| Event | Points |
|-------|--------|
| Telegram message | 1 |
| X like on Kira's post | 3 |
| X reply to Kira | 5 |
| X repost of Kira | 8 |
| Token hold (per 1000 $KIRA) | 10 |
| Kira upvote | 15 |
| Kira downvote | -20 |

### Composite Score Weights

- Telegram activity (7d): 20%
- X engagement (7d): 25%
- Token balance: 30%
- Kira affinity: 25%

### Tiers

| Tier | Score | Response |
|------|-------|----------|
| inner_circle | 80-100 | Always respond, detailed |
| champion | 60-79 | Usually respond |
| supporter | 40-59 | Respond when relevant |
| participant | 20-39 | Occasionally respond |
| observer | 0-19 | Rarely respond |

## Environment Variables

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Service role key
- `SOLANA_RPC_URL` — For token balance checks (optional, used during recalculate)
- `KIRA_TOKEN_MINT` — Token mint address (optional, for token balance scoring)
