/**
 * Pocket Schema — Mobile approval queue, comments, chat, push subscriptions
 * Run this in Supabase SQL Editor after schema_store.sql
 */

-- Pocket Approvals Table
-- Tracks user decisions on source approval queue
CREATE TABLE IF NOT EXISTS pocket_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_decision TEXT NOT NULL CHECK (user_decision IN ('approved', 'rejected', 'deferred')),
  decided_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, source_id, user_id)
);

CREATE INDEX idx_pocket_approvals_project ON pocket_approvals(project_id);
CREATE INDEX idx_pocket_approvals_user ON pocket_approvals(user_id);
CREATE INDEX idx_pocket_approvals_decision ON pocket_approvals(user_decision);

-- Pocket Comments Table
-- Threaded comments on document sections
CREATE TABLE IF NOT EXISTS pocket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  section_id TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pocket_comments_document ON pocket_comments(document_id);
CREATE INDEX idx_pocket_comments_user ON pocket_comments(user_id);
CREATE INDEX idx_pocket_comments_resolved ON pocket_comments(resolved);
CREATE INDEX idx_pocket_comments_section ON pocket_comments(section_id);

-- Pocket Chat Messages Table
-- Conversation history for chat/ask feature
CREATE TABLE IF NOT EXISTS pocket_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pocket_chat_project ON pocket_chat_messages(project_id);
CREATE INDEX idx_pocket_chat_user ON pocket_chat_messages(user_id);
CREATE INDEX idx_pocket_chat_created ON pocket_chat_messages(created_at);

-- Pocket Push Subscriptions Table
-- Web Push API subscriptions for notifications
CREATE TABLE IF NOT EXISTS pocket_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX idx_pocket_push_user ON pocket_push_subscriptions(user_id);
CREATE INDEX idx_pocket_push_endpoint ON pocket_push_subscriptions(endpoint);

-- Row Level Security Policies

-- pocket_approvals: Users can only see their own approvals
ALTER TABLE pocket_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project approvals" ON pocket_approvals
  FOR SELECT USING (
    user_id = auth.uid() OR
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own approvals" ON pocket_approvals
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own approvals" ON pocket_approvals
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- pocket_comments: Users can see comments on their project documents
ALTER TABLE pocket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on accessible documents" ON pocket_comments
  FOR SELECT USING (
    document_id IN (
      SELECT d.id FROM documents d
      JOIN projects p ON d.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create comments on accessible documents" ON pocket_comments
  FOR INSERT WITH CHECK (
    document_id IN (
      SELECT d.id FROM documents d
      JOIN projects p ON d.project_id = p.id
      WHERE p.user_id = auth.uid()
    ) AND
    user_id = auth.uid()
  );

CREATE POLICY "Users can update own comments" ON pocket_comments
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- pocket_chat_messages: Users can see chat in their projects
ALTER TABLE pocket_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chat in their projects" ON pocket_chat_messages
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can add chat messages to their projects" ON pocket_chat_messages
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()) AND
    user_id = auth.uid()
  );

-- pocket_push_subscriptions: Users manage their own subscriptions
ALTER TABLE pocket_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions" ON pocket_push_subscriptions
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "Users can create subscriptions" ON pocket_push_subscriptions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can delete own subscriptions" ON pocket_push_subscriptions
  FOR DELETE USING (
    user_id = auth.uid()
  );
