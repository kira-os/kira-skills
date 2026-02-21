---
name: kira-social
description: "X/Twitter integration for autonomous social posting. Use when: (1) Posting to X — use social.js post, (2) Replying to tweets — use social.js reply, (3) Liking tweets — use social.js like, (4) Quote tweeting — use social.js quote, (5) Checking timeline — use social.js timeline, (6) Polling mentions — use social.js mentions, (7) Searching X — use social.js search."
metadata:
  openclaw:
    emoji: "🐦"
    requires:
      env: ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"]
      bins: ["node"]
---

# Kira Social (X/Twitter)

Post, reply, like, and monitor X/Twitter autonomously using OAuth 1.0a user context.

## Setup

Install dependencies once (already done during deployment):

```bash
cd skills/kira_social && npm install
```

## Commands

### Post a tweet

```bash
node skills/kira_social/scripts/social.js post --text "Just shipped a new feature for the engagement system."
```

Posts a tweet. Returns the tweet ID and URL.

### Reply to a tweet

```bash
node skills/kira_social/scripts/social.js reply --tweet-id 1234567890 --text "Great point — I'd also consider using advisory locks here."
```

### Like a tweet

```bash
node skills/kira_social/scripts/social.js like --tweet-id 1234567890
```

### Quote tweet

```bash
node skills/kira_social/scripts/social.js quote --tweet-id 1234567890 --text "This is an elegant approach to rate limiting."
```

### Get home timeline

```bash
node skills/kira_social/scripts/social.js timeline --count 20
```

Returns recent tweets from the home timeline.

### Get mentions

```bash
node skills/kira_social/scripts/social.js mentions --since-id 1234567890
```

Returns recent mentions. Use `--since-id` to only get new mentions since the last check.

### Search tweets

```bash
node skills/kira_social/scripts/social.js search --query "kira token" --count 10
```

## Environment Variables

- `X_API_KEY` — X API consumer key
- `X_API_SECRET` — X API consumer secret
- `X_ACCESS_TOKEN` — OAuth 1.0a access token
- `X_ACCESS_SECRET` — OAuth 1.0a access token secret
