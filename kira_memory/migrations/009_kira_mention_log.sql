-- Migration 006: kira_mention_log
-- Tracks which mentions were processed, replied to, or skipped (with reason)
-- Created: 2026-02-18

CREATE TABLE IF NOT EXISTS kira_mention_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id        TEXT UNIQUE NOT NULL,
  author_id       TEXT NOT NULL,
  author_handle   TEXT,
  text            TEXT NOT NULL,
  mention_type    TEXT CHECK (mention_type IN ('reply_to_own', 'high_engagement', 'cold')),
  priority_score  FLOAT DEFAULT 0,
  action          TEXT CHECK (action IN ('replied', 'skipped', 'pending')),
  skip_reason     TEXT,                 -- why it was skipped
  reply_tweet_id  TEXT,                 -- our reply tweet_id if replied
  engagement_score FLOAT,              -- from kira_engagement if exists
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kira_mention_log_processed_idx ON kira_mention_log (processed_at DESC);
CREATE INDEX IF NOT EXISTS kira_mention_log_action_idx    ON kira_mention_log (action);
CREATE INDEX IF NOT EXISTS kira_mention_log_author_idx    ON kira_mention_log (author_id);
