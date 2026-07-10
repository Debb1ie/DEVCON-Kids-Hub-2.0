-- ============================================================
-- DEVCON Kids Hub 2.0 — AI Knowledge Base Setup
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================
-- Creates tables for:
--   1. documents         → uploaded file metadata
--   2. knowledge_base    → text chunks + 1024-dim Mistral embeddings
--   3. ai_chat_sessions  → chat history (future)
--   4. ai_chat_messages  → individual messages (future)
--   5. ai_config         → AI settings
-- Also creates:
--   - search_knowledge_base() function for semantic/vector search
--   - RLS policies (permissive for dev, tighten later)
-- ============================================================

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

-- Knowledge base table (text chunks + Mistral embeddings, 1024 dimensions)
CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  document_title TEXT,
  content TEXT NOT NULL,
  embedding vector(1024),
  page_number INTEGER,
  chunk_index INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT kb_content_not_empty CHECK (content::text != '')
);

-- Vector index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Chat history tables
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  message_count INTEGER DEFAULT 0,
  model_name VARCHAR(50) DEFAULT 'llama-3.3-70b-versatile',
  temperature NUMERIC(3,2) DEFAULT 0.7
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20),
  content TEXT NOT NULL,
  tokens_used INTEGER,
  citations JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Settings table (admin configurations)
CREATE TABLE IF NOT EXISTS ai_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Semantic search function (finds relevant document chunks by vector similarity)
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1024),
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
  WHERE kb.embedding IS NOT NULL
    AND (1 - (kb.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Permissive RLS policies for development (will tighten in Phase 2)
CREATE POLICY "Users can view documents" ON documents FOR SELECT USING (true);
CREATE POLICY "Users can insert documents" ON documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete documents" ON documents FOR DELETE USING (true);
CREATE POLICY "Users can view knowledge base" ON knowledge_base FOR SELECT USING (true);
CREATE POLICY "Users can insert knowledge base" ON knowledge_base FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete knowledge base" ON knowledge_base FOR DELETE USING (true);
CREATE POLICY "Users can view chat sessions" ON ai_chat_sessions FOR SELECT USING (true);
CREATE POLICY "Users can insert chat sessions" ON ai_chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view chat messages" ON ai_chat_messages FOR SELECT USING (true);
CREATE POLICY "Users can insert chat messages" ON ai_chat_messages FOR INSERT WITH CHECK (true);

-- Default AI config values
INSERT INTO ai_config (key, value) VALUES
  ('chatbot_name', '"DEVCON Kids Assistant"'),
  ('system_prompt', '"You are an AI assistant for DEVCON Kids."'),
  ('enable_onboarding', 'true'),
  ('enable_event_planning', 'true'),
  ('enable_faq', 'true')
ON CONFLICT (key) DO NOTHING;
