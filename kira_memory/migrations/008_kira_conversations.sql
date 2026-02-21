-- Migration 005: kira_conversations
-- Logs all G↔Kira exchanges for continuity and learning
-- Platform: telegram | x | stream | internal
-- Created: 2026-02-18

CREATE TABLE IF NOT EXISTS kira_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT NOT NULL,        -- groups a conversation thread
  platform        TEXT NOT NULL CHECK (platform IN ('telegram', 'x', 'stream', 'internal', 'discord')),
  message_role    TEXT NOT NULL CHECK (message_role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  author_id       TEXT,                 -- platform user ID
  author_handle   TEXT,                 -- @username or display name
  tweet_id        TEXT,                 -- if platform=x, the tweet ID
  parent_tweet_id TEXT,                 -- if reply thread
  metadata        JSONB DEFAULT '{}',   -- any extra context
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kira_conversations_session_idx  ON kira_conversations (session_id);
CREATE INDEX IF NOT EXISTS kira_conversations_platform_idx ON kira_conversations (platform);
CREATE INDEX IF NOT EXISTS kira_conversations_timestamp_idx ON kira_conversations (timestamp DESC);
CREATE INDEX IF NOT EXISTS kira_conversations_tweet_idx    ON kira_conversations (tweet_id) WHERE tweet_id IS NOT NULL;
