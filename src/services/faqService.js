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

// --- Topic Extraction ---
// Reuses similar logic to ragService's extractTopicFromQuery but tuned for FAQ grouping
const STOP_WORDS = new Set([
  'what', 'is', 'the', 'how', 'do', 'i', 'can', 'you', 'tell', 'me', 'about',
  'please', 'explain', 'describe', 'a', 'an', 'to', 'of', 'for', 'in', 'on',
  'with', 'are', 'does', 'did', 'will', 'would', 'could', 'should', 'there',
  'their', 'they', 'this', 'that', 'where', 'when', 'who', 'which', 'why',
  'have', 'has', 'had', 'been', 'being', 'was', 'were', 'get', 'got', 'your',
  'our', 'my', 'its', 'his', 'her', 'we', 'us', 'them', 'and', 'but', 'or'
]);

/**
 * Extract a normalized topic from a user question for grouping.
 * Returns a short lowercase phrase representing the core topic.
 */
function extractTopic(question) {
  if (!question || typeof question !== 'string') return 'general';
  const words = question.toLowerCase().replace(/[?!.,;:'"()]/g, '').split(/\s+/);
  const meaningful = words.filter(w => !STOP_WORDS.has(w) && w.length > 2);
  if (meaningful.length === 0) return 'general';
  // Take up to 4 keywords to form the topic
  return meaningful.slice(0, 4).sort().join(' ');
}

/**
 * Log a question to the tracking table.
 * Called after every user message in the chatbot.
 * Non-blocking — errors are swallowed to never disrupt chat.
 * 
 * @param {string} question - The user's question text
 * @param {string} confidenceLevel - 'high', 'medium', 'low', or 'none'
 * @param {string|null} userId - Current user's ID (optional)
 */
export async function logQuestion(question, confidenceLevel = 'high', userId = null) {
  try {
    if (!question || question.trim().length < 5) return; // Skip very short messages

    const topic = extractTopic(question);

    await supabase.from('ai_faq_questions').insert({
      question: question.trim().substring(0, 500), // Cap at 500 chars
      topic,
      confidence_level: confidenceLevel,
      user_id: userId
    });

    // After logging, check if this topic needs a suggestion
    await maybeCreateSuggestion(topic, question);
  } catch (error) {
    // Never crash the chat — logging is best-effort
    console.warn('[faqService] Failed to log question:', error.message);
  }
}

/**
 * Check if a topic has enough questions to warrant a FAQ suggestion.
 * Creates a new suggestion if the topic has 3+ questions and no existing suggestion.
 */
async function maybeCreateSuggestion(topic, latestQuestion) {
  try {
    // Count how many times this topic has been asked
    const { count, error: countError } = await supabase
      .from('ai_faq_questions')
      .select('*', { count: 'exact', head: true })
      .eq('topic', topic);

    if (countError || !count || count < 3) return; // Need at least 3 questions

    // Check if a suggestion already exists for this topic
    const { data: existing } = await supabase
      .from('ai_faq_suggestions')
      .select('id, question_count, sample_questions')
      .eq('topic', topic)
      .in('status', ['pending', 'approved'])
      .limit(1);

    if (existing && existing.length > 0) {
      // Update the count and add sample question if not already there
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
      // Get sample questions for this topic
      const { data: sampleRows } = await supabase
        .from('ai_faq_questions')
        .select('question')
        .eq('topic', topic)
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
    console.warn('[faqService] Failed to create/update suggestion:', error.message);
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
