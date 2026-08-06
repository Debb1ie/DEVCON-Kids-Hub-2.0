/**
 * Vector Embedding & RAG Service
 * Routes through Supabase Edge Function (ai-embed) for embeddings and search.
 * Falls back to direct Mistral call if Edge Function is unavailable (transitional).
 * 
 * A06: Server-side Mistral via Edge Function.
 */

import { supabase } from '../lib/supabase';

// --- Mistral Embedding Config (fallback only, remove after A06 verified) ---
const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY;
const MISTRAL_EMBED_MODEL = 'mistral-embed';
const MISTRAL_EMBED_URL = 'https://api.mistral.ai/v1/embeddings';

// Edge Function URL
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const EDGE_EMBED_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ai-embed` : null;

/**
 * Generate a 1024-dim embedding vector.
 * Tries Edge Function first, falls back to direct Mistral.
 * Returns [] on any failure (graceful degradation).
 */
export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) return [];

  // Try Edge Function first (requires real Supabase session)
  if (EDGE_EMBED_URL) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch(EDGE_EMBED_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'embed', text }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.embedding?.length > 0) return data.embedding;
        }
      }
    } catch (e) {
      console.warn('[ragService] Edge Function embed failed, falling back:', e.message);
    }
  }

  // Fallback: direct Mistral call (used when no Supabase session or Edge Function unavailable)
  if (!MISTRAL_API_KEY) {
    console.warn('[ragService] No embedding source available — need either a Supabase session (for Edge Function) or VITE_MISTRAL_API_KEY.');
    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(MISTRAL_EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify({ model: MISTRAL_EMBED_MODEL, input: [text] }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(`Mistral embedding error (${response.status}): ${errorBody?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    return embedding?.length > 0 ? embedding : [];
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
    const BATCH_SIZE = 5; // Process 5 chunks at a time for parallel embedding
    let storedCount = 0;

    // Process chunks in batches to balance speed and API rate limits
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      
      // Generate embeddings in parallel within each batch
      const embeddingPromises = batch.map(chunk => generateEmbedding(chunk.content));
      const embeddings = await Promise.all(embeddingPromises);

      const chunkRecords = batch.map((chunk, idx) => ({
        document_id: documentId,
        document_title: documentTitle,
        content: chunk.content,
        embedding: embeddings[idx].length > 0 ? embeddings[idx] : null,
        page_number: chunk.pageNumber,
        created_at: new Date().toISOString()
      }));

      // Insert each batch separately — partial success is better than total failure
      const { error } = await supabase
        .from('knowledge_base')
        .insert(chunkRecords);

      if (error) {
        console.error(`[ragService] Failed to store batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
        // Continue with remaining batches — don't abort the whole upload
      } else {
        storedCount += chunkRecords.length;
      }
    }

    console.log(`[ragService] Stored ${storedCount}/${chunks.length} chunks for "${documentTitle}"`);
    return storedCount;
  } catch (error) {
    console.error('[ragService] Error storing document chunks:', error);
    return 0;
  }
}

/**
 * Semantic search in knowledge base using vector similarity.
 * Uses Edge Function or direct Mistral via generateEmbedding().
 */
export async function semanticSearch(query, limit = 5) {
  try {
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding.length) {
      console.warn('[ragService] Query embedding returned empty — cannot search.');
      return [];
    }

    // Search in Supabase using pgvector cosine similarity
    // Note: supabase-js handles array → vector conversion automatically
    const { data, error } = await supabase.rpc('search_knowledge_base', {
      query_embedding: queryEmbedding,
      similarity_threshold: 0.3,
      match_count: limit
    });

    if (error) throw error;

    console.log(`[ragService] Search returned ${data?.length || 0} results`);

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
 * Confidence thresholds for Smart Doc Suggestions
 */
const CONFIDENCE_HIGH = 0.55;
const CONFIDENCE_MEDIUM = 0.4;

/**
 * Analyze search results and determine confidence level.
 * Simple threshold-based: high/medium/low based on max similarity.
 */
function analyzeConfidence(results, userQuery) {
  if (!results || results.length === 0) {
    return { level: 'none', avgSimilarity: 0, maxSimilarity: 0, resultCount: 0, suggestion: extractTopicFromQuery(userQuery) };
  }

  const similarities = results.map(r => r.similarity);
  const maxSimilarity = Math.max(...similarities);
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

  if (maxSimilarity >= CONFIDENCE_HIGH) {
    return { level: 'high', avgSimilarity, maxSimilarity, resultCount: results.length, suggestion: null };
  }
  if (maxSimilarity >= CONFIDENCE_MEDIUM) {
    return { level: 'medium', avgSimilarity, maxSimilarity, resultCount: results.length, suggestion: extractTopicFromQuery(userQuery) };
  }
  return { level: 'low', avgSimilarity, maxSimilarity, resultCount: results.length, suggestion: extractTopicFromQuery(userQuery) };
}

/**
 * Extract a human-readable topic from the user's query for doc suggestions.
 * Strips common filler words and returns a concise topic phrase.
 */
function extractTopicFromQuery(query) {
  if (!query || typeof query !== 'string') return 'this topic';
  const stopWords = ['what', 'is', 'the', 'how', 'do', 'i', 'can', 'you', 'tell', 'me', 'about',
    'please', 'explain', 'describe', 'a', 'an', 'to', 'of', 'for', 'in', 'on', 'with', 'are', 'does',
    'did', 'will', 'would', 'could', 'should', 'there', 'their', 'they', 'this', 'that', 'where', 'when',
    'who', 'which', 'why', 'have', 'has', 'had', 'been', 'being', 'was', 'were', 'get', 'got'];
  const words = query.toLowerCase().replace(/[?!.,;:'"]/g, '').split(/\s+/);
  const meaningful = words.filter(w => !stopWords.includes(w) && w.length > 2);
  if (meaningful.length === 0) return query.substring(0, 40).trim();
  return meaningful.slice(0, 5).join(' ');
}

/**
 * Retrieve relevant context for RAG.
 * @param {string} userQuery - The user's question
 * @param {Array} chatHistory - Previous messages (unused for now, reserved for A09)
 * @returns {Array} chunks with _confidence property attached
 */
export async function retrieveContext(userQuery, chatHistory = []) {
  try {
    const results = await semanticSearch(userQuery, 5);

    // Filter out low-relevance chunks (below 0.5 = noise)
    const filtered = results.filter(r => r.similarity >= 0.5);
    const finalResults = filtered.length > 0 ? filtered : results.slice(0, 3);

    const chunks = finalResults.map(r => ({
      content: r.content,
      metadata: r.metadata,
      similarity: r.similarity
    }));
    const confidence = analyzeConfidence(finalResults, userQuery);

    // Attach confidence as a property on the array for backward compatibility
    // ponytail: monkey-patching arrays is ugly; refactor to {chunks, confidence} in A09
    chunks._confidence = confidence;
    return chunks;
  } catch (error) {
    console.error('Context retrieval error:', error);
    const empty = [];
    empty._confidence = { level: 'none', avgSimilarity: 0, maxSimilarity: 0, resultCount: 0, suggestion: extractTopicFromQuery(userQuery) };
    return empty;
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
