/**
 * Vector Embedding & RAG Service
 * Handles document embeddings, storage, and semantic search using Supabase pgvector.
 * 
 * Embedding provider: Mistral AI (mistral-embed, 1024 dimensions)
 * Free tier: 1M tokens/month — more than enough for a knowledge base.
 * Docs: https://docs.mistral.ai/capabilities/embeddings/
 */

import { supabase } from '../lib/supabase';

// --- Mistral Embedding Config ---
const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY;
const MISTRAL_EMBED_MODEL = 'mistral-embed';
const MISTRAL_EMBED_URL = 'https://api.mistral.ai/v1/embeddings';

/**
 * Generate a 1024-dim embedding vector using Mistral's embedding API.
 * Returns [] if the API key is missing or the call fails (graceful degradation).
 * 
 * @param {string} text - Text to embed (max ~8k tokens per chunk is fine)
 * @returns {Array<number>} 1024-dim embedding vector, or [] on failure
 */
export async function generateEmbedding(text) {
  if (!MISTRAL_API_KEY) {
    console.warn('[ragService] No VITE_MISTRAL_API_KEY set — skipping embedding generation.');
    return [];
  }

  if (!text || text.trim().length === 0) {
    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetch(MISTRAL_EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: MISTRAL_EMBED_MODEL,
        input: [text]  // Mistral expects an array of strings
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `Mistral embedding error (${response.status}): ${errorBody?.message || errorBody?.detail || 'Unknown'}`
      );
    }

    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;

    if (!embedding || embedding.length === 0) {
      console.warn('[ragService] Mistral returned empty embedding.');
      return [];
    }

    return embedding; // 1024-dim float array
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('[ragService] Mistral embedding request timed out.');
    } else {
      console.error('[ragService] Embedding generation error:', error.message);
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
 * Semantic search in knowledge base using vector similarity.
 * Requires VITE_MISTRAL_API_KEY to generate the query embedding.
 */
export async function semanticSearch(query, limit = 5) {
  try {
    if (!MISTRAL_API_KEY) {
      console.warn('[ragService] No Mistral API key — semantic search disabled.');
      return [];
    }

    // Generate embedding for the user's query
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding.length) {
      return [];
    }

    // Search in Supabase using pgvector cosine similarity
    const { data, error } = await supabase.rpc('search_knowledge_base', {
      query_embedding: queryEmbedding,
      similarity_threshold: 0.7,
      match_count: limit
    });

    if (error) throw error;

    return (data || []).map(item => ({
      content: item.content,
      similarity: item.similarity,
      metadata: {
        documentId: item.document_id,
        title: item.document_title,
        pageNumber: item.page_number
      }
    }));
  } catch (error) {
    console.error('[ragService] Semantic search error:', error);
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
