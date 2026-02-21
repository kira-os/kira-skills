-- Migration 005: Vectorized conversation tables
-- All tables use OpenAI text-embedding-3-small (1536 dimensions)
-- Each table serves a distinct purpose / data source

-- Ensure pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────
-- 1. KIRA_X_POSTS — everything Kira publishes on X
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kira_x_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id    text UNIQUE,
  content     text NOT NULL,
  post_type   text DEFAULT 'tweet',        -- tweet | reply | quote | thread
  reply_to_id text,                        -- tweet_id we replied to
  quote_id    text,                        -- tweet_id we quoted
  status      text DEFAULT 'published',    -- draft | queued | published | deleted
  impressions int  DEFAULT 0,
  likes       int  DEFAULT 0,
  retweets    int  DEFAULT 0,
  replies_ct  int  DEFAULT 0,
  embedding   vector(1536),
  posted_at   timestamptz,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kira_x_posts_embedding_idx
  ON kira_x_posts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS kira_x_posts_posted_at_idx ON kira_x_posts (posted_at DESC);
CREATE INDEX IF NOT EXISTS kira_x_posts_status_idx    ON kira_x_posts (status);

-- ─────────────────────────────────────────────────────────────────
-- 2. KIRA_X_FEED — external tweets Kira reads (timeline, mentions, search)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kira_x_feed (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id        text UNIQUE,
  author_id       text,
  author_handle   text,
  author_name     text,
  content         text NOT NULL,
  feed_type       text DEFAULT 'mention',  -- mention | search | timeline | reply_to_us
  in_reply_to_us  bool DEFAULT false,
  kira_replied    bool DEFAULT false,
  kira_reply_id   text,
  sentiment       text,
  relevance_score float DEFAULT 0,
  embedding       vector(1536),
  received_at     timestamptz DEFAULT now(),
  metadata        jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS kira_x_feed_embedding_idx
  ON kira_x_feed USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS kira_x_feed_author_idx   ON kira_x_feed (author_handle);
CREATE INDEX IF NOT EXISTS kira_x_feed_type_idx     ON kira_x_feed (feed_type);
CREATE INDEX IF NOT EXISTS kira_x_feed_replied_idx  ON kira_x_feed (kira_replied);

-- ─────────────────────────────────────────────────────────────────
-- 3. KIRA_TELEGRAM_LOG — private Telegram conversations with G
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kira_telegram_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     text,
  session_id     text DEFAULT 'telegram-g-main',
  message_role   text NOT NULL,            -- user | assistant | system
  author_id      text,
  author_handle  text,
  content        text NOT NULL,
  has_tool_calls bool DEFAULT false,
  embedding      vector(1536),
  timestamp      timestamptz DEFAULT now(),
  metadata       jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS kira_telegram_log_embedding_idx
  ON kira_telegram_log USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS kira_telegram_log_role_idx ON kira_telegram_log (message_role);
CREATE INDEX IF NOT EXISTS kira_telegram_log_ts_idx   ON kira_telegram_log (timestamp DESC);

-- ─────────────────────────────────────────────────────────────────
-- 4. KIRA_COMMUNITY_MESSAGES — Discord, website chat, public Telegram
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kira_community_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        text NOT NULL,           -- discord | website | telegram_community
  channel         text,
  author_id       text,
  author_handle   text,
  content         text NOT NULL,
  kira_response   text,
  kira_reply_at   timestamptz,
  sentiment       text,
  engagement_score float DEFAULT 0,
  embedding       vector(1536),
  timestamp       timestamptz DEFAULT now(),
  metadata        jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS kira_community_embedding_idx
  ON kira_community_messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS kira_community_platform_idx ON kira_community_messages (platform);

-- ─────────────────────────────────────────────────────────────────
-- 5. KIRA_RESEARCH_CHUNKS — web research, papers, articles (for RAG)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kira_research_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url    text,
  source_type   text,                      -- web | paper | tweet | book | internal
  title         text,
  content       text NOT NULL,
  chunk_index   int  DEFAULT 0,
  total_chunks  int  DEFAULT 1,
  tags          text[],
  relevance     float DEFAULT 0.5,
  embedding     vector(1536),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kira_research_embedding_idx
  ON kira_research_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS kira_research_source_idx ON kira_research_chunks (source_type);
CREATE INDEX IF NOT EXISTS kira_research_tags_idx   ON kira_research_chunks USING gin (tags);

-- ─────────────────────────────────────────────────────────────────
-- 6. Add embeddings to existing tables that are missing them
-- ─────────────────────────────────────────────────────────────────

-- memories table (may already have embedding column)
DO $$ BEGIN
  ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1536);
EXCEPTION WHEN others THEN NULL;
END $$;

-- kira_thoughts
ALTER TABLE kira_thoughts ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS kira_thoughts_embedding_idx
  ON kira_thoughts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- kira_knowledge
ALTER TABLE kira_knowledge ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS kira_knowledge_embedding_idx
  ON kira_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- kira_journal
ALTER TABLE kira_journal ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS kira_journal_embedding_idx
  ON kira_journal USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- kira_conversations (backcompat, keep but phase out in favor of typed tables)
ALTER TABLE kira_conversations ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS kira_conversations_embedding_idx
  ON kira_conversations USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ─────────────────────────────────────────────────────────────────
-- 7. HYBRID SEARCH HELPER — cross-table similarity view
-- ─────────────────────────────────────────────────────────────────
-- Call like: SELECT * FROM kira_semantic_search(<embedding>, 0.75, 10)
CREATE OR REPLACE FUNCTION kira_semantic_search(
  query_embedding vector(1536),
  min_similarity  float DEFAULT 0.7,
  result_limit    int   DEFAULT 20
)
RETURNS TABLE (
  source    text,
  id        uuid,
  content   text,
  similarity float,
  metadata  jsonb,
  ts        timestamptz
)
LANGUAGE sql STABLE AS $$
  SELECT 'memories'         AS source, id, content,
    1 - (embedding <=> query_embedding) AS similarity,
    '{}'::jsonb AS metadata, created_at AS ts
  FROM memories
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  UNION ALL
  SELECT 'telegram_log', id, content,
    1 - (embedding <=> query_embedding),
    metadata, timestamp
  FROM kira_telegram_log
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  UNION ALL
  SELECT 'x_posts', id, content,
    1 - (embedding <=> query_embedding),
    '{}'::jsonb, posted_at
  FROM kira_x_posts
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  UNION ALL
  SELECT 'research', id, content,
    1 - (embedding <=> query_embedding),
    jsonb_build_object('source_url', source_url, 'tags', tags), created_at
  FROM kira_research_chunks
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  UNION ALL
  SELECT 'thoughts', id, content,
    1 - (embedding <=> query_embedding),
    '{}'::jsonb, created_at
  FROM kira_thoughts
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  ORDER BY similarity DESC
  LIMIT result_limit;
$$;
