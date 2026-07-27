/**
 * FAQ Auto-Builder Service
 * 
 * Tracks questions asked to the chatbot, identifies patterns,
 * and generates FAQ suggestions for admins to review.
 * 
 * Tables used:
 * - ai_faq_questions: logs every question with topic + confidence
 * - ai_faq_suggestions: grouped suggestions (pending/approved/dismissed)
 */

import { supabase } from '../lib/supabase';
import { generateEmbedding } from './ragService';

// --- Groq config (same as chatService) ---
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

// --- Topic Extraction ---
// Extracts normalized keywords from questions for FAQ grouping.
// The goal: different phrasings of the same question should produce overlapping keywords.
const STOP_WORDS = new Set([
  // Question words
  'what', 'whats', 'how', 'why', 'when', 'where', 'who', 'which', 'whom',
  // Pronouns & determiners
  'i', 'me', 'my', 'you', 'your', 'we', 'our', 'us', 'they', 'them', 'their',
  'he', 'she', 'it', 'his', 'her', 'its', 'this', 'that', 'these', 'those',
  'a', 'an', 'the', 'some', 'any', 'all', 'each', 'every',
  // Verbs (generic)
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'have', 'has', 'had', 'having',
  'will', 'would', 'could', 'should', 'can', 'may', 'might', 'shall',
  'get', 'got', 'make', 'made', 'let', 'take', 'give', 'go', 'come',
  'know', 'think', 'want', 'need', 'use', 'try', 'find', 'tell', 'ask',
  'work', 'works', 'help', 'start', 'keep', 'put', 'set', 'run', 'say',
  // Prepositions & conjunctions
  'to', 'of', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'up', 'out',
  'about', 'into', 'through', 'after', 'before', 'between', 'under', 'over',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'if', 'then', 'than',
  // Adverbs & fillers
  'not', 'no', 'yes', 'just', 'also', 'very', 'really', 'much', 'more',
  'like', 'well', 'still', 'already', 'even', 'only', 'again', 'here', 'there',
  // Common question filler
  'please', 'explain', 'describe', 'way', 'thing', 'something', 'anything',
  'new', 'different', 'possible', 'able', 'sure', 'right',
  'step', 'steps', 'process', 'procedure', 'method', 'approach'
]);

/**
 * Basic stemmer — reduces words to a root form for grouping.
 * Not perfect, but good enough to group volunteer/volunteers/volunteering.
 */
function stemWord(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ation') && w.length > 6) return w.slice(0, -5);
  if (w.endsWith('tion') && w.length > 6) return w.slice(0, -4);
  if (w.endsWith('ment') && w.length > 6) return w.slice(0, -4);
  if (w.endsWith('ness') && w.length > 6) return w.slice(0, -4);
  if (w.endsWith('ling') && w.length > 5) return w.slice(0, -4);
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('ers') && w.length > 5) return w.slice(0, -1);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && w.length > 4) return w.slice(0, -1);
  return w;
}

/**
 * Extract normalized keywords from a question.
 * Returns sorted array of stemmed meaningful words.
 */
