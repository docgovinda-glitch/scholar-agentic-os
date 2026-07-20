CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_users (
  username TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  affiliation TEXT NOT NULL DEFAULT '',
  authentic_id TEXT NOT NULL DEFAULT '',
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  activation_key_hash TEXT NOT NULL DEFAULT '',
  passcode_hash TEXT,
  temp_passcode_hash TEXT,
  reset_approved BOOLEAN NOT NULL DEFAULT FALSE,
  model_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  encrypted_api_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
  api_key_hashes JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_approved ON app_users(is_approved);

CREATE TABLE IF NOT EXISTS app_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_audit_log_entity ON app_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_created_at ON app_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS app_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bucket, object_key)
);

CREATE INDEX IF NOT EXISTS idx_app_objects_bucket_key ON app_objects(bucket, object_key);

CREATE TABLE IF NOT EXISTS app_search_documents (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_tsv TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_search_documents_entity ON app_search_documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_app_search_documents_tsv ON app_search_documents USING GIN(search_tsv);

CREATE TABLE IF NOT EXISTS app_vectors (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  embedding DOUBLE PRECISION[] NOT NULL DEFAULT '{}'::double precision[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_vectors_entity ON app_vectors(entity_type, entity_id);

