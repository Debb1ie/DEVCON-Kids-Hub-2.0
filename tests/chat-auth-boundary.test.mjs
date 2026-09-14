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

test('absent sessions are denied and logout clears the accepted session', async () => {
  const lifecycle = createSessionLifecycle();
  const auth = { getSession: async () => ({ data: { session: null }, error: null }) };
  assert.equal(await lifecycle.requireSession(auth), null);

  lifecycle.accept(sessionFor('approved-user'));
  assert.equal((await lifecycle.requireSession(auth))?.user.id, 'approved-user');
  lifecycle.clear();
  assert.equal(await lifecycle.requireSession(auth), null);
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
  assert.doesNotMatch(service, /localStorage|sessionStorage|console\./);
  assert.doesNotMatch(component, /retrieveContext|knowledge_base.*select/i);
  assert.match(history, /eq\('user_id', userId\)/);
  assert.doesNotMatch(`${component}\n${service}`, /console\.(?:log|error).*Authorization/i);
});