function extractKeywords(question) {
  if (!question || typeof question !== 'string') return [];
  // Strip punctuation including smart quotes and contractions
  const cleaned = question.toLowerCase()
    .replace(/['']/g, '') // remove apostrophes (what's → whats)
    .replace(/[?!.,;:'"()""\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ');
  const meaningful = words.filter(w => !STOP_WORDS.has(w) && w.length > 2);
  const stemmed = meaningful.map(stemWord);
  return [...new Set(stemmed)].sort();
}

/**
 * Extract a normalized topic string from a question for storage.
 * Takes the top 3 keywords sorted alphabetically.
 */
function extractTopic(question) {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return 'general';
  return keywords.slice(0, 3).join(' ');
}

/**
 * Log a question to the tracking table.
 * Called after every user message in the chatbot.
 * Non-blocking — errors are swallowed to never disrupt chat.
 * 
 * Uses Mistral embeddings to find semantically similar questions for grouping.
 * Falls back to keyword-based topic matching if embedding fails.
 * 
 * @param {string} question - The user's question text
 * @param {string} confidenceLevel - 'high', 'medium', 'low', or 'none'
 * @param {string|null} userId - Current user's ID (optional)
 */
export async function logQuestion(question, confidenceLevel = 'high', userId = null) {
  try {
    if (!question || question.trim().length < 5) return; // Skip very short messages

    const topic = extractTopic(question);
    
    // Generate embedding for semantic grouping
    const embedding = await generateEmbedding(question);

    await supabase.from('ai_faq_questions').insert({
      question: question.trim().substring(0, 500),
      topic,
      confidence_level: confidenceLevel,
      user_id: userId,
      embedding: embedding.length > 0 ? embedding : null
    });

    // After logging, check if this question clusters with others
    if (embedding.length > 0) {
      await maybeCreateSuggestionByEmbedding(embedding, topic, question);
    } else {
      // Fallback: keyword-based matching
      await maybeCreateSuggestionByKeyword(topic, question);
    }
  } catch (error) {
    // Never crash the chat — logging is best-effort
    console.warn('[faqService] Failed to log question:', error.message);
  }
}

/**
 * Embedding-based suggestion creation.
 * Finds semantically similar questions using vector cosine similarity.
 * If 3+ similar questions exist → creates a FAQ suggestion.
 */
async function maybeCreateSuggestionByEmbedding(embedding, topic, latestQuestion) {
  try {
    // Find similar questions using pgvector cosine similarity
    const { data: similar, error } = await supabase.rpc('find_similar_faq_questions', {
      query_embedding: embedding,
      similarity_threshold: 0.75,
      match_count: 20
    });

    if (error) {
      console.warn('[faqService] Similarity search failed, falling back to keyword:', error.message);
      return await maybeCreateSuggestionByKeyword(topic, latestQuestion);
    }

    const count = (similar || []).length;
    if (count < 2) return; // Need at least 2 similar + the current one = 3 total

    // Use the most common topic among similar questions as the display label
    const topicCounts = {};
    (similar || []).forEach(q => {
      topicCounts[q.topic] = (topicCounts[q.topic] || 0) + 1;
    });
    const bestTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || topic;

    // Check if a suggestion already exists for this cluster
    // Use LIKE on the primary keyword of the best topic
    const primaryKeyword = bestTopic.split(' ')[0];
    const { data: existing } = await supabase
      .from('ai_faq_suggestions')
      .select('id, topic, question_count, sample_questions')
      .like('topic', `%${primaryKeyword}%`)
      .in('status', ['pending', 'approved'])
      .limit(1);

    const totalCount = count + 1; // similar results + the current question

    if (existing && existing.length > 0) {
      // Update existing suggestion
      const suggestion = existing[0];
      const samples = Array.isArray(suggestion.sample_questions) ? suggestion.sample_questions : [];
      if (samples.length < 5 && !samples.includes(latestQuestion.trim())) {
        samples.push(latestQuestion.trim().substring(0, 200));
      }
      await supabase
        .from('ai_faq_suggestions')
        .update({ question_count: totalCount, sample_questions: samples })
        .eq('id', suggestion.id);
    } else {
      // Create new suggestion with sample questions from the cluster
      const samples = (similar || [])
        .slice(0, 4)
        .map(q => q.question.substring(0, 200));
      samples.push(latestQuestion.trim().substring(0, 200));

      await supabase.from('ai_faq_suggestions').insert({
        topic: bestTopic,
        sample_questions: [...new Set(samples)].slice(0, 5),
        question_count: totalCount,
        status: 'pending'
      });
    }
  } catch (error) {
    console.warn('[faqService] Embedding-based suggestion failed:', error.message);
  }
}

/**
 * Keyword-based fallback for suggestion creation.
 * Used when embedding generation fails (no API key, network error, etc.)
 */
async function maybeCreateSuggestionByKeyword(topic, latestQuestion) {
  try {
    const keywords = topic.split(' ');
    if (keywords.length === 0 || topic === 'general') return;

    const { count, error: countError } = await supabase
      .from('ai_faq_questions')
      .select('*', { count: 'exact', head: true })
      .like('topic', `%${keywords[0]}%`);

    if (countError || !count || count < 3) return;

    const { data: existing } = await supabase
      .from('ai_faq_suggestions')
      .select('id, topic, question_count, sample_questions')
      .like('topic', `%${keywords[0]}%`)
      .in('status', ['pending', 'approved'])
      .limit(1);

    if (existing && existing.length > 0) {
      const suggestion = existing[0];
      const samples = Array.isArray(suggestion.sample_questions) ? suggestion.sample_questions : [];
      if (samples.length < 5 && !samples.includes(latestQuestion.trim())) {
        samples.push(latestQuestion.trim().substring(0, 200));
      }
      await supabase
        .from('ai_faq_suggestions')
        .update({ question_count: count, sample_questions: samples })
        .eq('id', suggestion.id);
    } else {
      const { data: sampleRows } = await supabase
        .from('ai_faq_questions')
        .select('question')
        .like('topic', `%${keywords[0]}%`)
        .order('created_at', { ascending: false })
        .limit(5);

      const samples = (sampleRows || []).map(r => r.question.substring(0, 200));

      await supabase.from('ai_faq_suggestions').insert({
        topic,
        sample_questions: samples,
        question_count: count,
        status: 'pending'
      });
    }
  } catch (error) {
    console.warn('[faqService] Keyword-based suggestion failed:', error.message);
  }
}

/**
 * Get all FAQ suggestions for the admin panel.
 * @param {string} status - Filter by status: 'pending', 'approved', 'dismissed', or 'all'
 */
export async function getFAQSuggestions(status = 'all') {
  try {
    let query = supabase
      .from('ai_faq_suggestions')
      .select('*')
      .order('question_count', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[faqService] Failed to fetch suggestions:', error);
    return [];
  }
}

/**
 * Update a FAQ suggestion's status (approve, dismiss, etc.)
 * @param {number} id - Suggestion ID
 * @param {string} status - New status: 'approved', 'dismissed', 'pending'
 * @param {string|null} userId - Admin user who reviewed
 */
export async function updateSuggestionStatus(id, status, userId = null) {
  try {
    const { error } = await supabase
      .from('ai_faq_suggestions')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId
      })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[faqService] Failed to update suggestion:', error);
    return false;
  }
}

