/**
 * Vector Embedding & RAG Service
 * Handles document embeddings, storage, and semantic search using Supabase pgvector
 */

import { supabase } from '../lib/supabase';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const EMBEDDING_MODEL = 'models/text-embedding-004';
const EMBEDDING_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';

/**
 * Generate embeddings for text using Google Gemini API
 */
export async function generateEmbedding(text) {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY not configured');
  }

  const requestBody = {
    model: EMBEDDING_MODEL,
    content: {
      parts: [{ text }]
    }
  };

  try {
    const response = await fetch(`${EMBEDDING_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Embedding error: ${error.error?.message}`);
    }

    const data = await response.json();
    return data.embedding?.values || [];
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw error;
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
        embedding: embedding,
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
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

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
