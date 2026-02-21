-- Migration 005: Post tracking, conversation logging, mention tracking

-- Kira post tracking (all X posts)
CREATE TABLE IF NOT EXISTS kira_posts (
  id BIGSERIAL PRIMARY KEY,
  tweet_id TEXT UNIQUE,
  text TEXT NOT NULL,
  type TEXT DEFAULT 'take',
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  reply_to_id TEXT,
  quote_of_id TEXT,
  url_context TEXT,
  platform TEXT DEFAULT 'x',
  likes INT DEFAULT 0,
  replies INT DEFAULT 0,
  retweets INT DEFAULT 0,
  impressions INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

-- All G<>Kira conversation exchanges
CREATE TABLE IF NOT EXISTS kira_conversations (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT,
  platform TEXT DEFAULT 'telegram',
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sender_id TEXT,
  sender_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- X mention tracking and reply prioritization
CREATE TABLE IF NOT EXISTS kira_mentions (
  id BIGSERIAL PRIMARY KEY,
  tweet_id TEXT UNIQUE NOT NULL,
  author_id TEXT,
  author_username TEXT,
  text TEXT,
  in_reply_to_id TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  priority TEXT DEFAULT 'normal',
  engagement_score INT DEFAULT 0,
  replied_with_id TEXT,
  skipped_reason TEXT,
  processed_at TIMESTAMPTZ
);

ALTER TABLE kira_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kira_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kira_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service_all_posts" ON kira_posts FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_all_conversations" ON kira_conversations FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_all_mentions" ON kira_mentions FOR ALL USING (true);
