-- PostgreSQL Schema for Scholar OS Presentation Studio Decks
-- Enforces persistence of 5-Beat structured presentation decks, themes, and slide trees.

CREATE TABLE IF NOT EXISTS presentation_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  topic VARCHAR(255),
  framework VARCHAR(50) DEFAULT 'Universal-5Beat',
  theme_id VARCHAR(50) DEFAULT 'sand-academic',
  custom_theme JSONB DEFAULT NULL,
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_module VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for rapid retrieval by topic or created timestamp
CREATE INDEX IF NOT EXISTS idx_presentation_decks_created_at ON presentation_decks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presentation_decks_topic ON presentation_decks(topic);
