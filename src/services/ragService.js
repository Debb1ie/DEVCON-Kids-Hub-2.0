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
 * Generate embeddings for text using the local OpenAI-compatible API
 */
export async function generateEmbedding(text) {
  if (!OPENAI_API_KEY) {
    return [];
  }

  const requestBody = {
    model: OPENAI_EMBEDDING_MODEL,
    input: text
  };

  try {
    const response = await fetch(OPENAI_EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Embedding error: ${error.error?.message || error.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
  } catch (error) {
    console.error('Embedding generation error:', error);
    return [];
  }
}

/**
 * Store document chunks in vector database (Supabase pgvector)
 */
export async function storeDocumentChunks(documentId, documentTitle, chunks) {
  try {
    const chunkRecords = [];

    for (const chunk of chunks) {
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

    if (error) throw error;
    return chunkRecords.length;
  } catch (error) {
    console.error('Error storing document chunks:', error);
    throw error;
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
