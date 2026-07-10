-- Migration: Switch embedding dimension from 768 (Gemini) to 1024 (Mistral)
-- Mistral's mistral-embed model produces 1024-dimensional vectors.
-- This migration updates the knowledge_base table and the search RPC function.

-- Step 1: Drop the existing vector index (required before altering column type)
DROP INDEX IF EXISTS knowledge_base_embedding_idx;

-- Step 2: Alter the embedding column from vector(768) to vector(1024)
-- NOTE: This will invalidate any existing embeddings stored with 768 dims.
-- If you have existing data, you'll need to re-embed those documents.
ALTER TABLE knowledge_base
  ALTER COLUMN embedding TYPE vector(1024);

-- Step 3: Recreate the IVFFlat index for fast cosine similarity search
-- Using 100 lists — suitable for up to ~100k chunks. Increase if you grow beyond that.
CREATE INDEX knowledge_base_embedding_idx
  ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Step 4: Update the search RPC function to accept 1024-dim query vectors
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
