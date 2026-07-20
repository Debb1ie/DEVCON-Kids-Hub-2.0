/**
 * Chat Service — Groq-powered (Llama 3.3 70B) with streaming, retries, caching, and context trimming.
 * 
 * This service handles all AI chat interactions for the DEVCON Kids app.
 * Uses Groq's OpenAI-compatible API with Llama 3.3 70B model.
 * 
 * KEY EXPORTS (do not rename — AIChat.jsx depends on these):
 * - callChatWithContext(message, context, history, options) → {response, citations, sources, apiUsed, model, metrics}
 * - callGeminiWithContext — alias for callChatWithContext (backward compat)
 * - generateSessionSummary(messages) → string
 * 
 * NOTE: VITE_GROQ_API_KEY is temporary in frontend (Phase 1). Moves to Edge Function in Phase 2.
 */

import { supabase } from '../lib/supabase';

// --- Configuration ---
// Groq API (OpenAI-compatible format, free tier: 30 req/min, 14400/day)
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Chat behavior limits
const MAX_HISTORY_MESSAGES = 10;
const MAX_APPROX_TOKENS = 4000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory response cache
const responseCache = new Map();

// --- Built-in knowledge (fallback when API is unavailable) ---
const DEVCON_KNOWLEDGE = {
  mission: 'DEVCON Kids brings computer science education directly to students across the Philippines and makes tech accessible, fun, and equitable for children.',
  audience: 'Volunteers, coordinators, admins, and learners involved in DEVCON Kids programs.',
  pillars: [
    'Learning: engaging curriculum that makes coding fun',
    'Innovation: creativity and problem-solving through hands-on projects',
    'Development: reaching underserved communities and promoting equitable access'
  ],
  topics: [
    'Volunteer onboarding and guidelines',
    'Event planning and coordination',
    'FAQ and policy questions',
    'Knowledge base document uploads',
    'Admin dashboard and role-based access'
  ],
  modules: [
    'Chapters', 'Volunteers', 'Inventory',
    'Events & CodeCamps', 'Knowledge Base', 'AI Settings', 'Admin'
  ]
};

// --- Default AI Settings (overridden by admin config) ---
const defaultSettings = {
  aiName: 'DEVCON Kids Assistant',
  aiPersonality: 'Professional, warm, and encouraging. Patient with newcomers.',
  temperatureLevel: 0.7,
  maxContextChunks: 5
};


/**
 * Load AI settings from Supabase ai_settings table, falling back to localStorage, then defaults.
 * The ai_settings table is a single-row table (id=1) with all config as columns.
 */
async function loadAISettings() {
  try {
    const { data, error } = await supabase.from('ai_settings').select('*').eq('id', 1).single();
    if (!error && data) {
      // Cache in localStorage for offline/fast access
      localStorage.setItem('aiSettings', JSON.stringify(data));
      return { ...defaultSettings, ...data };
    }
  } catch { /* Supabase unavailable — fall through to localStorage */ }
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
  const systemPrompt = buildSystemPrompt(context, settings);
  const conversationMessages = prepareConversationMessages(chatHistory, userMessage);
  const cacheKey = buildCacheKey(userMessage, context, GROQ_MODEL);

  const cached = readCache(cacheKey);
  if (cached) return cached;

  const requestPromise = runWithRetries(async () => {
    if (!GROQ_API_KEY) return buildFallbackPayload(userMessage, context, 'fallback');
    return callGroqAPI({ systemPrompt, messages: conversationMessages, context, temperature: settings.temperatureLevel, onDelta: options.onDelta, onFirstToken: options.onFirstToken });
  }, { userMessage, context });

  writeCache(cacheKey, requestPromise);
  return requestPromise;
}

// Backward-compatible alias
export const callGeminiWithContext = callChatWithContext;

// ============================================================
// GROQ API CALL (OpenAI-compatible with streaming)
// ============================================================

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
// SESSION SUMMARY
// ============================================================

export async function generateSessionSummary(messages) {
  if (!GROQ_API_KEY) return 'Summary unavailable';
  try {
    const text = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const res = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: `Summarize in 2 sentences:\n\n${text}` }], temperature: 0.2, max_tokens: 100 })
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || 'Summary unavailable';
    }
  } catch (err) { console.warn('[chatService] Summary failed:', err); }
  return 'Summary unavailable';
}


