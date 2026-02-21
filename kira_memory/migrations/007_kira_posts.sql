-- Migration 004: kira_posts
-- Tracks every post Kira makes on X/Twitter
-- Created: 2026-02-18

CREATE TABLE IF NOT EXISTS kira_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id        TEXT UNIQUE NOT NULL,
  text            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('take', 'link', 'thread', 'reply', 'quote')),
  posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reply_to_id     TEXT,           -- tweet_id this was a reply to
  quote_of_id     TEXT,           -- tweet_id this quoted
  url_context     TEXT,           -- source URL that inspired the post
  likes           INTEGER,
  replies         INTEGER,
  retweets        INTEGER,
  impressions     INTEGER,
  engagement_fetched_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kira_posts_posted_at_idx ON kira_posts (posted_at DESC);
CREATE INDEX IF NOT EXISTS kira_posts_type_idx ON kira_posts (type);
CREATE INDEX IF NOT EXISTS kira_posts_tweet_id_idx ON kira_posts (tweet_id);
