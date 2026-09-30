import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { handleDeleteUser } from './core.mjs';

const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json', 'cache-control': 'no-store' } });
const log = (fields: Record<string, unknown>) => console.info(JSON.stringify({ service: 'admin-delete-user', timestamp: new Date().toISOString(), ...fields }));

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  try {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Authentication required.', code: 'AUTH_REQUIRED' });
    const supabaseUrl = Deno.env.get('SUPABASE_URL'); const anonKey = Deno.env.get('SUPABASE_ANON_KEY'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) return json(503, { error: 'User deletion is temporarily unavailable. Please try again.', code: 'UNAVAILABLE' });

    // Caller-scoped client: RPCs run with the caller's JWT, so auth.uid() is the actor.
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const accessToken = authorization.slice('Bearer '.length).trim();
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return json(401, { error: 'Authentication required.', code: 'INVALID_JWT' });

    // Service-role client stays server-side and is used only after the database authorizes the caller.
    const server = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await request.json().catch(() => null);
    const result = await handleDeleteUser({
      callerId: user.id,
      body,
      authorize: (targetUserId: string) => userClient.rpc('admin_authorize_user_deletion', { target_user_id: targetUserId }),
      deleteAuthUser: (targetUserId: string) => server.auth.admin.deleteUser(targetUserId),
      audit: (row: Record<string, unknown>) => server.from('audit_logs').insert(row),
      log: (fields: Record<string, unknown>) => log({ actorId: user.id, ...fields }),
    });
    return json(result.status, result.body);
  } catch (cause) {
    log({ event: 'unhandled', safeError: String((cause as Error)?.message || '').slice(0, 160) });
    return json(500, { error: 'User deletion is temporarily unavailable. Please try again.', code: 'INTERNAL' });
  }
});
