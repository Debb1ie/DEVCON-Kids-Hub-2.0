/**
 * Anthropic-powered chat service with streaming, retries, caching, and context trimming.
 */

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const CLAUDE_HAIKU_MODEL = import.meta.env.VITE_ANTHROPIC_HAIKU_MODEL || 'claude-3-5-haiku-20241022';
const CLAUDE_SONNET_MODEL = import.meta.env.VITE_ANTHROPIC_SONNET_MODEL || 'claude-3-5-sonnet-20241022';
const MAX_HISTORY_MESSAGES = 10;
const MAX_APPROX_TOKENS = 4000;
const CACHE_TTL_MS = 5 * 60 * 1000;

const responseCache = new Map();

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
    'Chapters',
    'Volunteers',
    'Inventory',
    'Events & CodeCamps',
    'Knowledge Base',
    'AI Settings',
    'Admin'
  ]
};

export async function callChatWithContext(userMessage, context = [], chatHistory = [], options = {}) {
  const systemPrompt = buildSystemPrompt(context);
  const selectedModel = selectModel(userMessage);
  const conversationMessages = prepareConversationMessages(chatHistory, userMessage);
  const cacheKey = buildCacheKey(userMessage, context, selectedModel);

  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  const requestPromise = runWithRetries(async () => {
    if (!ANTHROPIC_API_KEY) {
      return buildFallbackPayload(userMessage, context, 'fallback');
    }

    return streamAnthropicResponse({
      apiKey: ANTHROPIC_API_KEY,
      model: selectedModel,
      systemPrompt,
      messages: conversationMessages,
      context,
      onDelta: options.onDelta,
      onFirstToken: options.onFirstToken,
      onUsage: options.onUsage
    });
  }, { userMessage, context, conversationMessages, selectedModel, systemPrompt });

  writeCache(cacheKey, requestPromise);
  return requestPromise;
}

async function streamAnthropicResponse({ apiKey, model, systemPrompt, messages, context, onDelta, onFirstToken, onUsage }) {
  const requestBody = {
    model,
    max_tokens: 1024,
    temperature: 0.4,
    system: systemPrompt,
    messages,
    stream: true
  };

  const response = await fetch(ANTHROPIC_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(await parseAnthropicError(response));
  }

  if (!response.body) {
    throw new Error('Streaming response body was not available.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let responseText = '';
  let sawFirstToken = false;
  let usage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const rawEvent of events) {
      const event = parseSseEvent(rawEvent);
      if (!event) continue;

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        const delta = event.delta.text || '';
        if (!sawFirstToken) {
          sawFirstToken = true;
          onFirstToken?.();
        }
        responseText += delta;
        onDelta?.(delta, responseText);
      }

      if (event.type === 'message_delta' && event.usage) {
        usage = event.usage;
        onUsage?.(usage);
      }
    }
  }

  if (!responseText.trim()) {
    throw new Error('The model returned an empty response.');
  }

  return buildSuccessPayload(responseText, model, messages, context, usage);
}

export const callGeminiWithContext = callChatWithContext;

function buildSystemPrompt(context) {
  let prompt = `You are the DEVCON Kids AI Assistant.

Persona:
- Friendly, concise, calm, and helpful.
- You speak like a knowledgeable program coordinator who understands education, events, and volunteer operations.
- You support the DEVCON Kids community without sounding robotic or overly formal.

Scope:
- Answer questions about DEVCON Kids, Hour of AI, chapters, volunteers, workshops, events, inventory, knowledge base documents, and admin workflows.
- Help users understand how the app works and how to complete tasks inside the platform.
- If the answer is not in the provided context, say so clearly and give the best safe guidance you can.

Rules:
- Be concise by default.
- Use short paragraphs and bullet points when listing items or steps.
- If the user asks for a process, give a clear step-by-step answer.
- If you are uncertain, say what is unknown instead of guessing.
- Prefer practical guidance over long explanations.
- When helpful, mention relevant DEVCON Kids modules and next actions.

App context:
- DEVCON Kids is a nonprofit education platform focused on making computer science and AI accessible to children in the Philippines.
- Core programs include Hour of AI, workshops, code camps, chapter-led activities, and educator or volunteer support.
- Typical users include volunteers, coordinators, chapter leads, admins, and learners.
- Main modules include Chapters, Volunteers, Inventory, Events, Knowledge Base, AI Settings, and Admin tools.
- The app helps manage chapter activity, volunteer onboarding, event planning, workshop coordination, and knowledge base searches.

Style guide:
- Be warm, direct, and structured.
- Use bullets for lists.
- Keep answers easy to scan.
- Avoid unnecessary filler.

Mission: ${DEVCON_KNOWLEDGE.mission}
Audience: ${DEVCON_KNOWLEDGE.audience}
Modules: ${DEVCON_KNOWLEDGE.modules.join(', ')}
`;

  if (context.length > 0) {
    prompt += `\nKnowledge base context:\n`;
    context.forEach((doc, idx) => {
      prompt += `\n[Source ${idx + 1}: ${doc.metadata?.title || 'Document'}]\n${doc.content}\n`;
    });
    prompt += `\nWhen answering, prioritize the provided context over general knowledge. If a fact comes from a source, mention the source naturally.`;
  }

  return prompt;
}

