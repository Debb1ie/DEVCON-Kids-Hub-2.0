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
 * Requires VITE_MISTRAL_API_KEY to generate the query embedding.
 */
export async function semanticSearch(query, limit = 5) {
  try {
    if (!MISTRAL_API_KEY) {
      console.warn('[ragService] No Mistral API key — semantic search disabled.');
      return [];
    }

    // Generate embedding for the user's query
    console.log('[ragService] Generating query embedding for:', query.substring(0, 50));
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding.length) {
      console.warn('[ragService] Query embedding returned empty — cannot search.');
      return [];
    }

    console.log('[ragService] Query embedding generated, searching knowledge base...');

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
 * - HIGH: similarity >= 0.55 → confident answer, no suggestion needed
 * - MEDIUM: 0.4 <= similarity < 0.55 → partial match, mild suggestion
 * - LOW: similarity < 0.4 or no results → weak/no match, strong suggestion
 */
const CONFIDENCE_HIGH = 0.55;
const CONFIDENCE_MEDIUM = 0.4;

/**
 * Analyze search results and determine confidence level.
 * Returns metadata about how well the knowledge base covers the query.
 * 
 * Uses TWO signals:
 * 1. Max similarity score from vector search
 * 2. Relevance check — are results actually about the query topic?
 *    (low similarity + results = KB has docs but none match the question)
 */
function analyzeConfidence(results, userQuery) {
  if (!results || results.length === 0) {
    return {
      level: 'none',
      avgSimilarity: 0,
      maxSimilarity: 0,
      resultCount: 0,
      suggestion: extractTopicFromQuery(userQuery)
    };
  }

  const similarities = results.map(r => r.similarity);
  const maxSimilarity = Math.max(...similarities);
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

  // Signal 1: If all results have very similar scores (low variance) AND max is below
  // the high-confidence threshold, the KB probably doesn't have targeted content
  const variance = similarities.length > 1
    ? similarities.reduce((sum, s) => sum + Math.pow(s - avgSimilarity, 2), 0) / similarities.length
    : 0;
  const isLowVariance = variance < 0.003;

  // Signal 2: All results from same document with LOW similarity
  // This catches the "only a resume in KB" case where everything matches at ~0.35-0.5
  // But does NOT fire when similarity is high (document IS relevant even if it's the only one)
  const uniqueDocs = new Set(results.map(r => r.metadata?.documentId || r.metadata?.title)).size;
  const isSingleSource = uniqueDocs <= 1 && results.length > 1;

  // Only consider it noise if similarity is BELOW the high threshold
  // If maxSimilarity >= CONFIDENCE_HIGH, the content is relevant — don't second-guess it
  const isGenericMatch = maxSimilarity < CONFIDENCE_HIGH && (isLowVariance || isSingleSource);

  if (maxSimilarity >= CONFIDENCE_HIGH && !isGenericMatch) {
    return { level: 'high', avgSimilarity, maxSimilarity, resultCount: results.length, suggestion: null };
  }

  if (maxSimilarity >= CONFIDENCE_MEDIUM && !isGenericMatch) {
    return {
      level: 'medium',
      avgSimilarity,
      maxSimilarity,
      resultCount: results.length,
      suggestion: extractTopicFromQuery(userQuery)
    };
  }

  return {
    level: 'low',
    avgSimilarity,
    maxSimilarity,
    resultCount: results.length,
    suggestion: extractTopicFromQuery(userQuery)
  };
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
 * Returns context chunks AND confidence metadata for Smart Doc Suggestions.
 * 
 * @param {string} userQuery - The user's question
 * @returns {Object} { chunks: Array, confidence: Object }
 */
export async function retrieveContext(userQuery) {
  try {
    const results = await semanticSearch(userQuery, 5);
    const chunks = results.map(r => ({
      content: r.content,
      metadata: r.metadata,
      similarity: r.similarity
    }));
    const confidence = analyzeConfidence(results, userQuery);

    console.log(`[ragService] Smart Doc Suggestions — confidence: ${confidence.level}, max: ${confidence.maxSimilarity?.toFixed(3)}, avg: ${confidence.avgSimilarity?.toFixed(3)}, results: ${confidence.resultCount}${confidence.suggestion ? `, topic: "${confidence.suggestion}"` : ''}`);

    // Attach confidence as a property on the array for backward compatibility
    // (chatService expects an array, but AIChat.jsx can read the extra metadata)
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
