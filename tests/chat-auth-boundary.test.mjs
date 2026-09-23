import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createSessionLifecycle } from '../src/auth/sessionLifecycle.js';

const sessionFor = (id, token = `token-${id}`) => ({
  access_token: token,
  user: { id },
});

test('an OAuth callback session remains authoritative while storage restoration lags', async () => {
  const lifecycle = createSessionLifecycle();
  const callbackSession = sessionFor('super-admin');
  lifecycle.accept(callbackSession);

  let storageReads = 0;
  const auth = {
    getSession: async () => {
      storageReads += 1;
      return { data: { session: null }, error: null };
    },
  };

  assert.equal(await lifecycle.requireSession(auth), callbackSession);
  assert.equal(storageReads, 0, 'chat must not perform a competing post-callback session read');
});

test('initial restoration is shared and does not emit a false signed-out result', async () => {
  const lifecycle = createSessionLifecycle();
  const restoredSession = sessionFor('restored-user');
  let resolveSession;
  let reads = 0;
  const auth = {
    getSession: () => {
      reads += 1;
      return new Promise((resolve) => { resolveSession = resolve; });
    },
  };

  const first = lifecycle.requireSession(auth);
  const second = lifecycle.requireSession(auth);
  resolveSession({ data: { session: restoredSession }, error: null });

  assert.equal(await first, restoredSession);
  assert.equal(await second, restoredSession);
  assert.equal(reads, 1);
});

test('an initial null is refreshed once at chatbot invocation', async () => {
  const lifecycle = createSessionLifecycle();
  const restoredSession = sessionFor('pkce-user');
  let reads = 0;
  const auth = {
    getSession: async () => {
      reads += 1;
      return { data: { session: reads === 1 ? null : restoredSession }, error: null };
    },
  };

  assert.equal(await lifecycle.restore(auth), null);
  assert.equal(await lifecycle.requireSession(auth), restoredSession);
  assert.equal(reads, 2);
});

test('a delayed initial null cannot overwrite a newer SIGNED_IN event', async () => {
  const lifecycle = createSessionLifecycle();
  let resolveInitial;
  const auth = {
    getSession: () => new Promise((resolve) => { resolveInitial = resolve; }),
  };
  const restoration = lifecycle.restore(auth);
  const signedIn = sessionFor('signed-in-user');
  lifecycle.acceptAuthEvent('SIGNED_IN', signedIn);
  resolveInitial({ data: { session: null }, error: null });

  assert.equal(await restoration, signedIn);
  assert.equal(await lifecycle.requireSession(auth), signedIn);
});

test('TOKEN_REFRESHED replaces the authoritative session', async () => {
  const lifecycle = createSessionLifecycle();
  lifecycle.acceptAuthEvent('SIGNED_IN', sessionFor('same-user', 'first-token'));
  lifecycle.acceptAuthEvent('TOKEN_REFRESHED', sessionFor('same-user', 'refreshed-token'));
  const active = await lifecycle.requireSession({ getSession: async () => { throw new Error('unexpected read'); } });
  assert.equal(active.access_token, 'refreshed-token');
});

test('absent sessions are denied and SIGNED_OUT remains terminal', async () => {
  const lifecycle = createSessionLifecycle();
  let reads = 0;
  const auth = { getSession: async () => { reads += 1; return { data: { session: null }, error: null }; } };
  assert.equal(await lifecycle.requireSession(auth), null);

  lifecycle.accept(sessionFor('approved-user'));
  assert.equal((await lifecycle.requireSession(auth))?.user.id, 'approved-user');
  lifecycle.acceptAuthEvent('SIGNED_OUT', null);
  assert.equal(await lifecycle.requireSession(auth), null);
  assert.equal(reads, 2, 'SIGNED_OUT must not trigger another restoration read');
});

test('account switching replaces rather than shares the active session', async () => {
  const lifecycle = createSessionLifecycle();
  const auth = { getSession: async () => ({ data: { session: null }, error: null }) };
  lifecycle.accept(sessionFor('first-user'));
  lifecycle.accept(sessionFor('second-user'));
  const active = await lifecycle.requireSession(auth);
  assert.equal(active.user.id, 'second-user');
  assert.notEqual(active.user.id, 'first-user');
});

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
};

test('browser application code has one authoritative Supabase client', async () => {
  const files = await walk('src');
  const declarations = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (/\bcreateClient\s*\(/.test(source)) declarations.push(file.replaceAll('\\', '/'));
  }
  assert.deepEqual(declarations, ['src/lib/supabase.js']);
});

test('chat remains server-side and never logs authorization material', async () => {
  const [component, service, history] = await Promise.all([
    readFile('src/components/AIChat.jsx', 'utf8'),
    readFile('src/services/chatService.js', 'utf8'),
    readFile('src/services/chatHistoryService.js', 'utf8'),
  ]);
  assert.match(service, /authSessionLifecycle\.requireSession/);
  assert.match(service, /auth\.getSession\(\)/);
  assert.match(service, /auth\.refreshSession\(\)/);
  assert.match(service, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.doesNotMatch(service, /localStorage|sessionStorage|console\./);
  assert.doesNotMatch(component, /retrieveContext|knowledge_base.*select/i);
  assert.match(history, /eq\('user_id', userId\)/);
  assert.doesNotMatch(`${component}\n${service}`, /console\.(?:log|error).*Authorization/i);
});

test('chat invocation refreshes missing or expired sessions and never persists tokens itself', async () => {
  const service = await readFile('src/services/chatService.js', 'utf8');
  assert.match(service, /!session\?\.access_token \|\| expiresSoon/);
  assert.match(service, /if \(refreshed\.error \|\| !refreshed\.data\?\.session\?\.access_token\) return null/);
  assert.match(service, /throw new ChatServiceError\('Please sign in again to use the AI assistant\.'/);
  assert.doesNotMatch(service, /setItem\(|access_token.*(?:localStorage|sessionStorage)/);
});

test('edge function verifies caller identity before creating its service-role client', async () => {
  const fn = await readFile('supabase/functions/ai-chat/index.ts', 'utf8');
  const callerVerification = fn.indexOf('userClient.auth.getUser(accessToken)');
  const serviceClient = fn.indexOf("createClient(supabaseUrl, serviceKey");
  assert.ok(callerVerification >= 0 && serviceClient > callerVerification);
  assert.match(fn, /AUTH_REQUIRED/);
  assert.match(fn, /INVALID_JWT/);
  assert.match(fn, /USER_LOOKUP_FAILED/);
  assert.match(fn, /ROLE_DENIED/);
  assert.match(fn, /CHAT_ROLES\.includes\(role\)/);
  assert.match(fn, /userClient\.auth\.getUser\(accessToken\)/);
  assert.match(fn, /Authorization: authorization/);
  assert.doesNotMatch(fn, /server\.auth\.getUser/);
});