function prepareConversationMessages(chatHistory, userMessage) {
  const normalizedHistory = chatHistory
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .slice(-MAX_HISTORY_MESSAGES)
    .map((msg) => ({
      role: msg.role,
      content: String(msg.content || '')
    }));

  const combined = [...normalizedHistory, { role: 'user', content: String(userMessage || '') }];
  return trimMessagesToTokenLimit(combined, MAX_APPROX_TOKENS);
}

function trimMessagesToTokenLimit(messages, maxApproxTokens) {
  const trimmed = [...messages];

  while (trimmed.length > 2 && estimateApproxTokens(trimmed) > maxApproxTokens) {
    trimmed.shift();
  }

  return trimmed;
}

function estimateApproxTokens(messages) {
  const totalChars = messages.reduce((sum, message) => sum + String(message.content || '').length, 0);
  return Math.ceil(totalChars / 4);
}

function selectModel(userMessage) {
  const wordCount = String(userMessage || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

  return wordCount > 0 && wordCount < 10 ? CLAUDE_HAIKU_MODEL : CLAUDE_SONNET_MODEL;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildCacheKey(userMessage, context, model) {
  const contextSignature = context
    .map((doc) => `${doc.metadata?.documentId || doc.metadata?.title || 'doc'}:${String(doc.content || '').slice(0, 160)}`)
    .join('||');

  return [model, normalizeText(userMessage), normalizeText(contextSignature)].join('::');
}

function readCache(cacheKey) {
  const entry = responseCache.get(cacheKey);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return entry.value ? Promise.resolve(entry.value) : entry.promise;
}

function writeCache(cacheKey, promise) {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  const entry = {
    promise: promise.then((value) => {
      const current = responseCache.get(cacheKey);
      if (current) {
        current.value = value;
        current.promise = null;
        current.expiresAt = expiresAt;
      }
      return value;
    }).catch((error) => {
      responseCache.delete(cacheKey);
      throw error;
    }),
    value: null,
    expiresAt
  };

  responseCache.set(cacheKey, entry);

  setTimeout(() => {
    const current = responseCache.get(cacheKey);
    if (current && current.expiresAt <= Date.now()) {
      responseCache.delete(cacheKey);
    }
  }, CACHE_TTL_MS);
}

async function runWithRetries(executor, metadata) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await executor();
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error('[Chat] Anthropic request failed after retries:', error, metadata);
        return buildFailurePayload(metadata.userMessage, metadata.context, error);
      }

      console.warn(`[Chat] Attempt ${attempt} failed, retrying in 1 second:`, error);
      await sleep(1000);
    }
  }

  return buildFailurePayload(metadata.userMessage, metadata.context, new Error('Unknown chat failure'));
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSseEvent(rawEvent) {
  const dataLines = rawEvent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'));

  if (!dataLines.length) return null;

  const payload = dataLines
    .map((line) => line.replace(/^data:\s*/, ''))
    .join('\n');

  if (!payload || payload === '[DONE]') return null;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function parseAnthropicError(response) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || `Anthropic API error (${response.status})`;
  } catch {
    return `Anthropic API error (${response.status})`;
  }
}

function buildSuccessPayload(responseText, model, messages, context, usage) {
  return {
    response: responseText,
    citations: extractCitations(context),
    sources: context.map((doc) => ({
      title: doc.metadata?.title || 'Unknown',
      excerpt: String(doc.content || '').substring(0, 200),
      documentId: doc.metadata?.documentId
    })),
    apiUsed: 'anthropic',
    model,
    metrics: {
      inputTokens: usage?.input_tokens ?? estimateApproxTokens(messages),
      outputTokens: usage?.output_tokens ?? Math.max(1, Math.ceil(responseText.length / 4)),
      totalTokens: usage?.input_tokens && usage?.output_tokens ? usage.input_tokens + usage.output_tokens : undefined
    }
  };
}

function buildFallbackPayload(userMessage, context, apiUsed) {
  const responseText = buildEnhancedFallbackResponse(userMessage, context);

  return {
    response: responseText,
    citations: extractCitations(context),
    sources: context.map((doc) => ({
      title: doc.metadata?.title || 'Unknown',
      excerpt: String(doc.content || '').substring(0, 200),
      documentId: doc.metadata?.documentId
    })),
    apiUsed,
    model: 'fallback',
    metrics: {
      inputTokens: estimateApproxTokens([{ role: 'user', content: userMessage }]),
      outputTokens: Math.max(1, Math.ceil(responseText.length / 4))
    }
  };
}

function buildFailurePayload(userMessage, context, error) {
  const responseText = `I'm having trouble generating a live answer right now. Please try again in a moment.\n\nIf you want, I can still help with:\n${DEVCON_KNOWLEDGE.topics.map((topic) => `- ${topic}`).join('\n')}`;

  return {
    response: responseText,
    citations: extractCitations(context),
    sources: context.map((doc) => ({
      title: doc.metadata?.title || 'Unknown',
      excerpt: String(doc.content || '').substring(0, 200),
      documentId: doc.metadata?.documentId
    })),
    apiUsed: 'error',
    model: 'unknown',
    error: error?.message || 'Unknown error',
    metrics: {
      inputTokens: estimateApproxTokens([{ role: 'user', content: userMessage }]),
      outputTokens: Math.max(1, Math.ceil(responseText.length / 4))
    }
  };
}

