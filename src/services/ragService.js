/**
 * Vector Embedding & RAG Service
 * Routes through Supabase Edge Function (ai-embed) for embeddings and search.
 * Falls back to direct Mistral call if Edge Function is unavailable (transitional).
 * 
 * A06: Server-side Mistral via Edge Function.
 * 
 * ### What is RAG (Retrieval-Augmented Generation)?
 * Instead of asking an LLM to answer from its training data (which may be outdated
 * or generic), we RETRIEVE relevant documents from our own database first, then
 * AUGMENT the prompt with those documents, so the LLM GENERATES answers based on
 * real, specific organizational content. This eliminates hallucination.
 * 
 * ### What are embeddings?
 * An embedding is a list of numbers (a "vector") that represents the MEANING of text.
 * Similar texts produce similar vectors. We can compare vectors using cosine similarity
 * to find documents that are semantically related to a user's question — even if they
 * don't share exact keywords.
 * 
 * ### How this service fits in the pipeline:
 * 1. INGESTION: Upload → parse → chunk → this service embeds each chunk → store in DB
 * 2. QUERY: User asks question → this service embeds it → searches DB for similar chunks
 *    → returns the best matches → chatService uses them as context for the LLM
 */

import { supabase } from '../lib/supabase';

// --- Mistral Embedding Config (fallback only, remove after A06 verified) ---
// WHAT: Mistral's embedding API converts text into 1024-dimensional vectors.
// WHY fallback: The secure path goes through the Edge Function (server-side key).
// This direct path exists only while we transition — once Edge Functions are verified,
// VITE_MISTRAL_API_KEY will be removed from the client.
const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY;
const MISTRAL_EMBED_MODEL = 'mistral-embed';
const MISTRAL_EMBED_URL = 'https://api.mistral.ai/v1/embeddings';

// WHAT: Edge Function URL for server-side embedding.
// WHY: Same pattern as chatService — derive from Supabase URL for env portability.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const EDGE_EMBED_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ai-embed` : null;

/**
 * Generate a 1024-dim embedding vector.
 * Tries Edge Function first, falls back to direct Mistral.
 * Returns [] on any failure (graceful degradation).
 * 
 * ### What this does:
 * Converts a piece of text into a list of 1024 numbers (a "vector") that captures
 * the semantic meaning of that text. Two texts about the same topic will produce
 * vectors that are mathematically close to each other (high cosine similarity).
 * 
 * ### Why return [] on failure instead of throwing?
 * Embedding is used during both upload (non-critical — chunk can be stored without it)
 * and search (degrades to no results). Crashing the whole flow for one failed embed
 * would be worse than gracefully continuing with reduced functionality.
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
 * 
 * ### What this does:
 * After a document is parsed and split into chunks, this function:
 * 1. Generates an embedding (vector) for each chunk via Mistral
 * 2. Inserts the chunk text + vector into the knowledge_base table
 * 
 * ### Why batch processing (5 at a time)?
 * Generating embeddings requires API calls. Doing all chunks in parallel would
 * hit rate limits. Doing them one-by-one would be slow. Batches of 5 balance
 * speed and API friendliness.
 * 
 * ### Why store chunks with null embeddings?
 * If embedding generation fails for a chunk, we still store the text (with null vector).
 * The chunk won't appear in semantic search, but at least the document content isn't lost.
 * A re-embedding job could fill in the nulls later.
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
 * 
 * ### What this does:
 * Takes the user's question, converts it to a vector, then finds the most similar
 * document chunks in the database using pgvector's cosine distance operator (<=>).
 * 
 * ### How cosine similarity works:
 * Two vectors pointing in the same direction have similarity = 1 (identical meaning).
 * Perpendicular vectors = 0 (unrelated). The DB computes 1 - distance for each chunk
 * and returns the top matches above the threshold (0.3 = very loose, catches partial matches).
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
 * Confidence thresholds for Smart Doc Suggestions.
 * 
 * ### What are these?
 * After searching the knowledge base, we classify how confident we are in the results:
 * - HIGH (≥0.55): Strong match — the KB has good content for this question
 * - MEDIUM (≥0.4): Partial match — some relevant content but incomplete
 * - LOW/NONE (<0.4): The KB doesn't cover this topic well
 * 
 * ### Why does this matter?
 * The chatbot behaves differently based on confidence:
 * - High: Answer confidently with citations
 * - Medium: Answer with a note about gaps + suggest uploading more docs
 * - Low/None: Tell the user "I don't have info on this" + suggest a doc topic
 * This prevents the AI from guessing when it has no relevant context.
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
 * 
 * ### What this does:
 * This is the main function called before every chat message. It searches the
 * knowledge base for chunks related to the user's question and returns them
 * with a confidence assessment attached.
 * 
 * ### Why filter to similarity ≥ 0.5?
 * The DB search uses a loose threshold (0.3) to cast a wide net. But chunks below
 * 0.5 similarity are often noise — they share a few keywords but aren't really about
 * the same topic. We filter them out so the LLM gets clean, relevant context only.
 * If all results are below 0.5, we still pass the top 3 (better than nothing).
 * 
 * @param {string} userQuery - The user's question
 * @param {Array} chatHistory - Previous messages (unused for now, reserved for A09)
 * @returns {Array} chunks with _confidence property attached
 */
export async function retrieveContext(userQuery, chatHistory = []) { // eslint-disable-line no-unused-vars
  try {
    const results = await semanticSearch(userQuery, 3);

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
