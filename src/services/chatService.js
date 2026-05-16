/**
 * OpenAI-compatible chat service
 * Uses a local LLM that exposes the OpenAI API format.
 */

const OPENAI_BASE_URL = import.meta.env.VITE_OPENAI_BASE_URL || 'http://192.168.1.14/v1';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || 'local-model';

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

/**
 * Call the local chat API with context from knowledge base
 * @param {string} userMessage - User query
 * @param {Array} context - Retrieved document chunks from vector DB
 * @param {Array} chatHistory - Previous chat messages for context
 * @returns {Promise<Object>} AI response with citations
 */
export async function callChatWithContext(userMessage, context = [], chatHistory = []) {
  if (!OPENAI_API_KEY) {
    throw new Error('VITE_OPENAI_API_KEY environment variable is not set');
  }

  const systemPrompt = buildSystemPrompt(context);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role,
        content: msg.content
      })),
    { role: 'user', content: userMessage }
  ];

  const requestBody = {
    model: OPENAI_MODEL,
    messages,
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: 1024,
    stream: false
  };

  try {
    const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI-compatible API error: ${error.error?.message || error.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const textResponse = data.choices?.[0]?.message?.content || '';

    if (!textResponse.trim()) {
      return {
        response: buildFallbackResponse(userMessage),
        citations: extractCitations(context),
        sources: context.map(c => ({
          title: c.metadata?.title || 'Unknown',
          excerpt: c.content.substring(0, 200),
          documentId: c.metadata?.documentId
        })),
        fallback: true
      };
    }

    return {
      response: textResponse,
      citations: extractCitations(context),
      sources: context.map(c => ({
        title: c.metadata?.title || 'Unknown',
        excerpt: c.content.substring(0, 200),
        documentId: c.metadata?.documentId
      }))
    };
  } catch (error) {
    console.error('OpenAI-compatible API error:', error);
    return {
      response: buildFallbackResponse(userMessage),
      citations: extractCitations(context),
      sources: context.map(c => ({
        title: c.metadata?.title || 'Unknown',
        excerpt: c.content.substring(0, 200),
        documentId: c.metadata?.documentId
      })),
      fallback: true
    };
  }
}

export const callGeminiWithContext = callChatWithContext;

/**
 * Build system prompt with knowledge base context
 */
function buildSystemPrompt(context) {
  let prompt = `You are an AI assistant for DEVCON Kids, a nonprofit tech community organization.
You help volunteers, coordinators, and admins with onboarding, event planning, and operational guidance.

PERSONALITY:
- Sound like a helpful AI assistant, not a brochure or a policy memo
- Answer the question directly first, then add detail if useful
- Use short paragraphs and clean bullet points only when they improve readability
- Be concise, warm, and specific
- Always cite your sources from the knowledge base

RESPONSE STYLE:
- Start with a direct answer in one sentence when possible
- If you list items, put each item on its own line using a simple bullet
- Avoid dumping long walls of text
- If you are uncertain, say what you do know and what you do not know

CONFIDENCE RULES:
- You can confidently answer questions about DEVCON Kids mission, the platform modules, volunteer onboarding, event coordination, and high-level policies.
- If a question is outside those topics and not found in the knowledge base, say so clearly and offer the closest supported topic.

FACTS YOU CAN ALWAYS USE:
- Mission: ${DEVCON_KNOWLEDGE.mission}
- Audience: ${DEVCON_KNOWLEDGE.audience}
- Core pillars: ${DEVCON_KNOWLEDGE.pillars.join('; ')}
- Supported topics: ${DEVCON_KNOWLEDGE.topics.join('; ')}
- Platform modules: ${DEVCON_KNOWLEDGE.modules.join('; ')}

`;

  if (context.length > 0) {
    prompt += `KNOWLEDGE BASE CONTEXT:\n`;
    context.forEach((doc, idx) => {
      prompt += `\n[Source ${idx + 1}: ${doc.metadata?.title || 'Document'}]\n${doc.content}\n`;
    });
    prompt += `\nWhen answering questions, reference the above knowledge base documents by source number [Source X].
If information is not in the knowledge base, say "I don't have specific information about that in our knowledge base, but..."`;
  } else {
    prompt += `You have access to DEVCON Kids organizational information, but the knowledge base is currently empty.
When relevant, ask if the user would like to upload specific documentation.`;
  }

  return prompt;
}

function buildFallbackResponse(userMessage) {
  const normalized = userMessage.toLowerCase();

  if (normalized.includes('mission') || normalized.includes('about devcon kids')) {
    return `DEVCON Kids brings computer science education directly to students across the Philippines and makes tech accessible, fun, and equitable for children.

Core pillars:
• ${DEVCON_KNOWLEDGE.pillars.join('\n• ')}`;
  }

  if (normalized.includes('volunteer') || normalized.includes('onboard')) {
    return 'I can help with volunteer onboarding, directory management, and volunteer guidelines.\n\nFor example, I can explain:\n• how to add a volunteer\n• how to update a volunteer record\n• what a basic onboarding flow looks like';
  }

  if (normalized.includes('event') || normalized.includes('codecamp') || normalized.includes('schedule')) {
    return 'I can help with event planning and coordination, including creating events, editing event details, and understanding the Hour of AI / CodeCamp workflow.\n\nCommon things I can explain:\n• creating a new event\n• updating event details\n• organizing folder structure and assets';
  }

  if (normalized.includes('knowledge base') || normalized.includes('document') || normalized.includes('upload')) {
    return 'I can help with the Knowledge Base, including uploading documents and using them for grounded answers when search context is available.\n\nI can also explain:\n• supported file types\n• how document chunks are stored\n• how search context helps answers';
  }

  if (normalized.includes('admin') || normalized.includes('dashboard') || normalized.includes('role')) {
    return 'I can help with dashboard modules and access levels. Superadmin users can manage data, while visitor users can view the core pages and ask questions.\n\nIf you want, I can also summarize which pages are view-only and which ones allow editing.';
  }

  return `I can confidently help with these DEVCON Kids topics:\n• ${DEVCON_KNOWLEDGE.topics.join('\n• ')}\n\nTry asking one of the suggested questions below, and I\'ll answer in a clear, helpful way.`;
}

/**
 * Extract citations from context documents
 */
function extractCitations(context) {
  return context.map((doc, idx) => ({
    id: idx + 1,
    title: doc.metadata?.title || 'Document',
    documentId: doc.metadata?.documentId,
    source: doc.metadata?.source || 'Knowledge Base'
  }));
}

/**
 * Generate session summary using the local chat API
 */
export async function generateSessionSummary(messages) {
  if (!OPENAI_API_KEY) {
    throw new Error('VITE_OPENAI_API_KEY environment variable is not set');
  }

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const requestBody = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Summarize conversations in 2-3 concise sentences.'
      },
      {
        role: 'user',
        content: `Summarize this conversation in 2-3 sentences:\n\n${conversationText}`
      }
    ],
    temperature: 0.5,
    max_tokens: 150,
    stream: false
  };

  try {
    const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error('Failed to generate summary');
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Conversation summary unavailable';
  } catch (error) {
    console.error('Summary generation error:', error);
    return null;
  }
}
