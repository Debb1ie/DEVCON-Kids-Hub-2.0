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

const documentId = `doc_${crypto.randomUUID()}`;
const sharedVector = [1, ...new Array(1023).fill(0)];
const document = {
  id: documentId,
  title: 'Local authorization fixture',
  file_type: 'txt',
  total_chunks: 1,
  total_pages: 1,
  uploaded_by: actors.super_admin.id,
};
const sourcePath = `sources/${actors.super_admin.id}/${documentId}/local-fixture.txt`;
assert.ifError((await actors.super_admin.client.storage.from('knowledge-base-documents').upload(
  sourcePath,
  new Blob(['local'], { type: 'text/plain' }),
)).error);
const finalized = await actors.super_admin.client.rpc('finalize_knowledge_document', {
  document_id: documentId,
  document_title: document.title,
  document_file_type: 'txt',
  document_total_chunks: 1,
  document_total_pages: 1,
  document_file_size: 5,
  source_storage_path: sourcePath,
  chunks: [{ content: 'Non-sensitive local fixture content.', page_number: 1, embedding: sharedVector }],
});
assert.ifError(finalized.error);
assert.equal(finalized.data, 1);
pass('Super Admin atomically saves source-backed metadata and ingestion chunks');

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

for (const role of ['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator', 'volunteer']) {
  await expectError(
    () => actors[role].client.rpc('search_knowledge_base_server', {
      query_embedding: sharedVector,
      similarity_threshold: 0.7,
      match_count: 5,
    }),
    `${role} cannot retrieve raw chatbot chunks`,
  );
}
const serverSearch = await root.rpc('search_knowledge_base_server', {
    query_embedding: sharedVector,
    similarity_threshold: 0.7,
    match_count: 5,
});
assert.ifError(serverSearch.error);
assert.equal(serverSearch.data.length, 1);
assert.equal(serverSearch.data[0].document_id, documentId);
pass('Server-side chatbot retrieval uses the saved shared knowledge');
await expectError(
  () => actors.pending_volunteer.client.rpc('search_knowledge_base_server', { query_embedding: sharedVector, similarity_threshold: 0.7, match_count: 5 }),
  'Pending Volunteer cannot use chatbot retrieval RPC',
);
await expectError(
  () => anonymous.rpc('search_knowledge_base_server', { query_embedding: sharedVector, similarity_threshold: 0.7, match_count: 5 }),
  'Anonymous caller cannot use chatbot retrieval RPC',
);

for (const [name, type] of [
  ['source.pdf', 'application/pdf'],
  ['source.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]) {
  const path = `sources/${actors.super_admin.id}/${documentId}/${name}`;
  assert.ifError((await actors.super_admin.client.storage.from('knowledge-base-documents').upload(path, new Blob(['local'], { type }))).error);
  assert.ifError((await actors.super_admin.client.storage.from('knowledge-base-documents').remove([path])).error);
}
pass('Super Admin uploads PDF, DOCX, and TXT private source files');
for (const role of ['admin', 'chapter_coordinator', 'event_coordinator', 'volunteer', 'pending_volunteer']) {
  await expectError(
    () => actors[role].client.storage.from('knowledge-base-documents').download(sourcePath),
    `${role} cannot access private source files`,
  );
}
assert.ifError((await actors.super_admin.client.from('documents').delete().eq('id', documentId)).error);
assert.ifError((await actors.super_admin.client.storage.from('knowledge-base-documents').remove([sourcePath])).error);
pass('Super Admin deletes ingestion chunks and metadata');

console.log(JSON.stringify({ passed: passed.length, failed: 0 }));
