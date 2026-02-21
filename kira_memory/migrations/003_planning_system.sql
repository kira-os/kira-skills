-- Kira Planning System Tables

-- Plans table
CREATE TABLE IF NOT EXISTS kira_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'auditing', 'approved', 'executing', 'paused', 'complete', 'abandoned')),
    complexity TEXT CHECK (complexity IN ('low', 'medium', 'high')),
    estimated_time TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    success_criteria JSONB DEFAULT '{}',
    lessons_learned TEXT,
    UNIQUE(file_path)
);

-- Enable RLS
ALTER TABLE kira_plans ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access on plans"
    ON kira_plans
    FOR ALL
    TO service_role
    USING (true);

-- Create index for status lookups
CREATE INDEX idx_plans_status ON kira_plans(status);
CREATE INDEX idx_plans_created ON kira_plans(created_at DESC);

-- Function to get active plans
CREATE OR REPLACE FUNCTION get_active_plans()
RETURNS TABLE (
    id uuid,
    title TEXT,
    status TEXT,
    complexity TEXT,
    file_path TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.title, p.status, p.complexity, p.file_path
    FROM kira_plans p
    WHERE p.status IN ('draft', 'auditing', 'approved', 'executing', 'paused')
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql;
