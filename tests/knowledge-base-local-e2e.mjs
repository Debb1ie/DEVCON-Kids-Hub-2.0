import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Local Supabase credentials are required');
assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname), 'Refusing a non-local target');

const root = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const passed = [];
const pass = (name) => passed.push(name);
const expectError = async (operation, name) => {
  const result = await operation();
  assert(result.error, `${name}: expected an authorization error`);
  pass(name);
};

async function identity(label, role) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}!Aa1`;
  const created = await root.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  assert.ifError((await root.from('user_roles').update({ role }).eq('user_id', created.data.user.id)).error);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { id: created.data.user.id, client };
}

const actors = {
  super_admin: await identity('knowledge-super', 'super_admin'),
  admin: await identity('knowledge-admin', 'admin'),
  chapter_coordinator: await identity('knowledge-chapter', 'chapter_coordinator'),
  event_coordinator: await identity('knowledge-event', 'event_coordinator'),
  volunteer: await identity('knowledge-volunteer', 'volunteer'),
  pending_volunteer: await identity('knowledge-pending', 'pending_volunteer'),
};

const documentId = `knowledge_${crypto.randomUUID()}`;
const document = {
  id: documentId,
  title: 'Local authorization fixture',
  file_type: 'txt',
  total_chunks: 1,
  total_pages: 1,
  uploaded_by: actors.super_admin.id,
};
assert.ifError((await actors.super_admin.client.from('documents').insert(document)).error);
assert.ifError((await actors.super_admin.client.from('knowledge_base').insert({
  document_id: documentId,
  document_title: document.title,
  content: 'Non-sensitive local fixture content.',
  page_number: 1,
})).error);
pass('Super Admin creates document metadata and ingestion chunks');

for (const role of ['admin', 'chapter_coordinator', 'event_coordinator', 'volunteer', 'pending_volunteer']) {
  const actor = actors[role];
  const documents = await actor.client.from('documents').select('id');
  assert.ifError(documents.error);
  assert.equal(documents.data.length, 0, `${role} must not read management metadata`);
  const chunks = await actor.client.from('knowledge_base').select('id');
  assert.ifError(chunks.error);
  assert.equal(chunks.data.length, 0, `${role} must not read source chunks directly`);
  await expectError(
    () => actor.client.from('documents').insert({ ...document, id: `${documentId}_${role}` }),
    `${role} cannot upload document metadata`,
  );
  await expectError(
    () => actor.client.from('knowledge_base').insert({ document_id: documentId, document_title: document.title, content: role }),
    `${role} cannot ingest chunks`,
  );
  pass(`${role} direct management reads are empty`);
}

const zeroVector = new Array(1024).fill(0);
for (const role of ['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator', 'volunteer']) {
  const search = await actors[role].client.rpc('search_knowledge_base', {
    query_embedding: zeroVector,
    similarity_threshold: 0.7,
    match_count: 5,
  });
  assert.ifError(search.error);
  pass(`${role} retains approved chatbot retrieval`);
}
await expectError(
  () => actors.pending_volunteer.client.rpc('search_knowledge_base', { query_embedding: zeroVector, similarity_threshold: 0.7, match_count: 5 }),
  'Pending Volunteer cannot use chatbot retrieval RPC',
);
await expectError(
  () => anonymous.rpc('search_knowledge_base', { query_embedding: zeroVector, similarity_threshold: 0.7, match_count: 5 }),
  'Anonymous caller cannot use chatbot retrieval RPC',
);

assert.ifError((await root.storage.createBucket('knowledge-base-documents', { public: false })).error);
const sourcePath = `sources/${crypto.randomUUID()}.txt`;
assert.ifError((await actors.super_admin.client.storage.from('knowledge-base-documents').upload(sourcePath, new Blob(['local']))).error);
pass('Super Admin uploads a private source file');
for (const role of ['admin', 'chapter_coordinator', 'event_coordinator', 'volunteer', 'pending_volunteer']) {
  await expectError(
    () => actors[role].client.storage.from('knowledge-base-documents').download(sourcePath),
    `${role} cannot access private source files`,
  );
}
assert.ifError((await actors.super_admin.client.storage.from('knowledge-base-documents').remove([sourcePath])).error);
pass('Super Admin deletes a private source file');

assert.ifError((await actors.super_admin.client.from('knowledge_base').delete().eq('document_id', documentId)).error);
assert.ifError((await actors.super_admin.client.from('documents').delete().eq('id', documentId)).error);
pass('Super Admin deletes ingestion chunks and metadata');

console.log(JSON.stringify({ passed: passed.length, failed: 0 }));
