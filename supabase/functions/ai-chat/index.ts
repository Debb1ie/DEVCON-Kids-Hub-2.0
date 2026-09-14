import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { buildCitations, buildProviderMessages } from './core.mjs';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json' },
});
const APPROVED_ROLES = ['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator', 'volunteer'];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });

  try {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Authentication required.', code: 'AUTH_REQUIRED' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const mistralKey = Deno.env.get('MISTRAL_API_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey || !mistralKey) {
      return json(503, { error: 'The AI service is temporarily unavailable.', code: 'AI_UNAVAILABLE' });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authResult = await userClient.auth.getUser();
    const user = authResult.data.user;
    if (authResult.error || !user) return json(401, { error: 'Authentication required.', code: 'AUTH_REQUIRED' });

    const roleResult = await userClient.rpc('has_role', { allowed_roles: APPROVED_ROLES });
    if (roleResult.error || roleResult.data !== true) {
      return json(403, { error: 'The AI assistant is unavailable for this account.', code: 'ROLE_DENIED' });
    }

    const body = await request.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const requestedSessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
    if (!message || message.length > 500) return json(400, { error: 'Enter a question of 500 characters or fewer.', code: 'INVALID_MESSAGE' });

    const server = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let sessionId = requestedSessionId;
    if (sessionId) {
      const owned = await server.from('ai_chat_sessions').select('id').eq('id', sessionId).eq('user_id', user.id).maybeSingle();
      if (owned.error || !owned.data) return json(403, { error: 'Conversation access was denied.', code: 'SESSION_DENIED' });
    } else {
      const created = await server.from('ai_chat_sessions').insert({ user_id: user.id, title: message.slice(0, 120) }).select('id').single();
      if (created.error) return json(503, { error: 'Unable to start the conversation.', code: 'HISTORY_UNAVAILABLE' });
      sessionId = created.data.id;
    }

    const historyResult = await server.from('ai_chat_messages')
      .select('role, content').eq('session_id', sessionId).eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(10);
    if (historyResult.error) return json(503, { error: 'Unable to load the conversation.', code: 'HISTORY_UNAVAILABLE' });

    const embeddingResponse = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${mistralKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'mistral-embed', input: [message] }),
    });
    if (!embeddingResponse.ok) return json(502, { error: 'The AI service could not process that question. Please retry.', code: 'PROVIDER_UNAVAILABLE' });
    const embeddingPayload = await embeddingResponse.json();
    const embedding = embeddingPayload?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      return json(502, { error: 'The AI service could not process that question. Please retry.', code: 'PROVIDER_UNAVAILABLE' });
    }

    const search = await server.rpc('search_knowledge_base_server', {
      query_embedding: embedding,
      similarity_threshold: 0.3,
      match_count: 5,
    });
    if (search.error) return json(503, { error: 'Knowledge retrieval is temporarily unavailable.', code: 'KNOWLEDGE_UNAVAILABLE' });
    const chunks = search.data || [];
    const recentHistory = [...historyResult.data].reverse();

    const provider = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${mistralKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        temperature: 0.2,
        max_tokens: 600,
        messages: buildProviderMessages(chunks, recentHistory, message),
      }),
    });
    if (!provider.ok) return json(502, { error: 'The AI service could not generate an answer. Please retry.', code: 'PROVIDER_UNAVAILABLE' });
    const providerPayload = await provider.json();
    const answer = providerPayload?.choices?.[0]?.message?.content?.trim();
    if (!answer) return json(502, { error: 'The AI service returned no answer. Please retry.', code: 'EMPTY_ANSWER' });

    const citations = buildCitations(chunks);
    const persisted = await server.from('ai_chat_messages').insert([
      { session_id: sessionId, user_id: user.id, role: 'user', content: message },
      { session_id: sessionId, user_id: user.id, role: 'assistant', content: answer.slice(0, 12000), citations },
    ]);
    if (persisted.error) return json(503, { error: 'The answer was generated but could not be saved. Please retry.', code: 'HISTORY_UNAVAILABLE' });
    await server.from('ai_chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId).eq('user_id', user.id);

    return json(200, {
      sessionId,
      response: answer,
      citations,
      model: 'mistral-small-latest',
      metrics: { inputTokens: providerPayload?.usage?.prompt_tokens || null, outputTokens: providerPayload?.usage?.completion_tokens || null },
    });
  } catch {
    return json(500, { error: 'The AI service is temporarily unavailable. Please retry.', code: 'AI_UNAVAILABLE' });
  }
});
