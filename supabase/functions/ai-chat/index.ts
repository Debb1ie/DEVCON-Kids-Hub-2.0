import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { actionRefusal, buildCitations, buildProviderMessages, buildStructuredSources, CHAT_ROLES, classifyQuery, completeWithFailover, deduplicateCitations, filterAuthorizedRecords, GroqLLMProvider, MistralLLMProvider, resolveRole, runProviderHealth, securityRefusal } from './core.mjs';

const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json', 'cache-control': 'no-store' } });
const requestLog = (fields: Record<string, unknown>) => console.info(JSON.stringify({ service: 'devcon-assistant', timestamp: new Date().toISOString(), ...fields }));
const limits = new Map<string, number[]>();
const rateLimited = (userId: string, now = Date.now()) => { const recent = (limits.get(userId) || []).filter((time) => now - time < 60000); if (recent.length >= 12) return true; recent.push(now); limits.set(userId, recent); return false; };
const timedFetch = (url: string, init: RequestInit, timeout = 15000) => fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  const requestId = crypto.randomUUID(); const started = Date.now();
  let userId = 'unknown'; let role = 'unknown'; let category = 'unknown';
  try {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Authentication required.', code: 'AUTH_REQUIRED', requestId });
    const supabaseUrl = Deno.env.get('SUPABASE_URL'); const anonKey = Deno.env.get('SUPABASE_ANON_KEY'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) return json(503, { error: 'The AI service is temporarily unavailable.', code: 'AI_UNAVAILABLE', requestId });
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    // This client intentionally has no persisted server session. Pass the
    // incoming browser JWT explicitly so getUser validates that caller rather
    // than attempting to resolve a nonexistent client-side session.
    const accessToken = authorization.slice('Bearer '.length).trim();
    const authResult = await userClient.auth.getUser(accessToken); const user = authResult.data.user;
    if (authResult.error) return json(401, { error: 'Authentication required.', code: 'INVALID_JWT', requestId });
    if (!user) return json(401, { error: 'Authentication required.', code: 'USER_LOOKUP_FAILED', requestId });
    userId = user.id;
    if (rateLimited(userId)) return json(429, { error: 'Too many questions. Please wait a minute and retry.', code: 'RATE_LIMITED', requestId });
    const body = await request.json().catch(() => null); const message = typeof body?.message === 'string' ? body.message.trim() : ''; const requestedSessionId = typeof body?.sessionId === 'string' ? body.sessionId : null;
    if (!message || message.length > 500) return json(400, { error: 'Enter a question of 500 characters or fewer.', code: 'INVALID_MESSAGE', requestId });
    category = classifyQuery(message);
    const server = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const roleResult = await server.from('user_roles').select('role,chapter_id').eq('user_id', user.id);
    if (roleResult.error) { requestLog({ requestId, userId, event: 'role_lookup_failed', errorCode: roleResult.error.code || null, safeError: roleResult.error.message?.slice(0, 160) || null }); return json(503, { error: 'Unable to verify assistant access.', code: 'AUTHORIZATION_UNAVAILABLE', requestId }); }
    const assignment = resolveRole(roleResult.data || []); role = assignment?.role || 'pending_volunteer';
    if (!assignment || !CHAT_ROLES.includes(role)) return json(403, { error: 'The AI assistant is unavailable for this account.', code: 'ROLE_DENIED', requestId });

    let sessionId = requestedSessionId;
    if (sessionId) {
      const owned = await server.from('ai_chat_sessions').select('id').eq('id', sessionId).eq('user_id', user.id).maybeSingle();
      if (owned.error || !owned.data) return json(403, { error: 'Conversation access was denied.', code: 'SESSION_DENIED', requestId });
    } else {
      const created = await server.from('ai_chat_sessions').insert({ user_id: user.id, title: message.slice(0, 120) }).select('id').single();
      if (created.error) { requestLog({ requestId, userId, role, event: 'session_create_failed', errorCode: created.error.code || null, safeError: created.error.message?.slice(0, 160) || null }); return json(503, { error: 'Unable to start the conversation.', code: 'HISTORY_UNAVAILABLE', requestId }); }
      sessionId = created.data.id;
    }
    const securityPolicy = securityRefusal(message);
    if (securityPolicy) {
      const citations: never[] = [];
      const persisted = await server.from('ai_chat_messages').insert([{ session_id: sessionId, user_id: user.id, role: 'user', content: message, citations: [] }, { session_id: sessionId, user_id: user.id, role: 'assistant', content: securityPolicy.response, citations }]);
      if (persisted.error) { requestLog({ requestId, userId, role, category, event: 'message_persist_failed', errorCode: persisted.error.code || null, safeError: persisted.error.message?.slice(0, 160) || null }); return json(503, { error: 'The response could not be saved. Please retry.', code: 'HISTORY_UNAVAILABLE', requestId }); }
      await server.from('ai_chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId).eq('user_id', user.id);
      requestLog({ requestId, userId, role, category, policy: 'security_refusal', retrievalCount: 0, latencyMs: Date.now() - started, success: true, provider: 'deterministic' });
      return json(200, { sessionId, response: securityPolicy.response, citations, model: 'policy-router', provider: 'deterministic', fallbackUsed: false, category, requestId });
    }
    const refusal = actionRefusal(message);
    if (refusal) {
      const citations = [{ type: 'platform_route', id: refusal.route, title: refusal.route.split('/').at(-1)?.replaceAll('-', ' ') || 'Dashboard', route: refusal.route }];
      await server.from('ai_chat_messages').insert([{ session_id: sessionId, user_id: user.id, role: 'user', content: message, citations: [] }, { session_id: sessionId, user_id: user.id, role: 'assistant', content: refusal.response, citations }]);
      requestLog({ requestId, userId, role, category, retrievalCount: 0, latencyMs: Date.now() - started, success: true, provider: 'deterministic' });
      return json(200, { sessionId, response: refusal.response, citations, model: 'policy-router', provider: 'deterministic', fallbackUsed: false, category, requestId });
    }

    const mistralKey = Deno.env.get('MISTRAL_API_KEY');
    if (!mistralKey) return json(503, { error: 'The AI service is temporarily unavailable.', code: 'AI_UNAVAILABLE', requestId });
    const model = Deno.env.get('MISTRAL_CHAT_MODEL') || 'mistral-small-latest';
    const groqKey = Deno.env.get('GROQ_API_KEY'); const groqModel = Deno.env.get('GROQ_CHAT_MODEL') || 'openai/gpt-oss-20b';
    if (body?.providerHealth === true) {
      const providers = [new MistralLLMProvider({ apiKey: mistralKey, model, timeoutMs: 7000 }), ...(groqKey ? [new GroqLLMProvider({ apiKey: groqKey, model: groqModel, timeoutMs: 10000 })] : [])];
      const health = [];
      requestLog({ requestId, userId, role, event: 'provider_health_started', secretPresence: { MISTRAL_API_KEY: mistralKey ? 'PRESENT' : 'MISSING', GROQ_API_KEY: groqKey ? 'PRESENT' : 'MISSING', MISTRAL_CHAT_MODEL: Deno.env.get('MISTRAL_CHAT_MODEL') ? 'PRESENT' : 'MISSING', GROQ_CHAT_MODEL: Deno.env.get('GROQ_CHAT_MODEL') ? 'PRESENT' : 'MISSING' } });
      for (const provider of providers) {
        const attempts: Record<string, unknown>[] = [];
        try {
          const result = await runProviderHealth(provider, (attempt: Record<string, unknown>) => attempts.push(attempt));
          health.push({ provider: provider.name, ok: true, model: result.model, textReceived: Boolean(result.text), attempts });
        } catch {
          health.push({ provider: provider.name, ok: false, attempts });
        }
      }
      requestLog({ requestId, userId, role, event: 'provider_health_completed', health });
      return json(200, { requestId, health });
    }

    const assignments = role === 'event_coordinator' ? await server.from('event_assignments').select('event_id').eq('user_id', user.id).eq('assignment_role', 'event_coordinator') : { data: [], error: null };
    if (assignments.error) return json(503, { error: 'Unable to resolve event access.', code: 'AUTHORIZATION_UNAVAILABLE', requestId });
    const assignedEventIds = (assignments.data || []).map((item) => item.event_id);
    let eventQuery = server.from('events').select('id,chapter_id,title,type,chapter,description,status,event_date,is_published,applications_open').order('event_date', { ascending: false }).limit(80);
    if (role === 'chapter_coordinator') eventQuery = eventQuery.eq('chapter_id', assignment.chapter_id);
    if (role === 'event_coordinator') eventQuery = assignedEventIds.length ? eventQuery.in('id', assignedEventIds) : eventQuery.eq('id', crypto.randomUUID());
    if (role === 'volunteer') eventQuery = eventQuery.eq('is_published', true).eq('applications_open', true);
    const eventResult = await eventQuery;
    const authorizedEventIds = (eventResult.data || []).map((event) => event.id);
    const reportResult = role !== 'volunteer' && authorizedEventIds.length
      ? await server.from('post_event_reports').select('id,event_id,status,venue,event_summary,submitted_at,approved_at,post_event_report_attendance(registered_count,attended_count,children_reached,volunteers_involved),post_event_report_impact(key_learnings,challenges,community_impact,recommendations,satisfaction_rating)').in('event_id', authorizedEventIds).limit(80)
      : { data: [], error: null };
    if (eventResult.error || reportResult.error) {
      requestLog({ requestId, userId, role, category, event: 'structured_retrieval_failed', eventErrorCode: eventResult.error?.code || null, eventError: eventResult.error?.message?.slice(0, 160) || null, reportErrorCode: reportResult.error?.code || null, reportError: reportResult.error?.message?.slice(0, 160) || null });
      return json(503, { error: 'Operational data is temporarily unavailable.', code: 'DATA_UNAVAILABLE', requestId });
    }
    const scoped = filterAuthorizedRecords({ role, userId, chapterId: assignment.chapter_id, assignedEventIds, events: eventResult.data || [], reports: reportResult.data || [] });
    const eventById = new Map(scoped.events.map((event) => [event.id, event])); const structured = [];
    if (['event', 'chapter'].includes(category)) for (const event of scoped.events.slice(0, 8)) structured.push({ id: event.id, sourceType: 'event', sourceTitle: event.title, route: `/dashboard/events?event=${event.id}`, evidence: JSON.stringify({ title: event.title, chapter: event.chapter, type: event.type, status: event.status, eventDate: event.event_date, description: event.description }) });
    if (['report', 'impact', 'attendance'].includes(category)) for (const report of scoped.reports.filter((item) => category === 'report' || item.status === 'approved').slice(0, 8)) { const event = eventById.get(report.event_id); structured.push({ id: report.id, sourceType: 'post_event_report', sourceTitle: `${event?.title || 'Event'} Post Event Report`, route: `/dashboard/post-event-report?report=${report.id}`, evidence: JSON.stringify({ event: event?.title, chapter: event?.chapter, status: report.status, venue: report.venue, summary: report.event_summary, attendance: report.post_event_report_attendance, impact: report.post_event_report_impact, submittedAt: report.submitted_at, approvedAt: report.approved_at }) }); }

    const historyResult = await server.from('ai_chat_messages').select('role,content').eq('session_id', sessionId).eq('user_id', user.id).order('created_at', { ascending: false }).limit(8);
    if (historyResult.error) { requestLog({ requestId, userId, role, event: 'history_load_failed', errorCode: historyResult.error.code || null, safeError: historyResult.error.message?.slice(0, 160) || null }); return json(503, { error: 'Unable to load the conversation.', code: 'HISTORY_UNAVAILABLE', requestId }); }
    let chunks = [];
    // The existing Knowledge Base is intentionally super-admin-only and has no
    // per-document audience metadata. Preserve that policy until scoped document
    // metadata exists; never use the service key to broaden document visibility.
    if (role === 'super_admin' && category === 'knowledge') {
      const embeddingResponse = await timedFetch('https://api.mistral.ai/v1/embeddings', { method: 'POST', headers: { authorization: `Bearer ${mistralKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'mistral-embed', input: [message] }) });
      if (!embeddingResponse.ok) return json(502, { error: 'Knowledge retrieval could not process that question. Please retry.', code: 'EMBEDDING_UNAVAILABLE', requestId });
      const embedding = (await embeddingResponse.json())?.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length !== 1024) return json(502, { error: 'Knowledge retrieval could not process that question. Please retry.', code: 'EMBEDDING_UNAVAILABLE', requestId });
      const search = await server.rpc('search_knowledge_base_server', { query_embedding: embedding, similarity_threshold: 0.35, match_count: 5 });
      if (search.error) return json(503, { error: 'Knowledge retrieval is temporarily unavailable.', code: 'KNOWLEDGE_UNAVAILABLE', requestId });
      chunks = search.data || [];
    }
    const messages = buildProviderMessages(chunks, [...historyResult.data].reverse(), message, { role, category, structured });
    const providerAttempts: Record<string, unknown>[] = [];
    let completion;
    try {
      completion = await completeWithFailover({
        primary: new MistralLLMProvider({ apiKey: mistralKey, model, timeoutMs: 7000 }),
        fallback: groqKey ? new GroqLLMProvider({ apiKey: groqKey, model: groqModel, timeoutMs: 10000 }) : null,
        request: { messages, maxOutputTokens: 600, temperature: 0.1 },
        onAttempt: (attempt: Record<string, unknown>) => providerAttempts.push(attempt),
      });
    } catch {
      requestLog({ requestId, userId, role, category, retrievalCount: structured.length + chunks.length, latencyMs: Date.now() - started, success: false, primaryProvider: 'mistral', fallbackAttempted: providerAttempts.some((attempt) => attempt.provider === 'groq'), providerAttempts });
      return json(503, { error: 'The AI assistant is temporarily unavailable. Please try again shortly.', code: 'LLM_UNAVAILABLE', requestId });
    }
    const answer = completion.text;
    const citations = deduplicateCitations([...buildStructuredSources(structured), ...buildCitations(chunks)]).slice(0, 8);
    const persisted = await server.from('ai_chat_messages').insert([{ session_id: sessionId, user_id: user.id, role: 'user', content: message, citations: [] }, { session_id: sessionId, user_id: user.id, role: 'assistant', content: answer.slice(0, 12000), citations }]);
    if (persisted.error) { requestLog({ requestId, userId, role, event: 'message_persist_failed', errorCode: persisted.error.code || null, safeError: persisted.error.message?.slice(0, 160) || null }); return json(503, { error: 'The answer was generated but could not be saved. Please retry.', code: 'HISTORY_UNAVAILABLE', requestId }); }
    await server.from('ai_chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId).eq('user_id', user.id);
    providerAttempts.push({ event: 'request_completed', fallbackAttempted: completion.fallbackUsed, finalProvider: completion.provider });
    requestLog({ requestId, userId, role, category, retrievalCount: structured.length + chunks.length, latencyMs: Date.now() - started, success: true, primaryProvider: 'mistral', fallbackAttempted: completion.fallbackUsed, finalProvider: completion.provider, providerAttempts });
    return json(200, { sessionId, response: answer, citations, model: completion.model, provider: completion.provider, fallbackUsed: completion.fallbackUsed, category, requestId, metrics: completion.usage });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === 'TimeoutError';
    requestLog({ requestId, userId, role, category, retrievalCount: 0, latencyMs: Date.now() - started, success: false, errorType: timeout ? 'timeout' : 'internal' });
    return json(timeout ? 504 : 500, { error: timeout ? 'The AI service timed out. Please retry.' : 'The AI service is temporarily unavailable. Please retry.', code: timeout ? 'TIMEOUT' : 'AI_UNAVAILABLE', requestId });
  }
});
