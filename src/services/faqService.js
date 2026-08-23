/**
 * FAQ Auto-Builder Service
 * 
 * ### What this does:
 * Creates a feedback loop that automatically identifies knowledge gaps:
 * 1. Every chatbot question is LOGGED with its embedding and confidence level
 * 2. Questions are CLUSTERED by semantic similarity (embedding cosine distance)
 * 3. When 3+ similar questions accumulate, a FAQ SUGGESTION is created for admin review
 * 4. Admins can GENERATE an answer via AI, review it, and PUBLISH it to the knowledge base
 * 
 * ### Why this matters:
 * Without this, admins would never know what questions the chatbot struggles with.
 * This service surfaces patterns ("people keep asking about X but we have no docs")
 * so admins can proactively fill knowledge gaps — making the chatbot smarter over time.
 * 
 * ### Tables used:
 * - ai_faq_questions: logs every question with topic + confidence + embedding
 * - ai_faq_suggestions: grouped suggestions (pending/approved/dismissed)
 */

import { supabase } from '../lib/supabase';
import { generateEmbedding } from './ragService';

// --- Groq config (same as chatService) ---
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Extract a normalized topic label from a question for display/storage.
 * Takes first 3 meaningful words (>3 chars, not common fillers).
 */
function extractTopic(question) {
  if (!question || typeof question !== 'string') return 'general';
  const fillers = new Set(['what', 'how', 'why', 'when', 'where', 'who', 'the', 'is', 'are', 'can', 'do', 'does', 'will', 'would', 'could', 'should', 'about', 'this', 'that', 'please', 'tell', 'explain']);
  const words = question.toLowerCase().replace(/[?!.,;:'"]/g, '').split(/\s+/);
  const meaningful = words.filter(w => w.length > 3 && !fillers.has(w));
  if (meaningful.length === 0) return 'general';
  return meaningful.slice(0, 3).join(' ');
}

/**
 * Log a question to the tracking table.
 * Called after every user message in the chatbot.
 * Non-blocking — errors are swallowed to never disrupt chat.
 * 
 * ### Why non-blocking?
 * This is called via `.catch(() => {})` from AIChat.jsx. If logging fails
 * (DB down, network issue), the user's chat experience is unaffected.
 * FAQ tracking is a background enhancement, not a critical path.
 * 
 * ### Why embed the question here?
 * The embedding allows semantic clustering later — we compare new questions
 * against existing ones using vector similarity, not just keyword matching.
 * "How do I volunteer?" and "What's the process for joining as a helper?"
 * are different words but same meaning — embeddings catch that.
 * 
 * @param {string} question - The user's question text
 * @param {string} confidenceLevel - 'high', 'medium', 'low', or 'none'
 * @param {string|null} userId - Current user's ID (optional)
 */
export async function logQuestion(question, confidenceLevel = 'high', userId = null) {
  try {
    if (!question || question.trim().length < 5) return;

    // Respect the enableFAQ toggle from AI settings (check localStorage cache)
    try {
      const settings = JSON.parse(localStorage.getItem('aiSettings') || '{}');
      if (settings.enableFAQ === false) return; // FAQ tracking disabled by admin
    } catch { /* proceed if localStorage unavailable */ }

    const topic = extractTopic(question);
    const embedding = await generateEmbedding(question);

    await supabase.from('ai_faq_questions').insert({
      question: question.trim().substring(0, 500),
      topic,
      confidence_level: confidenceLevel,
      user_id: userId,
      embedding: embedding.length > 0 ? embedding : null
    });

    // Only cluster via embeddings — if no embedding, skip clustering
    if (embedding.length > 0) {
      await maybeCreateSuggestionByEmbedding(embedding, topic, question);
    }
  } catch (error) {
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
    const { data: similar, error } = await supabase.rpc('find_similar_faq_questions', {
      query_embedding: embedding,
      similarity_threshold: 0.75,
      match_count: 20
    });

    if (error) {
      console.warn('[faqService] Similarity search failed:', error.message);
      return;
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

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
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

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
