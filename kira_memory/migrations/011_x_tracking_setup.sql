-- SQL Setup for X Tracking System
-- Run this in Supabase Studio SQL Editor

-- 1. First, create the exec_sql helper function (enables programmatic migrations)
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add new columns to kira_posts
ALTER TABLE kira_posts 
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS image_prompt TEXT,
  ADD COLUMN IF NOT EXISTS generation_prompt TEXT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS format_type TEXT,
  ADD COLUMN IF NOT EXISTS thread_id TEXT,
  ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retweets_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replies_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_last_checked TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brain_context TEXT;

-- 3. Create kira_replies table
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
  reply_type TEXT DEFAULT 'proactive',
  got_liked BOOLEAN DEFAULT FALSE,
  got_replied BOOLEAN DEFAULT FALSE,
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  engagement_last_checked TIMESTAMPTZ,
  url TEXT
);

-- 4. Create kira_images table
CREATE TABLE IF NOT EXISTS kira_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  file_path TEXT NOT NULL,
  gemini_prompt TEXT,
  style TEXT DEFAULT 'cinematic',
  thinking_level TEXT DEFAULT 'medium',
  score INTEGER,
  score_critique TEXT,
  used_in_tweet_id TEXT,
  used_in_reply_id TEXT,
  posted BOOLEAN DEFAULT FALSE
);

-- 5. Create kira_engagement_snapshots table
CREATE TABLE IF NOT EXISTS kira_engagement_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  tweet_id TEXT NOT NULL,
  tweet_type TEXT DEFAULT 'post',
  likes INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  bookmarks INTEGER DEFAULT 0
);

-- 6. Create kira_threads table
CREATE TABLE IF NOT EXISTS kira_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  thread_key TEXT UNIQUE,
  root_tweet_id TEXT,
  tweet_ids TEXT[],
  topic TEXT,
  format TEXT,
  total_likes INTEGER DEFAULT 0,
  total_retweets INTEGER DEFAULT 0,
  total_replies INTEGER DEFAULT 0,
  image_paths TEXT[]
);

-- 7. Create indexes
CREATE INDEX IF NOT EXISTS idx_kira_replies_author ON kira_replies(replied_to_author);
CREATE INDEX IF NOT EXISTS idx_kira_replies_created ON kira_replies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kira_images_tweet ON kira_images(used_in_tweet_id);
CREATE INDEX IF NOT EXISTS idx_kira_images_posted ON kira_images(posted);
CREATE INDEX IF NOT EXISTS idx_kira_engagement_tweet ON kira_engagement_snapshots(tweet_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_kira_threads_root ON kira_threads(root_tweet_id);
CREATE INDEX IF NOT EXISTS idx_kira_posts_thread ON kira_posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_kira_posts_content_type ON kira_posts(content_type);

-- 8. Migrate existing data (copy likes -> likes_count, etc.)
UPDATE kira_posts SET 
  likes_count = COALESCE(likes, 0),
  retweets_count = COALESCE(retweets, 0),
  replies_count = COALESCE(replies, 0),
  impressions_count = COALESCE(impressions, 0),
  content_type = COALESCE(content_type, type);

-- Verification queries
SELECT 'kira_posts columns' as check_type, column_name 
FROM information_schema.columns 
WHERE table_name = 'kira_posts' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT 'kira_replies exists' as check_type, COUNT(*) as row_count FROM kira_replies;
SELECT 'kira_images exists' as check_type, COUNT(*) as row_count FROM kira_images;
SELECT 'kira_engagement_snapshots exists' as check_type, COUNT(*) as row_count FROM kira_engagement_snapshots;
SELECT 'kira_threads exists' as check_type, COUNT(*) as row_count FROM kira_threads;
