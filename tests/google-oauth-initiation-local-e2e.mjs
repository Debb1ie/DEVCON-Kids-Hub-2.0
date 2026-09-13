import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Local Supabase credentials are required');
assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname), 'Refusing a non-local target');

const root = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `google-cors-${randomUUID()}@local.test`;
const password = `Local-${randomUUID()}!Aa1`;
let userId;
const passed = [];

try {
  const created = await root.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  userId = created.data.user.id;
  assert.ifError((await root.from('user_roles').delete().eq('user_id', userId)).error);
  assert.ifError((await root.from('user_roles').insert({ user_id: userId, role: 'super_admin' })).error);

  const browser = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await browser.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  const authenticated = await browser.auth.getUser(signedIn.data.session.access_token);
  assert.ifError(authenticated.error);
  assert.equal(authenticated.data.user.id, userId);
  const assignedRole = await browser.from('user_roles').select('role').eq('user_id', userId).eq('role', 'super_admin').maybeSingle();
  assert.ifError(assignedRole.error);
  assert.equal(assignedRole.data?.role, 'super_admin');
  const endpoint = `${url}/functions/v1/google-workspace-auth`;

  const preflight = await fetch(endpoint, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
    },
  });
  assert([200, 204].includes(preflight.status), `Unexpected preflight status: ${preflight.status}`);
  const allowedHeaders = preflight.headers.get('access-control-allow-headers') || '';
  for (const header of ['authorization', 'apikey', 'content-type', 'x-client-info', 'x-supabase-api-version']) {
    assert.match(allowedHeaders, new RegExp(`(?:^|,\\s*)${header}(?:,|$)`, 'i'));
  }
  assert.match(preflight.headers.get('access-control-allow-methods') || '', /POST/i);
  passed.push('Supabase browser-client CORS preflight succeeds');

  const initiation = await fetch(endpoint, {
    method: 'POST',
    headers: {
      origin: 'http://localhost:5173',
      apikey: anonKey,
      authorization: `Bearer ${signedIn.data.session.access_token}`,
      'content-type': 'application/json',
      'x-client-info': 'local-cors-regression-test',
      'x-supabase-api-version': '2024-01-01',
    },
    body: JSON.stringify({ action: 'authorize' }),
    redirect: 'manual',
  });
  assert.equal(initiation.status, 200);
  assert.match(initiation.headers.get('content-type') || '', /application\/json/i);
  const response = await initiation.json();
  const authorization = new URL(response.authorizationUrl);
  assert.equal(authorization.origin, 'https://accounts.google.com');
  assert.equal(authorization.searchParams.get('response_type'), 'code');
  assert(authorization.searchParams.get('state'));
  passed.push('Authorized initiation returns a Google authorization URL as JSON');

  const stateHash = createHash('sha256').update(authorization.searchParams.get('state')).digest('hex');
  const stored = await root.from('google_oauth_states').select('requested_by,expires_at,used_at').eq('state_hash', stateHash).single();
  assert.ifError(stored.error);
  assert.equal(stored.data.requested_by, userId);
  assert.equal(stored.data.used_at, null);
  const remaining = new Date(stored.data.expires_at).getTime() - Date.now();
  assert(remaining > 0 && remaining <= 10 * 60_000);
  passed.push('Initiation stores only a hashed, unused, expiring OAuth state');
} finally {
  if (userId) {
    await root.from('google_oauth_states').delete().eq('requested_by', userId);
    await root.auth.admin.deleteUser(userId);
  }
}

console.log(JSON.stringify({ passed: passed.length, results: passed }, null, 2));