/**
 * Update the suggested answer for a FAQ entry.
 * @param {number} id - Suggestion ID
 * @param {string} answer - The suggested answer text
 */
export async function updateSuggestionAnswer(id, answer) {
  try {
    const { error } = await supabase
      .from('ai_faq_suggestions')
      .update({ suggested_answer: answer })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[faqService] Failed to update answer:', error);
    return false;
  }
}

/**
 * Delete a FAQ suggestion permanently.
 * @param {number} id - Suggestion ID
 */
export async function deleteSuggestion(id) {
  try {
    const { error } = await supabase
      .from('ai_faq_suggestions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[faqService] Failed to delete suggestion:', error);
    return false;
  }
}

/**
 * Get question stats (total questions, topics, low-confidence count).
 * Used on the FAQ admin dashboard.
 */
export async function getQuestionStats() {
  try {
    const { count: totalQuestions } = await supabase
      .from('ai_faq_questions')
      .select('*', { count: 'exact', head: true });

    const { count: lowConfidence } = await supabase
      .from('ai_faq_questions')
      .select('*', { count: 'exact', head: true })
      .in('confidence_level', ['low', 'none']);

    const { count: pendingSuggestions } = await supabase
      .from('ai_faq_suggestions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    return {
      totalQuestions: totalQuestions || 0,
      lowConfidence: lowConfidence || 0,
      pendingSuggestions: pendingSuggestions || 0
    };
  } catch (error) {
    console.error('[faqService] Failed to get stats:', error);
    return { totalQuestions: 0, lowConfidence: 0, pendingSuggestions: 0 };
  }
}

/**
 * Generate a suggested answer for a FAQ topic using Groq.
 * Uses the sample questions to generate a comprehensive, concise answer.
 * 
 * @param {string} topic - The FAQ topic
 * @param {Array} sampleQuestions - Array of sample question strings
 * @returns {string} Generated answer text, or empty string on failure
 */
export async function generateFAQAnswer(topic, sampleQuestions = []) {
  try {
    if (!GROQ_API_KEY) {
      console.warn('[faqService] No Groq API key — cannot generate answer.');
      return '';
    }

    const questionsText = sampleQuestions.slice(0, 5).map((q, i) => `${i + 1}. ${q}`).join('\n');

    const response = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a knowledge base writer for DEVCON Kids, an organization that brings computer science education to children in the Philippines. Write clear, helpful, concise FAQ answers. Use bullet points for steps. Keep answers under 200 words.'
          },
          {
            role: 'user',
            content: `Generate a FAQ answer for the topic "${topic}". Here are sample questions users have asked:\n\n${questionsText}\n\nWrite a comprehensive answer that addresses all these variations. Be specific and actionable.`
          }
        ],
        temperature: 0.4,
        max_tokens: 512
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq API error (${response.status})`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    return answer || '';
  } catch (error) {
    console.error('[faqService] Failed to generate FAQ answer:', error);
    return '';
  }
}

/**
 * Add an approved FAQ entry to the Knowledge Base.
 * Embeds the content and stores it as a new chunk in the knowledge_base table.
 * 
 * @param {string} topic - The FAQ topic
 * @param {string} answer - The approved answer text
 * @param {Array} sampleQuestions - Original questions (stored as metadata)
 * @returns {boolean} true if successfully added to KB
 */
export async function addFAQToKnowledgeBase(topic, answer, sampleQuestions = []) {
  try {
    if (!answer || answer.trim().length < 10) {
      console.warn('[faqService] Answer too short to add to KB.');
      return false;
    }

    // Format the content: include the questions + answer for better vector matching
    const formattedContent = `FAQ: ${topic}\n\nCommon questions:\n${sampleQuestions.slice(0, 3).map(q => `- ${q}`).join('\n')}\n\nAnswer:\n${answer}`;

    // Generate embedding for the FAQ content
    const embedding = await generateEmbedding(formattedContent);

    // Create a document entry for this FAQ
    const docId = `faq_${Date.now()}`;
    const docTitle = `FAQ: ${topic}`;

    // Insert document metadata
    await supabase.from('documents').insert({
      id: docId,
      title: docTitle,
      file_type: 'faq',
      total_chunks: 1,
      total_pages: 1,
      file_size_bytes: formattedContent.length,
      created_at: new Date().toISOString()
    });

    // Insert the knowledge base chunk with embedding
    const { error } = await supabase.from('knowledge_base').insert({
      document_id: docId,
      document_title: docTitle,
      content: formattedContent,
      embedding: embedding.length > 0 ? embedding : null,
      page_number: 1,
      created_at: new Date().toISOString()
    });

    if (error) throw error;

    console.log(`[faqService] Added FAQ to Knowledge Base: "${topic}"`);
    return true;
  } catch (error) {
    console.error('[faqService] Failed to add FAQ to Knowledge Base:', error);
    return false;
  }
}
