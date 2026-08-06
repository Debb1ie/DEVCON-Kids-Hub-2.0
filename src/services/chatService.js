/**
 * Chat Service — Routes through Supabase Edge Function (ai-chat).
 * Falls back to direct Groq call if Edge Function is unavailable (transitional).
 * 
 * KEY EXPORTS (do not rename — AIChat.jsx depends on these):
 * - callChatWithContext(message, context, history, options) → {response, citations, sources, apiUsed, model, metrics}
 * - callGeminiWithContext — alias (backward compat, remove when UI is updated)
 * 
 * A05: Server-side Groq via Edge Function. VITE_GROQ_API_KEY kept as fallback during transition.
 */

import { supabase } from '../lib/supabase';

// --- Configuration ---
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY; // ponytail: fallback only, remove after A05 verified
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MAX_HISTORY_MESSAGES = 10;
const MAX_APPROX_TOKENS = 4000;

const APP_MODULES = ['Chapters', 'Volunteers', 'Inventory', 'Events & CodeCamps', 'Knowledge Base', 'AI Settings', 'Admin'];

// Edge Function URL (derived from Supabase URL)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const EDGE_CHAT_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ai-chat` : null;

// --- Default AI Settings (overridden by admin config) ---
const defaultSettings = {
  aiName: 'DEVCON Kids Assistant',
  aiPersonality: 'Professional, warm, and encouraging. Patient with newcomers.',
  temperatureLevel: 0.7,
  maxContextChunks: 5
};


/**
 * Load AI settings from Supabase ai_settings table, falling back to localStorage, then defaults.
 */
async function loadAISettings() {
  try {
    const { data, error } = await supabase.from('ai_settings').select('*').eq('id', 1).single();
    if (!error && data) {
      localStorage.setItem('aiSettings', JSON.stringify(data));
      return { ...defaultSettings, ...data };
    }
  } catch { /* Supabase unavailable — fall through */ }
  try {
    const raw = localStorage.getItem('aiSettings');
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch { /* localStorage unavailable */ }
  return defaultSettings;
}

// ============================================================
// MAIN EXPORT: callChatWithContext
// ============================================================

/**
 * Send a message to the AI with optional RAG context and conversation history.
 * @param {string} userMessage - The user's question
 * @param {Array} context - RAG context chunks from ragService
 * @param {Array} chatHistory - Previous messages [{role, content}]
 * @param {Object} options - {onDelta, onFirstToken} callbacks for streaming
 * @returns {Object} {response, citations, sources, apiUsed, model, metrics}
 */
export async function callChatWithContext(userMessage, context = [], chatHistory = [], options = {}) {
  const settings = await loadAISettings();
  const confidence = context._confidence || null;
  const conversationMessages = prepareConversationMessages(chatHistory, userMessage);

  // Try Edge Function first (server-side, no key in browser)
  if (EDGE_CHAT_URL) {
    try {
      const result = await callEdgeChat(userMessage, context, chatHistory, settings, options);
      if (result) return result;
    } catch (e) {
      console.warn('[chatService] Edge Function failed, falling back to direct:', e.message);
    }
  }

  // Fallback: direct Groq call (transitional, remove after A05 verified)
  const systemPrompt = buildSystemPrompt(context, settings, confidence);
  return runWithRetries(async () => {
    if (!GROQ_API_KEY) return buildFallbackPayload(userMessage, context, 'fallback');
    return callGroqAPI({ systemPrompt, messages: conversationMessages, context, temperature: settings.temperatureLevel, onDelta: options.onDelta, onFirstToken: options.onFirstToken });
  }, { userMessage, context });
}

/**
 * Call the ai-chat Edge Function with streaming.
 * Returns null if the function is unreachable (triggers fallback).
 */
async function callEdgeChat(userMessage, context, chatHistory, settings, options) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null; // No auth = can't call Edge Function

  const response = await fetch(EDGE_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      message: userMessage,
      context: context.slice(0, 5).map(c => ({ content: c.content, metadata: c.metadata, similarity: c.similarity })),
      history: chatHistory.filter(m => m.role === 'user' || m.role === 'assistant').slice(-10).map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) })),
      temperature: settings.temperatureLevel,
    }),
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return null; // Auth issue, fall back
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Edge Function error (${response.status})`);
  }

  // Stream the SSE response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let responseText = '';
  let sawFirstToken = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.replace(/^data:\s*/, '');
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          if (!sawFirstToken) { sawFirstToken = true; options.onFirstToken?.(); }
          responseText += delta;
          options.onDelta?.(delta, responseText);
        }
      } catch { /* skip malformed chunks */ }
    }
  }

  if (!responseText.trim()) throw new Error('AI returned an empty response.');

  return {
    response: responseText,
    citations: extractCitations(context),
    sources: context.map(d => ({ title: d.metadata?.title || 'Unknown', excerpt: String(d.content || '').substring(0, 200), documentId: d.metadata?.documentId })),
    apiUsed: 'edge-function',
    model: GROQ_MODEL,
    metrics: { inputTokens: Math.ceil(userMessage.length / 4), outputTokens: Math.ceil(responseText.length / 4), totalTokens: Math.ceil((userMessage.length + responseText.length) / 4) }
  };
}

// Backward-compatible alias
export const callGeminiWithContext = callChatWithContext;

async function callGroqAPI({ systemPrompt, messages, context, temperature, onDelta, onFirstToken }) {
  const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  const response = await fetch(GROQ_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({ model: GROQ_MODEL, messages: apiMessages, temperature, max_tokens: 1024, stream: true })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Groq API error (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let responseText = '';
  let sawFirstToken = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.replace(/^data:\s*/, '');
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          if (!sawFirstToken) { sawFirstToken = true; onFirstToken?.(); }
          responseText += delta;
          onDelta?.(delta, responseText);
        }
      } catch { /* skip malformed chunks */ }
    }
  }

  if (!responseText.trim()) throw new Error('AI returned an empty response.');
  return buildSuccessPayload(responseText, GROQ_MODEL, messages, context);
}

// ============================================================
// SYSTEM PROMPT BUILDER
// ============================================================

function buildSystemPrompt(context, settings, confidence) {
  let prompt = `You are ${settings.aiName || 'the DEVCON Kids AI Assistant'}.

