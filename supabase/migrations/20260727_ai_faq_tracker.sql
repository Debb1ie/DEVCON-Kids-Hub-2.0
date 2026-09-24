-- ============================================================
-- DEVCON Kids Hub 2.0 — AI FAQ Auto-Builder Tables
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================
-- Creates:
--   1. ai_faq_questions   → logs every question asked to the chatbot
--   2. ai_faq_suggestions → auto-generated FAQ suggestions from patterns
-- ============================================================

-- Track all questions asked to the chatbot
CREATE TABLE IF NOT EXISTS ai_faq_questions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  topic TEXT,
  confidence_level VARCHAR(10) DEFAULT 'high',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- FAQ suggestions generated from question patterns
CREATE TABLE IF NOT EXISTS ai_faq_suggestions (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  sample_questions JSONB DEFAULT '[]',
  suggested_answer TEXT,
  question_count INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for fast topic lookups
CREATE INDEX IF NOT EXISTS ai_faq_questions_topic_idx ON ai_faq_questions (topic);
CREATE INDEX IF NOT EXISTS ai_faq_suggestions_status_idx ON ai_faq_suggestions (status);

-- RLS
ALTER TABLE ai_faq_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_faq_suggestions ENABLE ROW LEVEL SECURITY;

-- Permissive policies for development (will tighten in Phase 2)
CREATE POLICY "Users can insert questions" ON ai_faq_questions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view questions" ON ai_faq_questions FOR SELECT USING (true);
CREATE POLICY "Users can view suggestions" ON ai_faq_suggestions FOR SELECT USING (true);
CREATE POLICY "Users can insert suggestions" ON ai_faq_suggestions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update suggestions" ON ai_faq_suggestions FOR UPDATE USING (true);
CREATE POLICY "Users can delete suggestions" ON ai_faq_suggestions FOR DELETE USING (true);