// ============================================================
// SYSTEM PROMPT BUILDER
// ============================================================

function buildSystemPrompt(context, settings) {
  let prompt = `You are ${settings.aiName || 'the DEVCON Kids AI Assistant'}.

Persona: ${settings.aiPersonality || defaultSettings.aiPersonality}
You speak like a knowledgeable program coordinator who understands education, events, and volunteer operations.

Scope: Answer questions about DEVCON Kids, Hour of AI, chapters, volunteers, workshops, events, inventory, and admin workflows. If the answer is not in the provided context, say so clearly.

Rules: Be concise. Use bullet points for lists. If uncertain, say so. Mention relevant modules when helpful.

App modules: ${DEVCON_KNOWLEDGE.modules.join(', ')}
Mission: ${DEVCON_KNOWLEDGE.mission}
`;
  if (context.length > 0) {
    prompt += `\nKnowledge base context:\n`;
    context.forEach((doc, idx) => {
      prompt += `[Source ${idx + 1}: ${doc.metadata?.title || 'Document'}]\n${doc.content}\n\n`;
    });
    prompt += `Prioritize this context over general knowledge. Mention sources naturally.`;
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
// CACHING
// ============================================================

function buildCacheKey(msg, context, model) {
  const ctx = context.map(d => `${d.metadata?.documentId || 'doc'}:${String(d.content || '').slice(0, 160)}`).join('||');
  return [model, normalize(msg), normalize(ctx)].join('::');
}

function normalize(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function readCache(key) {
  const e = responseCache.get(key);
  if (!e) return null;
  if (e.expiresAt <= Date.now()) { responseCache.delete(key); return null; }
  return e.value ? Promise.resolve(e.value) : e.promise;
}

function writeCache(key, promise) {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  const entry = {
    promise: promise.then(v => { const c = responseCache.get(key); if (c) { c.value = v; c.promise = null; } return v; }).catch(e => { responseCache.delete(key); throw e; }),
    value: null, expiresAt
  };
  responseCache.set(key, entry);
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
  const text = buildFallbackResponse(userMessage);
  return {
    response: text, citations: extractCitations(context),
    sources: context.map(d => ({ title: d.metadata?.title || 'Unknown', excerpt: String(d.content || '').substring(0, 200), documentId: d.metadata?.documentId })),
    apiUsed, model: 'fallback', metrics: { inputTokens: 0, outputTokens: Math.ceil(text.length / 4) }
  };
}

function buildFailurePayload(userMessage, context, error) {
  const text = `I'm having trouble right now. Please try again.\n\nI can help with:\n${DEVCON_KNOWLEDGE.topics.map(t => `• ${t}`).join('\n')}`;
  return { response: text, citations: extractCitations(context || []), sources: [], apiUsed: 'error', model: 'unknown', error: error?.message, metrics: { inputTokens: 0, outputTokens: Math.ceil(text.length / 4) } };
}

function buildFallbackResponse(q) {
  const l = q.toLowerCase();
  if (l.match(/mission|purpose|about/)) return `**DEVCON Kids Mission**\n\n${DEVCON_KNOWLEDGE.mission}\n\n**Pillars:**\n${DEVCON_KNOWLEDGE.pillars.map(p => `• ${p}`).join('\n')}`;
  if (l.match(/volunteer|onboard/)) return `**Volunteer Support**\n\n• Profiles and directory\n• Understanding roles\n• Chapter assignments\n• Onboarding steps`;
  if (l.match(/event|workshop/)) return `**Events**\n\n• Creating events\n• Drive folder setup\n• Workshop scheduling`;
  return `**DEVCON Kids AI Assistant**\n\nI can help with:\n${DEVCON_KNOWLEDGE.topics.map(t => `• ${t}`).join('\n')}`;
}

function extractCitations(context) {
  if (!context?.length) return [];
  return context.map((d, i) => ({ id: i + 1, title: d.metadata?.title || 'Document', documentId: d.metadata?.documentId, source: 'Knowledge Base' }));
}