Persona: ${settings.aiPersonality || defaultSettings.aiPersonality}
You speak like a knowledgeable program coordinator who understands education, events, and volunteer operations.

Scope: Answer questions about DEVCON Kids, Hour of AI, chapters, volunteers, workshops, events, inventory, and admin workflows. If the answer is not in the provided context, say so clearly.

Rules:
- Be concise. Use bullet points for lists. If uncertain, say so.
- When citing numbers or statistics, ALWAYS include the time period they cover (e.g., "In 2025, DEVCON Kids reached 3,825 students"). Never combine figures from different years.
- If your source contains [VERIFY], tell the user: "Note: this information hasn't been officially confirmed yet."
- If a user raises a child safety or protection concern, do NOT attempt to provide guidance. Direct them to DEVCON Philippines' Child Protection Officer via devcon.ph/child-protection-policy and to local authorities if needed.
- Mention relevant modules when helpful.

App modules: ${APP_MODULES.join(', ')}
Mission: DEVCON Kids brings computer science education directly to students across the Philippines and makes tech accessible, fun, and equitable for children.
`;
  if (context.length > 0) {
    // Context summary — helps the LLM understand what's available before reading raw chunks
    const uniqueSources = [...new Set(context.map(d => d.metadata?.title || 'Document'))];
    const avgSim = (context.reduce((sum, d) => sum + (d.similarity || 0), 0) / context.length).toFixed(2);
    prompt += `\nContext summary: ${context.length} relevant chunks found from ${uniqueSources.length} source(s): ${uniqueSources.join(', ')}. Average relevance: ${avgSim}.\n\n`;
    
    prompt += `Knowledge base context:\n`;
    context.forEach((doc, idx) => {
      prompt += `[Source ${idx + 1}: ${doc.metadata?.title || 'Document'} | relevance: ${(doc.similarity || 0).toFixed(2)}]\n${doc.content}\n\n`;
    });
    prompt += `Prioritize this context over general knowledge. Cite sources by name when answering. If the context partially answers the question, say what you found and what's missing.`;
  }

  // Smart Doc Suggestions: instruct the AI about confidence level
  if (confidence && (confidence.level === 'low' || confidence.level === 'none')) {
    prompt += `\n\nIMPORTANT: The knowledge base has very little or no relevant information for this question. Be transparent — let the user know your answer is based on general knowledge, not uploaded documents. Keep your answer helpful but brief.`;
  } else if (confidence && confidence.level === 'medium') {
    prompt += `\n\nNote: The knowledge base has partial information on this topic. Answer using what's available, but mention if there are gaps in the documentation.`;
  }

  return prompt;
}