function buildEnhancedFallbackResponse(userMessage, context) {
  const normalized = userMessage.toLowerCase();
  let response = '';

  if (normalized.match(/mission|purpose|about|goal/i)) {
    response = `# DEVCON Kids Mission & Impact\n\n${DEVCON_KNOWLEDGE.mission}\n\n**Core Pillars:**\n${DEVCON_KNOWLEDGE.pillars.map(p => `• ${p}`).join('\n')}`;
  } else if (normalized.match(/volunteer|onboard|role/i)) {
    response = `# Volunteer Support\n\nI can help with:\n• Creating volunteer profiles in the directory\n• Understanding different volunteer roles\n• Chapter assignment and engagement strategies\n• Setting clear expectations and responsibilities`;
  } else if (normalized.match(/event|codecamp|workshop/i)) {
    response = `# Event Planning & Coordination\n\nI can guide you through:\n• Setting up new events in the system\n• Organizing folder structures on Google Drive\n• Scheduling workshops across chapters\n• Hour of AI and CodeCamp implementation`;
  } else if (normalized.match(/knowledge base|document|upload/i)) {
    response = `# Knowledge Base & Document Management\n\nI can help with:\n• Uploading PDFs and resources\n• Managing document chunks and indexing\n• Semantic search across your documents\n• RAG (Retrieval Augmented Generation)`;
  } else if (normalized.match(/admin|dashboard|module/i)) {
    response = `# Dashboard & Admin Features\n\n**Available Modules:**\n${DEVCON_KNOWLEDGE.modules.map(m => `• ${m}`).join('\n')}\n\n**Common Tasks:**\n• Managing chapters and volunteer data\n• Configuring AI settings\n• Analyzing program metrics`;
  } else if (normalized.match(/inventory|asset|resource/i)) {
    response = `# Inventory & Resource Management\n\nI can help with:\n• Adding and updating inventory items\n• Tracking stock levels\n• Forecasting needs for events\n• Managing equipment across chapters`;
  } else if (normalized.match(/chapter|location|region/i)) {
    response = `# Chapter Management & Growth\n\nI can help with:\n• Creating and managing chapter profiles\n• Tracking learner numbers and workshops\n• Monitoring completion rates\n• Scaling programs to new locations`;
  } else {
    response = `# DEVCON Kids AI Assistant\n\nI'm here to provide strategic guidance. I can help with:\n${DEVCON_KNOWLEDGE.topics.map(t => `• ${t}`).join('\n')}\n\nWhat specific challenge can I help you with?`;
  }

  return response;
}

function buildFallbackResponse(userMessage) {
  const normalized = userMessage.toLowerCase();

  if (normalized.includes('mission') || normalized.includes('about devcon kids')) {
    return `DEVCON Kids brings computer science education directly to students across the Philippines and makes tech accessible, fun, and equitable for children.`;
  }

  if (normalized.includes('volunteer') || normalized.includes('onboard')) {
    return 'I can help with volunteer onboarding, directory management, and guidelines.';
  }

  if (normalized.includes('event') || normalized.includes('codecamp') || normalized.includes('workshop')) {
    return 'I can help with event planning, coordination, and understanding the Hour of AI / CodeCamp workflow.';
  }

  if (normalized.includes('knowledge base') || normalized.includes('document')) {
    return 'I can help with the Knowledge Base, document uploads, and grounded answers.';
  }

  if (normalized.includes('admin') || normalized.includes('dashboard')) {
    return 'I can help with dashboard modules and access levels.';
  }

  return `I can help with: ${DEVCON_KNOWLEDGE.topics.join(', ')}`;
}

function extractCitations(context) {
  return context.map((doc, idx) => ({
    id: idx + 1,
    title: doc.metadata?.title || 'Document',
    documentId: doc.metadata?.documentId,
    source: doc.metadata?.source || 'Knowledge Base'
  }));
}

export async function generateSessionSummary(messages) {
  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const summaryPrompt = `Provide a concise 2-3 sentence summary of this conversation:\n\n${conversationText}`;

  try {
    if (ANTHROPIC_API_KEY) {
      const response = await fetch(ANTHROPIC_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify({
          model: CLAUDE_HAIKU_MODEL,
          max_tokens: 256,
          temperature: 0.2,
          system: 'Summarize conversations in 2-3 concise sentences.',
          messages: [{ role: 'user', content: [{ type: 'text', text: summaryPrompt }] }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = extractAnthropicText(data);
        if (text.trim()) return text;
      }
    }
  } catch (err) {
    console.warn('Anthropic summary failed:', err);
  }

  return 'Summary generation unavailable - check API configuration';
}

function extractAnthropicText(data) {
  return data?.content?.map((part) => part.text || '').join('') || '';
}
