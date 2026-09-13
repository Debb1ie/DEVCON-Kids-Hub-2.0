import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  try {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Authentication required.' });
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const mistralKey = Deno.env.get('MISTRAL_API_KEY');
    if (!supabaseUrl || !anonKey || !mistralKey) return json(503, { error: 'Embedding service is unavailable.' });

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) return json(401, { error: 'Authentication required.' });
    const allowed = await client.rpc('has_role', {
      allowed_roles: ['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator', 'volunteer'],
    });
    if (allowed.error || allowed.data !== true) return json(403, { error: 'Embedding is unavailable for this account.' });

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (body?.action !== 'embed' || text.length < 1 || text.length > 12000) {
      return json(400, { error: 'Invalid embedding request.' });
    }

    const provider = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${mistralKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'mistral-embed', input: [text] }),
    });
    if (!provider.ok) return json(502, { error: 'Embedding provider request failed.' });
    const payload = await provider.json();
    const embedding = payload?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      return json(502, { error: 'Embedding provider returned an invalid response.' });
    }
    return json(200, { embedding });
  } catch {
    return json(500, { error: 'Embedding request failed.' });
  }
});