// ============================================================
// CONVERSATION HELPERS
// ============================================================

function prepareConversationMessages(chatHistory, userMessage) {
  const history = chatHistory
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .slice(-MAX_HISTORY_MESSAGES)
    .map(msg => ({ role: msg.role, content: String(msg.content || '') }));
  const combined = [...history, { role: 'user', content: String(userMessage || '') }];
  return trimMessagesToTokenLimit(combined, MAX_APPROX_TOKENS);
}

function trimMessagesToTokenLimit(messages, maxTokens) {
  const trimmed = [...messages];
  while (trimmed.length > 2 && estimateTokens(trimmed) > maxTokens) trimmed.shift();
  return trimmed;
}

function estimateTokens(messages) {
  return Math.ceil(messages.reduce((sum, m) => sum + String(m.content || '').length, 0) / 4);
}

// ============================================================
// RETRY LOGIC
// ============================================================

async function runWithRetries(executor, metadata) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await executor(); }
    catch (error) {
      if (attempt === 3) {
        console.error('[chatService] Failed after 3 retries:', error);
        return buildFailurePayload(metadata.userMessage, metadata.context, error);
      }
      console.warn(`[chatService] Attempt ${attempt} failed:`, error.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// ============================================================
// RESPONSE BUILDERS
// ============================================================

function buildSuccessPayload(text, model, messages, context) {
  return {
    response: text,
    citations: extractCitations(context),
    sources: context.map(d => ({ title: d.metadata?.title || 'Unknown', excerpt: String(d.content || '').substring(0, 200), documentId: d.metadata?.documentId })),
    apiUsed: 'groq',
    model,
    metrics: { inputTokens: estimateTokens(messages), outputTokens: Math.ceil(text.length / 4), totalTokens: estimateTokens(messages) + Math.ceil(text.length / 4) }
  };
}

function buildFallbackPayload(userMessage, context, apiUsed) {
  const text = 'I\'m currently unable to connect to the AI service. Please try again in a moment.';
  return {
    response: text, citations: extractCitations(context),
    sources: context.map(d => ({ title: d.metadata?.title || 'Unknown', excerpt: String(d.content || '').substring(0, 200), documentId: d.metadata?.documentId })),
    apiUsed, model: 'fallback', metrics: { inputTokens: 0, outputTokens: Math.ceil(text.length / 4) }
  };
}

function buildFailurePayload(userMessage, context, error) {
  const text = 'I\'m having trouble right now. Please try again shortly.';
  return { response: text, citations: extractCitations(context || []), sources: [], apiUsed: 'error', model: 'unknown', error: error?.message, metrics: { inputTokens: 0, outputTokens: Math.ceil(text.length / 4) } };
}

function extractCitations(context) {
  if (!context?.length) return [];
  return context.map((d, i) => ({ id: i + 1, title: d.metadata?.title || 'Document', documentId: d.metadata?.documentId, source: 'Knowledge Base' }));
}
