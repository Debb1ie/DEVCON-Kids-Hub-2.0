-- Supabase SQL Migration for AI Knowledge Base & Vector Storage
-- This migration sets up tables for:
-- 1. documents: Metadata for uploaded documents
-- 2. knowledge_base: Text chunks with vector embeddings
-- 3. ai_chat_history: Store chat sessions for analytics

-- Enable pgvector extension (required for vector similarity search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table (stores metadata about uploaded files)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  file_type VARCHAR(10),
  total_chunks INTEGER,
  total_pages INTEGER,
  file_size_bytes INTEGER,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Knowledge base table (stores document chunks with embeddings)
CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  document_title TEXT,
  content TEXT NOT NULL,
  embedding vector(768), -- Google Gemini embedding model produces 768-dim vectors
  page_number INTEGER,
  chunk_index INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT kb_content_not_empty CHECK (content::text != '')
);

-- Create vector index for fast similarity search
CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- AI Chat history (stores chat sessions for analytics and context)
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  message_count INTEGER DEFAULT 0,
  model_name VARCHAR(50) DEFAULT 'gemini-1.5-flash',
  temperature NUMERIC(3,2) DEFAULT 0.7
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20), -- 'user' or 'assistant'
  content TEXT NOT NULL,
  tokens_used INTEGER,
  citations JSONB, -- Store document references
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Settings table (admin configurations)
CREATE TABLE IF NOT EXISTS ai_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RPC function for semantic search using vector similarity
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(768),
  similarity_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE(
  id bigint,
  document_id text,
  document_title text,
  content text,
  page_number integer,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.document_id,
    kb.document_title,
    kb.content,
    kb.page_number,
    (1 - (kb.embedding <=> query_embedding))::float as similarity
  FROM knowledge_base kb
  WHERE (1 - (kb.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust based on your auth setup)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Users can view documents" ON documents
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Users can view knowledge base" ON knowledge_base
  FOR SELECT USING (auth.role() = 'authenticated_user');

CREATE POLICY "Users can view their own chat sessions" ON ai_chat_sessions
  FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'authenticated_user');

CREATE POLICY "Users can insert chat sessions" ON ai_chat_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Grant permissions to authenticated users
GRANT SELECT ON documents TO authenticated;
GRANT SELECT ON knowledge_base TO authenticated;
GRANT SELECT, INSERT ON ai_chat_sessions TO authenticated;
GRANT SELECT, INSERT ON ai_chat_messages TO authenticated;
GRANT SELECT ON ai_config TO authenticated;

-- Insert default AI config
INSERT INTO ai_config (key, value) VALUES
  ('chatbot_name', '"DEVCON Kids Assistant"'),
  ('system_prompt', '"You are an AI assistant for DEVCON Kids, a nonprofit tech community organization."'),
  ('enable_onboarding', 'true'),
  ('enable_event_planning', 'true'),
  ('enable_faq', 'true')
ON CONFLICT (key) DO NOTHING;
