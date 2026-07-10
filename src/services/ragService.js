/**
 * Vector Embedding & RAG Service
 * Handles document embeddings, storage, and semantic search using Supabase pgvector
 */

import { supabase } from '../lib/supabase';

const OPENAI_BASE_URL = import.meta.env.VITE_OPENAI_BASE_URL || 'http://192.168.1.14/v1';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL = import.meta.env.VITE_OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const OPENAI_EMBEDDING_ENDPOINT = `${OPENAI_BASE_URL.replace(/\/$/, '')}/embeddings`;

/**
 * Generate embeddings for text using an OpenAI-compatible API.
 * Currently disabled — will be replaced with Gemini Edge Function in Phase 2.
 * Returns empty array (graceful skip) so document upload still works without embeddings.
 * 
 * @param {string} text - Text to generate embedding for
 * @returns {Array<number>} 768-dim embedding vector, or [] if unavailable
 */
export async function generateEmbedding(text) {
  // Skip embedding if no valid API key or if pointing to a local server
  // that may be unreachable. This will be replaced with an Edge Function
  // in Phase 2 that calls Gemini text-embedding-004.
  if (!OPENAI_API_KEY || OPENAI_BASE_URL.includes('192.168.')) {
    return [];
  }

  const requestBody = {
    model: OPENAI_EMBEDDING_MODEL,
    input: text
  };

  try {
    // Set a timeout so we don't hang forever if the server is unreachable
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(OPENAI_EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Embedding error: ${error.error?.message || error.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
  } catch (error) {
    // Don't log timeout/abort errors repeatedly — they're expected when server is down
    if (error.name !== 'AbortError') {
      console.error('[ragService] Embedding generation error:', error);
    }
    return [];
  }
}

/**
 * Store document chunks in vector database (Supabase pgvector).
 * If embedding generation fails, chunks are stored without embeddings (null).
 * If the database insert fails entirely, we log the error but DON'T crash
 * the upload — the document metadata is already saved in the documents table.
 * 
 * @param {string} documentId - Unique document identifier
 * @param {string} documentTitle - Document filename/title
 * @param {Array} chunks - Array of {content, pageNumber} objects
 * @returns {number} Number of chunks stored (0 if storage failed)
 */
export async function storeDocumentChunks(documentId, documentTitle, chunks) {
  try {
    const chunkRecords = [];

    for (const chunk of chunks) {
      // generateEmbedding already handles its own errors (returns [] on failure)
      const embedding = await generateEmbedding(chunk.content);

      chunkRecords.push({
        document_id: documentId,
        document_title: documentTitle,
        content: chunk.content,
        embedding: embedding.length > 0 ? embedding : null,
        page_number: chunk.pageNumber,
        created_at: new Date().toISOString()
      });
    }

    // Store in Supabase knowledge_base table
    const { error } = await supabase
      .from('knowledge_base')
      .insert(chunkRecords);

    if (error) {
      // Log but don't crash — document metadata is already saved
      console.error('[ragService] Failed to store chunks in knowledge_base:', error);
      console.warn('[ragService] This usually means the knowledge_base table does not exist or RLS is blocking inserts. Run the migration: supabase/migrations/20260516_ai_knowledge_base.sql');
      return 0;
    }

    return chunkRecords.length;
  } catch (error) {
    // Catch network errors, unexpected failures — don't crash the upload
    console.error('[ragService] Error storing document chunks:', error);
    return 0;
  }
}

/**
 * Semantic search in knowledge base using vector similarity
 */
export async function semanticSearch(query, limit = 5) {
  try {
    if (!OPENAI_API_KEY) {
      return [];
    }

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding.length) {
      return [];
    }

    // Search in Supabase using pgvector similarity
    const { data, error } = await supabase.rpc('search_knowledge_base', {
      query_embedding: queryEmbedding,
      similarity_threshold: 0.7,
      match_count: limit
    });

    if (error) throw error;

    return data.map(item => ({
      content: item.content,
      similarity: item.similarity,
      metadata: {
        documentId: item.document_id,
        title: item.document_title,
        pageNumber: item.page_number
      }
    }));
  } catch (error) {
    console.error('Semantic search error:', error);
    return [];
  }
}

/**
 * Retrieve relevant context for RAG
 */
export async function retrieveContext(userQuery) {
  try {
    const results = await semanticSearch(userQuery, 5);
    return results.map(r => ({
      content: r.content,
      metadata: r.metadata,
      similarity: r.similarity
    }));
  } catch (error) {
    console.error('Context retrieval error:', error);
    return [];
  }
}

/**
 * Delete document and its chunks
 */
export async function deleteDocument(documentId) {
  try {
    const { error } = await supabase
      .from('knowledge_base')
      .delete()
      .eq('document_id', documentId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

/**
 * List all documents in knowledge base
 */
export async function listDocuments() {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error listing documents:', error);
    return [];
  }
}
