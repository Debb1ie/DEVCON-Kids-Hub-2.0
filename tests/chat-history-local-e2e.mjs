import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Local Supabase credentials are required');
assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname), 'Refusing a non-local target');
const root = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function actor(label, role) {
  const email = `${label}-${crypto.randomUUID()}@local.test`;
  const password = `Local-${crypto.randomUUID()}!Aa1`;
  const created = await root.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  assert.ifError((await root.from('profiles').upsert({ id: created.data.user.id, full_name: label, email })).error);
  assert.ifError((await root.from('user_roles').insert({ user_id: created.data.user.id, role })).error);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { id: created.data.user.id, client };
}

const first = await actor('approved-first', 'volunteer');
const second = await actor('approved-second', 'admin');
const pending = await actor('pending-user', 'pending_volunteer');
const firstSession = await root.from('ai_chat_sessions').insert({ user_id: first.id, title: 'First private chat' }).select('id').single();
const secondSession = await root.from('ai_chat_sessions').insert({ user_id: second.id, title: 'Second private chat' }).select('id').single();
assert.ifError(firstSession.error); assert.ifError(secondSession.error);
assert.ifError((await root.from('ai_chat_messages').insert([
  { session_id: firstSession.data.id, user_id: first.id, role: 'user', content: 'First user private question' },
  { session_id: secondSession.data.id, user_id: second.id, role: 'user', content: 'Second user private question' },
])).error);

const firstVisible = await first.client.from('ai_chat_messages').select('content');
const secondVisible = await second.client.from('ai_chat_messages').select('content');
const pendingVisible = await pending.client.from('ai_chat_messages').select('content');
assert.deepEqual(firstVisible.data?.map(x => x.content), ['First user private question']);
assert.deepEqual(secondVisible.data?.map(x => x.content), ['Second user private question']);
assert.deepEqual(pendingVisible.data, []);

const vector = Array.from({ length: 1024 }, () => 0.03125);
const documentId = `chat-doc-${crypto.randomUUID()}`;
assert.ifError((await root.from('documents').insert({ id: documentId, title: 'Shared Grounding Test', uploaded_by: first.id })).error);
assert.ifError((await root.from('knowledge_base').insert({ document_id: documentId, document_title: 'Shared Grounding Test', content: 'The shared test answer is grounded and available to every approved role.', embedding: vector, page_number: 1, chunk_index: 0 })).error);
const rawBrowserSearch = await first.client.rpc('search_knowledge_base_server', { query_embedding: vector, similarity_threshold: 0.3, match_count: 5 });
assert(rawBrowserSearch.error, 'Approved browser roles must not receive raw chunks');
const serverSearch = await root.rpc('search_knowledge_base_server', { query_embedding: vector, similarity_threshold: 0.3, match_count: 5 });
assert.ifError(serverSearch.error);
assert.equal(serverSearch.data?.[0]?.document_title, 'Shared Grounding Test');
const pendingSearch = await pending.client.rpc('search_knowledge_base_server', { query_embedding: vector, similarity_threshold: 0.3, match_count: 5 });
assert(pendingSearch.error, 'Pending Volunteer must not retrieve raw knowledge');

console.log(JSON.stringify({ passed: 8, failed: 0 }));
