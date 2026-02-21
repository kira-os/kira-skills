-- Design System Storage in Supabase
-- Table: kira_design_system

CREATE TABLE IF NOT EXISTS kira_design_system (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('color', 'typography', 'spacing', 'animation', 'component', 'icon')),
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert core design tokens
INSERT INTO kira_design_system (category, name, value, metadata) VALUES
-- Colors
('color', 'bg-primary', '#000000', '{"usage": "Background", "type": "solid"}'),
('color', 'bg-elevated', 'rgba(20, 20, 25, 0.6)', '{"usage": "Card backgrounds", "type": "glass"}'),
('color', 'accent-cyan', '#00D4FF', '{"usage": "Primary accent", "type": "accent"}'),
('color', 'accent-purple', '#7C3AED', '{"usage": "Secondary accent", "type": "accent"}'),
('color', 'accent-rose', '#F43F5E', '{"usage": "Alerts/danger", "type": "accent"}'),
('color', 'accent-green', '#10B981', '{"usage": "Success", "type": "accent"}'),
('color', 'text-primary', '#FFFFFF', '{"usage": "Headings", "type": "text"}'),
('color', 'text-secondary', 'rgba(255, 255, 255, 0.6)', '{"usage": "Body text", "type": "text"}'),
('color', 'glass-border', 'rgba(255, 255, 255, 0.08)', '{"usage": "Borders", "type": "border"}'),

-- Typography
('typography', 'font-primary', 'Inter, -apple-system, sans-serif', '{"usage": "Body text"}'),
('typography', 'font-mono', 'JetBrains Mono, SF Mono, monospace', '{"usage": "Code, labels"}'),
('typography', 'weight-light', '300', '{"usage": "Subtitles"}'),
('typography', 'weight-regular', '400', '{"usage": "Body"}'),
('typography', 'weight-medium', '500', '{"usage": "Labels"}'),
('typography', 'weight-semibold', '600', '{"usage": "Headings"}'),

-- Spacing
('spacing', 'space-xs', '4px', '{"usage": "Tight gaps"}'),
('spacing', 'space-sm', '8px', '{"usage": "Related items"}'),
('spacing', 'space-md', '16px', '{"usage": "Card padding"}'),
('spacing', 'space-lg', '24px', '{"usage": "Section gaps"}'),
('spacing', 'space-xl', '40px', '{"usage": "Major sections"}'),

-- Animation
('animation', 'ease-smooth', 'cubic-bezier(0.4, 0, 0.2, 1)', '{"usage": "Standard transitions"}'),
('animation', 'ease-snap', 'cubic-bezier(0.16, 1, 0.3, 1)', '{"usage": "Entrances"}'),
('animation', 'ease-bounce', 'cubic-bezier(0.34, 1.56, 0.64, 1)', '{"usage": "Playful interactions"}'),
('animation', 'duration-fast', '150ms', '{"usage": "Micro-interactions"}'),
('animation', 'duration-normal', '300ms', '{"usage": "Standard"}'),
('animation', 'duration-slow', '500ms', '{"usage": "Complex animations"}'),

-- Components
('component', 'card-radius', '24px', '{"usage": "Card border radius"}'),
('component', 'button-radius', '12px', '{"usage": "Button border radius"}'),
('component', 'input-radius', '12px', '{"usage": "Input border radius"}'),
('component', 'glass-blur', '20px', '{"usage": "Backdrop filter blur"}'),
('component', 'glass-bg', 'rgba(255, 255, 255, 0.03)', '{"usage": "Glass background"}'),

-- Icons (text representations, no emojis)
('icon', 'wallet', 'W', '{"usage": "Wallet connection"}'),
('icon', 'telegram', 'T', '{"usage": "Telegram link"}'),
('icon', 'twitter', 'X', '{"usage": "X/Twitter link"}'),
('icon', 'analytics', 'A', '{"usage": "Analytics dashboard"}'),
('icon', 'community', 'C', '{"usage": "Community features"}'),
('icon', 'mev', 'M', '{"usage": "MEV watcher"}'),
('icon', 'directory', 'D', '{"usage": "App directory"}'),
('icon', 'arrow-up', '↑', '{"usage": "Increase/up"}'),
('icon', 'arrow-down', '↓', '{"usage": "Decrease/down"}'),
('icon', 'check', '✓', '{"usage": "Success/check"}'),
('icon', 'loading', '~', '{"usage": "Loading state"}')
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE kira_design_system ENABLE ROW LEVEL SECURITY;

-- Service role can read all
CREATE POLICY "Service role can read design system"
    ON kira_design_system
    FOR SELECT
    TO service_role
    USING (true);

-- Create function to get active design tokens by category
CREATE OR REPLACE FUNCTION get_design_tokens(p_category TEXT)
RETURNS TABLE (
    name TEXT,
    value TEXT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT d.name, d.value, d.metadata
    FROM kira_design_system d
    WHERE d.category = p_category AND d.is_active = true
    ORDER BY d.name;
END;
$$ LANGUAGE plpgsql;
