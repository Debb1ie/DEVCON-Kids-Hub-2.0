import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { callbackUrl, encryptToken, requiredEnv, sha256, tokenRequest } from '../_shared/googleOAuth.ts';
import { buildGoogleAuthorizationUrl, revokeOAuthToken } from '../_shared/googleOAuthCore.mjs';

const HEADERS = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type' };
const SAFE_ERROR = 'Google authorization could not be completed. Please try again.';
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const randomState = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const appDestination = (result: string) => {
  const origin = new URL(requiredEnv('GOOGLE_OAUTH_APP_ORIGIN')).origin;
  return `${origin}/dashboard/integrations?google=${encodeURIComponent(result)}`;
};

async function authorizedSuperAdmin(request: Request, url: string, anonKey: string) {
  const authorization = request.headers.get('authorization') || '';
  const client = createClient(url, anonKey, { global: { headers: { authorization } }, auth: { persistSession: false } });
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) return null;
  const role = await client.from('user_roles').select('role').eq('user_id', user.data.user.id).eq('role', 'super_admin').maybeSingle();
  return role.data ? user.data.user : null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  try {
    const url = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const requestUrl = new URL(request.url);

    if (request.method === 'GET' && requestUrl.pathname.endsWith('/callback')) {
      const code = requestUrl.searchParams.get('code');
      const state = requestUrl.searchParams.get('state');
      if (!code || !state) return Response.redirect(appDestination('error'), 302);
      const stateHash = await sha256(state);
      const stateRow = await db.from('google_oauth_states').update({ used_at: new Date().toISOString() })
        .eq('state_hash', stateHash).is('used_at', null).gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
      if (stateRow.error || !stateRow.data) return Response.redirect(appDestination('expired'), 302);
      const tokens = await tokenRequest(new URLSearchParams({
        client_id: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'), client_secret: requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
        code, redirect_uri: callbackUrl(), grant_type: 'authorization_code',
      }));
      if (!tokens.refresh_token || !tokens.access_token) return Response.redirect(appDestination('consent-required'), 302);
      const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` } });
      if (!profileResponse.ok) throw new Error('Google profile lookup failed');
      const profile = await profileResponse.json();
      const encrypted = await encryptToken(tokens.refresh_token);
      const saved = await db.from('google_oauth_credentials').upsert({
        singleton: true, refresh_token_ciphertext: encrypted, granted_scopes: String(tokens.scope || '').split(' ').filter(Boolean),
        google_account_email: profile.email, connected_by: stateRow.data.requested_by,
      }, { onConflict: 'singleton' });
      if (saved.error) throw saved.error;
      const settings = await db.from('google_workspace_settings').upsert({ singleton: true, connected_google_email: profile.email, google_connected_at: new Date().toISOString(), updated_by: stateRow.data.requested_by }, { onConflict: 'singleton' });
      if (settings.error) throw settings.error;
      await db.from('audit_logs').insert({ actor_id: stateRow.data.requested_by, action: 'CONNECT_GOOGLE_WORKSPACE', target_table: 'google_workspace_settings' });
      return Response.redirect(appDestination('connected'), 302);
    }

    if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    const user = await authorizedSuperAdmin(request, url, anonKey);
    if (!user) return json(403, { error: 'Only a Super Admin can manage Google authorization.' });
    const body = await request.json().catch(() => ({}));
    if (body.action === 'authorize') {
      await db.from('google_oauth_states').delete().lt('expires_at', new Date().toISOString());
      const state = randomState();
      const stored = await db.from('google_oauth_states').insert({ state_hash: await sha256(state), requested_by: user.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
      if (stored.error) throw stored.error;
      return json(200, { authorizationUrl: buildGoogleAuthorizationUrl({ clientId: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'), redirectUri: callbackUrl(), state }) });
    }
    if (body.action === 'disconnect') {
      const credential = await db.from('google_oauth_credentials').select('refresh_token_ciphertext').eq('singleton', true).maybeSingle();
      if (credential.error) throw credential.error;
      if (credential.data) {
        const { decryptToken } = await import('../_shared/googleOAuth.ts');
        const refreshToken = await decryptToken(credential.data.refresh_token_ciphertext);
        if (!await revokeOAuthToken(fetch, refreshToken)) return json(502, { error: 'Google access could not be revoked. Please try again.' });
      }
      await db.from('google_oauth_credentials').delete().eq('singleton', true);
      await db.from('google_workspace_settings').update({ connected_google_email: null, google_connected_at: null, automatic_folder_creation_enabled: false, sheet_synchronization_enabled: false, updated_by: user.id }).eq('singleton', true);
      await db.from('audit_logs').insert({ actor_id: user.id, action: 'DISCONNECT_GOOGLE_WORKSPACE', target_table: 'google_workspace_settings' });
      return json(200, { disconnected: true });
    }
    return json(400, { error: 'Unsupported authorization action.' });
  } catch {
    if (request.method === 'GET') return Response.redirect(appDestination('error'), 302);
    return json(500, { error: SAFE_ERROR });
  }
});
