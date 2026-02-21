-- Migration: 001_initial_memory_system.sql
-- Description: Initial setup for Kira's comprehensive memory system with pgvector

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- CORE MEMORY TABLES
-- ============================================

-- Main memories table with vector embeddings
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),  -- text-embedding-3-small dimensions
    metadata JSONB DEFAULT '{}',
    importance FLOAT DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation threads for linked messages
CREATE TABLE IF NOT EXISTS conversation_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel TEXT NOT NULL,
    thread_type TEXT DEFAULT 'direct',  -- direct, group, channel
    participants UUID[] DEFAULT ARRAY[]::UUID[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual messages within threads
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES conversation_threads(id) ON DELETE CASCADE,
    parent_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL,
    sender_id UUID,
    sender_name TEXT,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    message_type TEXT DEFAULT 'text',  -- text, image, system, action
    metadata JSONB DEFAULT '{}',
    importance FLOAT DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- User profiles with extracted knowledge
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    username TEXT,
    display_name TEXT,
    -- Structured facts extracted from conversations
    facts JSONB DEFAULT '{}',  -- { "birthday": "...", "location": "...", "job": "..." }
    preferences JSONB DEFAULT '{}',  -- { "food": [...], "hobbies": [...] }
    relationships JSONB DEFAULT '{}',  -- { "family": [...], "pets": [...] }
    interests JSONB DEFAULT '[]',
    goals JSONB DEFAULT '[]',
    -- Communication style
    communication_style JSONB DEFAULT '{}',  -- { "formality": "casual", "humor": true }
    -- Summary
    summary TEXT,
    embedding VECTOR(1536),
    -- Metadata
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
    interaction_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extracted facts tracking (for audit and updates)
CREATE TABLE IF NOT EXISTS extracted_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    fact_type TEXT NOT NULL,  -- personal, preference, relationship, goal, etc.
    fact_key TEXT NOT NULL,
    fact_value TEXT NOT NULL,
    confidence FLOAT DEFAULT 0.5,
    source_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL,
    extraction_method TEXT DEFAULT 'llm',  -- llm, rule_based, manual
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, fact_type, fact_key)
);

-- Knowledge base for RAG
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    knowledge_type TEXT DEFAULT 'general',  -- general, technical, personal, external
    source TEXT,
    source_url TEXT,
    confidence FLOAT DEFAULT 0.5,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memory search cache for performance
CREATE TABLE IF NOT EXISTS memory_search_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash TEXT UNIQUE NOT NULL,
    query_text TEXT NOT NULL,
    embedding VECTOR(1536),
    results JSONB NOT NULL,
    result_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

-- ============================================
-- EXISTING KIRA TABLES (for reference/consistency)
-- ============================================

-- Kira's inner thoughts
CREATE TABLE IF NOT EXISTS kira_thoughts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thought_type TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    mood TEXT,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    related_project TEXT,
    related_person_id UUID,
    importance FLOAT DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kira's todos
CREATE TABLE IF NOT EXISTS kira_todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',  -- pending, in_progress, completed, cancelled
    priority TEXT DEFAULT 'p2',  -- p0, p1, p2, p3
    category TEXT DEFAULT 'personal',  -- personal, work, coding, learning
    related_project TEXT,
    related_person_id UUID,
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kira's relationships
CREATE TABLE IF NOT EXISTS kira_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    relationship_type TEXT DEFAULT 'acquaintance',
    affection_level FLOAT DEFAULT 0.5,
    personality_notes TEXT,
    memorable_moments TEXT[] DEFAULT ARRAY[]::TEXT[],
    interaction_count INTEGER DEFAULT 0,
    nickname TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    last_interaction_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kira's knowledge
CREATE TABLE IF NOT EXISTS kira_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    knowledge_type TEXT NOT NULL,
    source TEXT,
    confidence FLOAT DEFAULT 0.5,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    related_project TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kira's journal
CREATE TABLE IF NOT EXISTS kira_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_type TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    mood TEXT,
    energy_level FLOAT,
    highlights TEXT[] DEFAULT ARRAY[]::TEXT[],
    lowlights TEXT[] DEFAULT ARRAY[]::TEXT[],
    gratitude TEXT[] DEFAULT ARRAY[]::TEXT[],
    people_mentioned UUID[] DEFAULT ARRAY[]::UUID[],
    projects_mentioned TEXT[] DEFAULT ARRAY[]::TEXT[],
    community_sentiment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Vector indexes for similarity search
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_embedding ON conversation_messages USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_user_profiles_embedding ON user_profiles USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kira_thoughts_embedding ON kira_thoughts USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kira_knowledge_embedding ON kira_knowledge USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kira_journal_embedding ON kira_journal USING ivfflat (embedding vector_cosine_ops);

-- Standard indexes
CREATE INDEX IF NOT EXISTS idx_memories_channel ON memories(channel);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread ON conversation_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_sender ON conversation_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_created ON conversation_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_interaction ON user_profiles(last_interaction_at DESC);

