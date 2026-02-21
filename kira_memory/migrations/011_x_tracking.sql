-- Migration 011: Comprehensive X Activity Tracking System
-- Tracks every post, reply, image, and engagement on X
-- Created: 2026-02-21

-- Extend kira_posts with tracking fields (add columns if they don't exist)
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS image_prompt TEXT;
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS generation_prompt TEXT;
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS content_type TEXT; -- short_take, observation, question, thread, image_hook, micro_essay
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS format_type TEXT; -- standalone, thread_part, reply
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS thread_id TEXT; -- links tweets in same thread
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS retweets_count INTEGER DEFAULT 0;
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS replies_count INTEGER DEFAULT 0;
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS impressions_count INTEGER DEFAULT 0;
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS engagement_last_checked TIMESTAMPTZ;
ALTER TABLE kira_posts ADD COLUMN IF NOT EXISTS brain_context TEXT; -- which brain files were loaded

-- New: replies tracking (separate from main page posts)
CREATE TABLE IF NOT EXISTS kira_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tweet_id TEXT UNIQUE,
  reply_text TEXT NOT NULL,
  generation_prompt TEXT,
  replied_to_tweet_id TEXT,
  replied_to_author TEXT,
  replied_to_author_followers INTEGER,
  replied_to_text TEXT,
  replied_to_topic TEXT,
  reply_type TEXT DEFAULT 'proactive', -- proactive, thread_continuation, mention_response
  got_liked BOOLEAN DEFAULT FALSE,
  got_replied BOOLEAN DEFAULT FALSE,
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  engagement_last_checked TIMESTAMPTZ,
  url TEXT
);

-- New: image generation tracking
CREATE TABLE IF NOT EXISTS kira_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  file_path TEXT NOT NULL,
  gemini_prompt TEXT,
  style TEXT DEFAULT 'cinematic',
  thinking_level TEXT DEFAULT 'medium',
  score INTEGER, -- 0-10 quality score
  score_critique TEXT,
  used_in_tweet_id TEXT,
  used_in_reply_id TEXT,
  posted BOOLEAN DEFAULT FALSE
);

-- New: engagement snapshots (periodic pulls)
CREATE TABLE IF NOT EXISTS kira_engagement_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  tweet_id TEXT NOT NULL,
  tweet_type TEXT DEFAULT 'post', -- post, reply
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  bookmarks INTEGER DEFAULT 0
);

-- New: threads as units
CREATE TABLE IF NOT EXISTS kira_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  thread_key TEXT UNIQUE, -- e.g. 'wolves-yellowstone-2026-02-21'
  root_tweet_id TEXT,
  tweet_ids TEXT[], -- all tweet IDs in thread
  topic TEXT,
  format TEXT, -- story, micro_essay, multi_image
  total_likes INTEGER DEFAULT 0,
  total_retweets INTEGER DEFAULT 0,
  total_replies INTEGER DEFAULT 0,
  image_paths TEXT[]
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kira_replies_author ON kira_replies(replied_to_author);
CREATE INDEX IF NOT EXISTS idx_kira_replies_created ON kira_replies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kira_images_tweet ON kira_images(used_in_tweet_id);
CREATE INDEX IF NOT EXISTS idx_kira_images_posted ON kira_images(posted);
CREATE INDEX IF NOT EXISTS idx_kira_engagement_tweet ON kira_engagement_snapshots(tweet_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_kira_threads_root ON kira_threads(root_tweet_id);
CREATE INDEX IF NOT EXISTS idx_kira_posts_thread ON kira_posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_kira_posts_content_type ON kira_posts(content_type);
