# DEVCON Kids Hub Assistant

The assistant is a read-only, authenticated feature. The browser sends a bounded question and session identifier to `supabase/functions/ai-chat`. Provider keys, service-role credentials, retrieved evidence, and authorization decisions remain server-side.

## Request flow

1. Verify the Supabase bearer token and resolve the caller's authoritative `user_roles` assignment.
2. Deny pending or unknown roles, validate the question, and apply a per-instance per-user rate limit.
3. Classify the question deterministically as knowledge, platform help, chapter, event, report, impact, attendance, or unsupported action.
4. Refuse mutation requests without calling the model. Obvious prompt-injection requests are rejected, while authorization remains independently enforced.
5. For structured questions, query events/reports and filter by role before creating evidence: super admins/admins receive national scope; chapter coordinators receive their chapter; event coordinators receive assigned events; volunteers receive only published/open event information and no reports.
6. For knowledge/help questions, preserve the repository's current super-admin-only Knowledge Base policy, generate a Mistral embedding, and retrieve at most five approved chunks through the service-role-only search function. Other roles receive no document chunks until documents have explicit audience metadata.
7. Bound and sanitize evidence/history, call Mistral for answer generation, and use Groq exactly once with the same messages if Mistral has a transient provider failure. Return the answer plus retrieval-owned source metadata and persist private UUID-owned history.

Retrieved text is explicitly treated as untrusted reference data. The prompt forbids following embedded commands, revealing prompts or credentials, bypassing permissions, or claiming an action occurred. A response without authorized evidence must state that no authorized record was found.

Sources use `{ type, id, title, route }` for Hub records and document identifier/title/page metadata for knowledge documents. The UI renders record routes as source links.

## Reliability and privacy

Questions are limited to 500 characters, history to eight messages, evidence to 14,000 characters, retrieval to small top-K sets, and output to 600 tokens. Provider requests time out. User-facing errors cover authentication, authorization, rate limit, embeddings, retrieval, LLM, persistence, and timeout failures without exposing internals. Logs contain request ID, user ID, role, category, retrieval count, latency, provider, outcome, and timestamp; they exclude questions, answers, headers, tokens, and secrets.

Mistral remains the only embedding provider so existing 1024-dimension pgvector data stays compatible. For answer generation, Mistral is primary and Groq is fallback. HTTP 408, 429, 502, 503, 504, timeouts, and transport failures are eligible for one immediate Groq attempt. Authentication, authorization, application rate limits, malformed requests, missing secrets, and permanent provider/configuration failures do not trigger failover. There is no delayed Mistral retry. The primary and fallback attempts are bounded to 7 and 10 seconds respectively so failover stays within the Edge Function runtime budget.

Tests use `MockLLMProvider` and `MockEmbeddingProvider`; no live AI or Google credentials are required.

## Server configuration

Set these as Supabase Edge Function secrets, never as `VITE_*` variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MISTRAL_API_KEY`
- `MISTRAL_CHAT_MODEL` (optional; defaults to `mistral-small-latest`)
- `GROQ_API_KEY`
- `GROQ_CHAT_MODEL` (optional; defaults to the low-latency production model `openai/gpt-oss-20b`)

The existing private-chat/knowledge migrations must already be applied. This implementation does not apply or alter migrations and does not trigger report exports. Long-term memory and all AI write actions remain out of scope.