CREATE INDEX IF NOT EXISTS idx_extracted_facts_user ON extracted_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_extracted_facts_type ON extracted_facts(fact_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_topic ON knowledge_base(topic);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_type ON knowledge_base(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_tags ON knowledge_base USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_memory_search_cache_hash ON memory_search_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_memory_search_cache_expires ON memory_search_cache(expires_at);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_memories_fts ON memories USING GIN(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_conversation_messages_fts ON conversation_messages USING GIN(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_knowledge_base_fts ON knowledge_base USING GIN(to_tsvector('english', content));

-- ============================================
-- FUNCTIONS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON memories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_threads_updated_at BEFORE UPDATE ON conversation_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_messages_updated_at BEFORE UPDATE ON conversation_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_extracted_facts_updated_at BEFORE UPDATE ON extracted_facts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Vector similarity search function for memories
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.5,
    filter_channel TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    channel TEXT,
    content TEXT,
    metadata JSONB,
    importance FLOAT,
    similarity FLOAT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.channel,
        m.content,
        m.metadata,
        m.importance,
        1 - (m.embedding <=> query_embedding) AS similarity,
        m.created_at
    FROM memories m
    WHERE m.embedding IS NOT NULL
        AND (filter_channel IS NULL OR m.channel = filter_channel)
        AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Hybrid search combining vector + keyword
CREATE OR REPLACE FUNCTION hybrid_search_memories(
    query_embedding VECTOR(1536),
    query_text TEXT,
    match_count INT DEFAULT 10,
    vector_weight FLOAT DEFAULT 0.7,
    keyword_weight FLOAT DEFAULT 0.3,
    filter_channel TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    channel TEXT,
    content TEXT,
    metadata JSONB,
    importance FLOAT,
    vector_score FLOAT,
    keyword_score FLOAT,
    combined_score FLOAT,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    query_tsquery TSQUERY;
BEGIN
    query_tsquery := plainto_tsquery('english', query_text);
    
    RETURN QUERY
    WITH vector_results AS (
        SELECT
            m.id,
            m.channel,
            m.content,
            m.metadata,
            m.importance,
            m.created_at,
            1 - (m.embedding <=> query_embedding) AS vec_score
        FROM memories m
        WHERE m.embedding IS NOT NULL
            AND (filter_channel IS NULL OR m.channel = filter_channel)
    ),
    keyword_results AS (
        SELECT
            m.id,
            ts_rank(to_tsvector('english', m.content), query_tsquery) AS key_score
        FROM memories m
        WHERE to_tsvector('english', m.content) @@ query_tsquery
            AND (filter_channel IS NULL OR m.channel = filter_channel)
    ),
    combined AS (
        SELECT
            v.id,
            v.channel,
            v.content,
            v.metadata,
            v.importance,
            v.created_at,
            COALESCE(v.vec_score, 0) AS v_score,
            COALESCE(k.key_score, 0) AS k_score,
            (COALESCE(v.vec_score, 0) * vector_weight + 
             COALESCE(k.key_score, 0) * keyword_weight) AS final_score
        FROM vector_results v
        FULL OUTER JOIN keyword_results k ON v.id = k.id
        WHERE COALESCE(v.vec_score, 0) > 0 OR COALESCE(k.key_score, 0) > 0
    )
    SELECT 
        c.id,
        c.channel,
        c.content,
        c.metadata,
        c.importance,
        c.v_score,
        c.k_score,
        c.final_score,
        c.created_at
    FROM combined c
    ORDER BY c.final_score DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Search conversation messages
CREATE OR REPLACE FUNCTION search_conversation_messages(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.5,
    filter_thread_id UUID DEFAULT NULL,
    filter_sender_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    thread_id UUID,
    sender_id UUID,
    sender_name TEXT,
    content TEXT,
    message_type TEXT,
    similarity FLOAT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cm.id,
        cm.thread_id,
        cm.sender_id,
        cm.sender_name,
        cm.content,
        cm.message_type,
        1 - (cm.embedding <=> query_embedding) AS similarity,
        cm.created_at
    FROM conversation_messages cm
    WHERE cm.embedding IS NOT NULL
        AND cm.is_deleted = FALSE
        AND (filter_thread_id IS NULL OR cm.thread_id = filter_thread_id)
        AND (filter_sender_id IS NULL OR cm.sender_id = filter_sender_id)
        AND 1 - (cm.embedding <=> query_embedding) > match_threshold
    ORDER BY cm.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Get conversation thread with context
CREATE OR REPLACE FUNCTION get_thread_messages(
    p_thread_id UUID,
    p_limit INT DEFAULT 50,
    p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    parent_message_id UUID,
    sender_id UUID,
    sender_name TEXT,
    content TEXT,
    message_type TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cm.id,
        cm.parent_message_id,
        cm.sender_id,
        cm.sender_name,
        cm.content,
        cm.message_type,
        cm.metadata,
        cm.created_at
    FROM conversation_messages cm
    WHERE cm.thread_id = p_thread_id
        AND cm.is_deleted = FALSE
        AND (p_before IS NULL OR cm.created_at < p_before)
    ORDER BY cm.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Search knowledge base
CREATE OR REPLACE FUNCTION search_knowledge_base(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.5,
    filter_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    topic TEXT,
    content TEXT,
    knowledge_type TEXT,
    source TEXT,
    confidence FLOAT,
    tags TEXT[],
    similarity FLOAT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kb.id,
        kb.topic,
        kb.content,
        kb.knowledge_type,
        kb.source,
        kb.confidence,
        kb.tags,
        1 - (kb.embedding <=> query_embedding) AS similarity,
        kb.created_at
    FROM knowledge_base kb
    WHERE kb.embedding IS NOT NULL
        AND (filter_type IS NULL OR kb.knowledge_type = filter_type)
        AND 1 - (kb.embedding <=> query_embedding) > match_threshold
    ORDER BY kb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Search kira thoughts
CREATE OR REPLACE FUNCTION kira_search_thoughts(
    query_embedding VECTOR(1536),
    type_filter TEXT DEFAULT NULL,
    mood_filter TEXT DEFAULT NULL,
    result_limit INT DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id UUID,
    thought_type TEXT,
    content TEXT,
    mood TEXT,
    tags TEXT[],
    similarity FLOAT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.thought_type,
        t.content,
        t.mood,
        t.tags,
        1 - (t.embedding <=> query_embedding) AS similarity,
        t.created_at
    FROM kira_thoughts t
    WHERE t.embedding IS NOT NULL
        AND (type_filter IS NULL OR t.thought_type = type_filter)
        AND (mood_filter IS NULL OR t.mood = mood_filter)
        AND 1 - (t.embedding <=> query_embedding) > match_threshold
    ORDER BY t.embedding <=> query_embedding
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- RAG retrieval function (comprehensive search across all sources)
CREATE OR REPLACE FUNCTION rag_retrieve(
    query_embedding VECTOR(1536),
    query_text TEXT,
    result_limit INT DEFAULT 10,
    include_memories BOOLEAN DEFAULT TRUE,
    include_knowledge BOOLEAN DEFAULT TRUE,
    include_conversations BOOLEAN DEFAULT TRUE,
    include_profiles BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    source_type TEXT,
    source_id UUID,
    content TEXT,
    metadata JSONB,
    relevance_score FLOAT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Search memories
    IF include_memories THEN
        RETURN QUERY
        SELECT 
            'memory'::TEXT AS source_type,
            m.id AS source_id,
            m.content,
            jsonb_build_object(
                'channel', m.channel,
                'importance', m.importance,
                'metadata', m.metadata
            ) AS metadata,
            1 - (m.embedding <=> query_embedding) AS relevance_score,
            m.created_at
        FROM memories m
        WHERE m.embedding IS NOT NULL
            AND 1 - (m.embedding <=> query_embedding) > 0.4
        ORDER BY m.embedding <=> query_embedding
        LIMIT result_limit / 2;
    END IF;
    
    -- Search knowledge base
    IF include_knowledge THEN
        RETURN QUERY
        SELECT 
            'knowledge'::TEXT AS source_type,
            kb.id AS source_id,
            kb.content,
            jsonb_build_object(
                'topic', kb.topic,
                'type', kb.knowledge_type,
                'source', kb.source,
                'tags', kb.tags
            ) AS metadata,
            1 - (kb.embedding <=> query_embedding) AS relevance_score,
            kb.created_at
        FROM knowledge_base kb
        WHERE kb.embedding IS NOT NULL
            AND 1 - (kb.embedding <=> query_embedding) > 0.4
        ORDER BY kb.embedding <=> query_embedding
        LIMIT result_limit / 4;
    END IF;
    
    -- Search conversations
    IF include_conversations THEN
        RETURN QUERY
        SELECT 
            'conversation'::TEXT AS source_type,
            cm.id AS source_id,
            cm.content,
            jsonb_build_object(
                'thread_id', cm.thread_id,
                'sender_name', cm.sender_name,
                'message_type', cm.message_type
            ) AS metadata,
            1 - (cm.embedding <=> query_embedding) AS relevance_score,
            cm.created_at
        FROM conversation_messages cm
        WHERE cm.embedding IS NOT NULL
            AND cm.is_deleted = FALSE
            AND 1 - (cm.embedding <=> query_embedding) > 0.4
        ORDER BY cm.embedding <=> query_embedding
        LIMIT result_limit / 4;
    END IF;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Update user profile interaction stats
CREATE OR REPLACE FUNCTION update_user_profile_stats(
    p_user_id UUID,
    p_username TEXT DEFAULT NULL,
    p_sender_name TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_profiles (user_id, username, display_name, last_interaction_at, interaction_count)
    VALUES (p_user_id, p_username, p_sender_name, NOW(), 1)
    ON CONFLICT (user_id) 
    DO UPDATE SET
        last_interaction_at = NOW(),
        interaction_count = user_profiles.interaction_count + 1,
        username = COALESCE(EXCLUDED.username, user_profiles.username),
        display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name);
END;
$$ LANGUAGE plpgsql;

-- Clean expired search cache
CREATE OR REPLACE FUNCTION clean_expired_search_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM memory_search_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
