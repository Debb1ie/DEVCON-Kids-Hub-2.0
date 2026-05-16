/**
 * Gemini API Service
 * Handles all Google Gemini AI interactions
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

/**
 * Call Gemini API with context from knowledge base
 * @param {string} userMessage - User query
 * @param {Array} context - Retrieved document chunks from vector DB
 * @param {Array} chatHistory - Previous chat messages for context
 * @returns {Promise<Object>} AI response with citations
 */
export async function callGeminiWithContext(userMessage, context = [], chatHistory = []) {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY environment variable is not set');
  }

  // Build the system prompt with knowledge base context
  const systemPrompt = buildSystemPrompt(context);

  // Prepare messages for the API
  const messages = [
    ...chatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    })),
    {
      role: 'user',
      parts: [{ text: userMessage }]
    }
  ];

  const requestBody = {
    contents: messages,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
    },
  };

  try {
    const response = await fetch(`${API_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
    console.error('Gemini API error:', error);
    throw error;
  }
}

/**
 * Build system prompt with knowledge base context
 */
function buildSystemPrompt(context) {
  let prompt = `You are an AI assistant for DEVCON Kids, a nonprofit tech community organization.
You help volunteers, coordinators, and admins with onboarding, event planning, and operational guidance.

PERSONALITY:
- Professional but warm and encouraging
- Patient and supportive, especially for newcomers
- Clear and concise explanations
- Always cite your sources from the knowledge base

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
 * Generate session summary using Gemini
 */
export async function generateSessionSummary(messages) {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY environment variable is not set');
  }

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{
        text: `Summarize this conversation in 2-3 sentences:\n\n${conversationText}`
      }]
    }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 150,
    },
  };

  try {
    const response = await fetch(`${API_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error('Failed to generate summary');
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Conversation summary unavailable';
  } catch (error) {
    console.error('Summary generation error:', error);
    return null;
  }
}
