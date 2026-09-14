import { supabase } from '../lib/supabase';
import { authSessionLifecycle } from '../auth/sessionLifecycle';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const edgeChatUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/ai-chat` : null;

export class ChatServiceError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = 'ChatServiceError';
    this.code = code;
  }
}

const safeChatError = (status, code) => {
  if (status === 401 || code === 'AUTH_REQUIRED') return 'Please sign in again to use the AI assistant.';
  if (status === 403 || code === 'ROLE_DENIED' || code === 'SESSION_DENIED') return 'The AI assistant is unavailable for this account.';
  if (code === 'KNOWLEDGE_UNAVAILABLE') return 'Knowledge retrieval is temporarily unavailable. Please retry.';
  return 'Unable to connect to the AI service. Please retry.';
};

export async function callChatWithContext(userMessage, context = [], history = [], options = {}) {
  void context;
  void history;
  if (!edgeChatUrl) throw new ChatServiceError('The AI service is not configured.', 'AI_UNAVAILABLE');
  // Use the same restored/callback session accepted by AppState. A second
  // independent getSession() here can race PKCE persistence after navigation.
  const session = await authSessionLifecycle.requireSession(supabase.auth);
  if (!session?.access_token) throw new ChatServiceError('Please sign in again to use the AI assistant.', 'AUTH_REQUIRED');

  let response;
  try {
    response = await fetch(edgeChatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ message: userMessage, sessionId: options.sessionId || null }),
      signal: options.signal,
    });
  } catch (cause) {
    throw new ChatServiceError('Unable to connect to the AI service. Please retry.', 'NETWORK_ERROR', { cause });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ChatServiceError(safeChatError(response.status, payload?.code), payload?.code || 'AI_UNAVAILABLE');
  if (!payload?.response) throw new ChatServiceError('The AI service returned no answer. Please retry.', 'EMPTY_ANSWER');
  options.onFirstToken?.();
  options.onDelta?.(payload.response, payload.response);
  return {
    sessionId: payload.sessionId,
    response: payload.response,
    citations: payload.citations || [],
    sources: payload.citations || [],
    apiUsed: 'edge-function',
    model: payload.model || 'server-managed',
    metrics: payload.metrics || {},
  };
}

export const callGeminiWithContext = callChatWithContext;
