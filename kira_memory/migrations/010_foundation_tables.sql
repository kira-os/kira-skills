-- Migration 010: Foundation tables for closed feedback loops
-- kira_oauth_tokens: OAuth 2.0 token persistence
-- kira_decisions: Decision log with reasoning
-- kira_skill_log: Skill invocation telemetry

-- ── OAuth token storage ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kira_oauth_tokens (
  provider       text PRIMARY KEY,        -- 'x_oauth2', 'github', etc.
  access_token   text NOT NULL,
  refresh_token  text,
  expires_at     timestamptz,
  scope          text,
  screen_name    text,
  metadata       jsonb DEFAULT '{}',
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE kira_oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON kira_oauth_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Decision log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kira_decisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,           -- short description
  context         text,                    -- what triggered this decision
  options         jsonb DEFAULT '[]',      -- [{option, pros, cons}]
  chosen          text NOT NULL,           -- what was decided
  reasoning       text,                    -- why
  outcome         text,                    -- filled in later
  outcome_at      timestamptz,
  confidence      smallint CHECK (confidence BETWEEN 1 AND 10),
  tags            text[] DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE kira_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON kira_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS kira_decisions_created_idx ON kira_decisions (created_at DESC);
CREATE INDEX IF NOT EXISTS kira_decisions_tags_idx ON kira_decisions USING GIN (tags);

-- ── Skill telemetry ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kira_skill_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill           text NOT NULL,           -- 'kira_social', 'kira_memory', etc.
  command         text NOT NULL,           -- 'post', 'recall', 'thought'
  args            jsonb DEFAULT '{}',      -- sanitized args (no secrets)
  success         boolean NOT NULL,
  duration_ms     integer,                 -- execution time
  error_msg       text,                    -- if failed
  output_preview  text,                    -- first 200 chars of output
  triggered_by    text,                    -- 'heartbeat', 'manual', 'cron', 'router'
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE kira_skill_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON kira_skill_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS kira_skill_log_skill_idx ON kira_skill_log (skill, command);
CREATE INDEX IF NOT EXISTS kira_skill_log_created_idx ON kira_skill_log (created_at DESC);
CREATE INDEX IF NOT EXISTS kira_skill_log_success_idx ON kira_skill_log (success, created_at DESC);

-- ── Health state (for self-monitoring) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS kira_health_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service         text NOT NULL,           -- 'stream_bridge', 'avatar_bridge', 'x_auth', etc.
  status          text NOT NULL,           -- 'ok', 'degraded', 'down'
  latency_ms      integer,
  message         text,
  metadata        jsonb DEFAULT '{}',
  checked_at      timestamptz DEFAULT now()
);

ALTER TABLE kira_health_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON kira_health_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS kira_health_log_service_idx ON kira_health_log (service, checked_at DESC);
CREATE INDEX IF NOT EXISTS kira_health_log_status_idx ON kira_health_log (status, checked_at DESC);
