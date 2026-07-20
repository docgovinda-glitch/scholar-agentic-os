-- Database Schema for Doctoral Research & Journal Publication Assistant
-- Database Provider: PostgreSQL (production-ready deployment)

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: Admin Approvals & Scholar Registry
CREATE TABLE IF NOT EXISTS admin_approvals (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    affiliation VARCHAR(255) NOT NULL,
    authentic_id VARCHAR(255), -- Optional (made optional per directives)
    is_approved BOOLEAN DEFAULT FALSE,
    activation_key_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of activation key
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 2: Model Selector Preferences & Secure Encrypted API Keys
CREATE TABLE IF NOT EXISTS model_preferences (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) REFERENCES admin_approvals(username) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- e.g., 'gemini', 'openai', 'claude'
    model VARCHAR(100) NOT NULL,    -- e.g., 'gpt-4o-mini', 'gemini-2.5-flash'
    encrypted_api_key TEXT,         -- Securely encrypted key payload
    api_key_hash VARCHAR(64),       -- SHA-256 hash of the API key for secure fingerprint validation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_provider UNIQUE (username, provider)
);

-- Indexing for fast credential retrieval and validation checks
CREATE INDEX IF NOT EXISTS idx_approvals_username ON admin_approvals(username);
CREATE INDEX IF NOT EXISTS idx_model_prefs_user_provider ON model_preferences(username, provider);
