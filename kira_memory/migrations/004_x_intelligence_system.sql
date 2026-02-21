-- X/Twitter Intelligence System Tables

-- X posts table - tracks all posts made by Kira
CREATE TABLE IF NOT EXISTS kira_x_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tweet_id TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    post_type TEXT CHECK (post_type IN ('standalone', 'thread_start', 'thread_cont', 'reply', 'quote')),
    parent_tweet_id TEXT,
    thread_position INTEGER,
    metrics JSONB DEFAULT '{}',
    engagement_score NUMERIC DEFAULT 0,
    posted_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- X mentions/replies to monitor
CREATE TABLE IF NOT EXISTS kira_x_mentions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tweet_id TEXT UNIQUE NOT NULL,
    author_id TEXT NOT NULL,
    author_username TEXT NOT NULL,
    content TEXT NOT NULL,
    is_reply BOOLEAN DEFAULT false,
    is_mention BOOLEAN DEFAULT false,
    parent_tweet_id TEXT,
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    priority TEXT CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
    responded BOOLEAN DEFAULT false,
    response_tweet_id TEXT,
    response_content TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    discovered_at TIMESTAMPTZ DEFAULT now(),
    responded_at TIMESTAMPTZ
);

-- Engagement tracking per post
CREATE TABLE IF NOT EXISTS kira_x_engagement (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tweet_id TEXT REFERENCES kira_x_posts(tweet_id) ON DELETE CASCADE,
    likes INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    retweets INTEGER DEFAULT 0,
    quotes INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    checked_at TIMESTAMPTZ DEFAULT now()
);

-- Content ideas/research queue
CREATE TABLE IF NOT EXISTS kira_x_content_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    topic TEXT NOT NULL,
    content_type TEXT CHECK (content_type IN ('standalone', 'thread', 'reply', 'research')),
    draft_content TEXT,
    source_urls TEXT[],
    priority INTEGER DEFAULT 5,
    scheduled_for TIMESTAMPTZ,
    posted BOOLEAN DEFAULT false,
    posted_tweet_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE kira_x_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kira_x_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kira_x_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE kira_x_content_queue ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role full access on x_posts"
    ON kira_x_posts FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on x_mentions"
    ON kira_x_mentions FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on x_engagement"
    ON kira_x_engagement FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on x_content_queue"
    ON kira_x_content_queue FOR ALL TO service_role USING (true);

-- Indexes for performance
CREATE INDEX idx_x_posts_posted_at ON kira_x_posts(posted_at DESC);
CREATE INDEX idx_x_posts_type ON kira_x_posts(post_type);
CREATE INDEX idx_x_mentions_responded ON kira_x_mentions(responded, discovered_at);
CREATE INDEX idx_x_mentions_author ON kira_x_mentions(author_username);
CREATE INDEX idx_x_engagement_tweet ON kira_x_engagement(tweet_id);
CREATE INDEX idx_x_content_queue_scheduled ON kira_x_content_queue(scheduled_for) WHERE posted = false;

-- Function to calculate engagement rate
CREATE OR REPLACE FUNCTION calculate_engagement_rate(p_tweet_id TEXT)
RETURNS NUMERIC AS $$
DECLARE
    v_engagement kira_x_engagement%ROWTYPE;
    v_impressions INTEGER;
BEGIN
    SELECT * INTO v_engagement
    FROM kira_x_engagement
    WHERE tweet_id = p_tweet_id
    ORDER BY checked_at DESC
    LIMIT 1;
    
    IF v_engagement.impressions = 0 OR v_engagement.impressions IS NULL THEN
        RETURN 0;
    END IF;
    
    RETURN ((v_engagement.likes + v_engagement.replies + v_engagement.retweets + v_engagement.quotes)::NUMERIC / v_engagement.impressions) * 100;
END;
$$ LANGUAGE plpgsql;

-- Function to get posts needing response
CREATE OR REPLACE FUNCTION get_pending_mentions(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    id uuid,
    tweet_id TEXT,
    author_username TEXT,
    content TEXT,
    priority TEXT,
    discovered_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.tweet_id, m.author_username, m.content, m.priority, m.discovered_at
    FROM kira_x_mentions m
    WHERE m.responded = false
      AND m.priority IN ('high', 'medium')
      AND m.author_username NOT IN (SELECT DISTINCT author_username FROM kira_x_mentions WHERE responded = false AND discovered_at < now() - interval '7 days' GROUP BY author_username HAVING count(*) > 10)
    ORDER BY 
        CASE m.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        m.discovered_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get best performing post types
CREATE OR REPLACE FUNCTION get_post_performance()
RETURNS TABLE (
    post_type TEXT,
    avg_likes NUMERIC,
    avg_replies NUMERIC,
    avg_retweets NUMERIC,
    post_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.post_type,
        AVG(e.likes)::NUMERIC as avg_likes,
        AVG(e.replies)::NUMERIC as avg_replies,
        AVG(e.retweets)::NUMERIC as avg_retweets,
        COUNT(*) as post_count
    FROM kira_x_posts p
    LEFT JOIN kira_x_engagement e ON p.tweet_id = e.tweet_id
    WHERE p.posted_at > now() - interval '30 days'
    GROUP BY p.post_type
    ORDER BY avg_likes DESC;
END;
$$ LANGUAGE plpgsql;
