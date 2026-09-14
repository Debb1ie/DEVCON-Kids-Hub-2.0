import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCitations, buildProviderMessages } from '../supabase/functions/ai-chat/core.mjs';

const component = readFileSync('src/components/AIChat.jsx', 'utf8');
const service = readFileSync('src/services/chatService.js', 'utf8');
const history = readFileSync('src/services/chatHistoryService.js', 'utf8');
const fn = readFileSync('supabase/functions/ai-chat/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260914000200_private_ai_chat.sql', 'utf8');

test('chat history is UUID-owned and no shared localStorage history is loaded or saved', () => {
  assert.match(history, /eq\('user_id', userId\)/);
  assert.doesNotMatch(component, /getItem\('chatHistory'\)|setItem\('chatHistory'/);
  assert.match(component, /loadPrivateChatHistory\(user\?\.id\)/);
  assert.match(component, /clearPrivateChatHistory\(sessionId, user\?\.id\)/);
});

test('RLS limits sessions and messages to auth.uid ownership', () => {
  assert.match(migration, /create policy ai_chat_sessions_owner_select[\s\S]*user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /create policy ai_chat_messages_owner_select[\s\S]*user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /validate_ai_chat_message_owner_trigger/i);
  assert.match(migration, /revoke all on table public\.ai_chat_sessions,\s*public\.ai_chat_messages from public,\s*anon/i);
});

test('raw Knowledge Base chunks are server-only', () => {
  assert.match(migration, /revoke all on function public\.search_knowledge_base_server[\s\S]*public,\s*anon,\s*authenticated/i);
  assert.match(migration, /grant execute on function public\.search_knowledge_base_server[\s\S]*to service_role/i);
  assert.doesNotMatch(component, /retrieveContext/);
  assert.doesNotMatch(service, /content:\s*c\.content/);
});

test('ai-chat authenticates approved roles and denies Pending Volunteer and anonymous callers', () => {
  assert.match(fn, /if \(!authorization\?\.startsWith\('Bearer '\)\).*401/);
  for (const role of ['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator', 'volunteer']) assert.match(fn, new RegExp(`['"]${role}['"]`));
  assert.doesNotMatch(fn, /['"]pending_volunteer['"]/);
  assert.match(fn, /roleResult\.data !== true[\s\S]*403/);
});

test('Mistral credentials and Knowledge Base evidence stay server-side', () => {
  assert.match(fn, /Deno\.env\.get\('MISTRAL_API_KEY'\)/);
  assert.match(fn, /\/v1\/embeddings/);
  assert.match(fn, /\/v1\/chat\/completions/);
  assert.match(fn, /search_knowledge_base_server/);
  assert.doesNotMatch(service, /MISTRAL_API_KEY|VITE_MISTRAL_API_KEY/);
  assert.doesNotMatch(fn, /console\.(log|error|warn)/);
});

test('client exposes safe retry behavior without provider internals', () => {
  assert.match(component, /retryText/);
  assert.match(component, />\s*Retry\s*</);
  assert.match(service, /Unable to connect to the AI service\. Please retry\./);
  assert.doesNotMatch(service, /err\.error|err\.message/);
});

test('a saved shared chunk grounds the provider prompt and returns safe citations', () => {
  const chunks = [{ document_id: 'doc-1', document_title: 'Uploaded Program Guide.pdf', page_number: 7, content: 'The Code Camp learning path begins with computational thinking.' }];
  const messages = buildProviderMessages(chunks, [], 'How does the Code Camp learning path begin?');
  assert.match(messages[0].content, /computational thinking/);
  assert.match(messages[0].content, /Uploaded Program Guide\.pdf/);
  assert.deepEqual(buildCitations(chunks), [{ documentId: 'doc-1', title: 'Uploaded Program Guide.pdf', pageNumber: 7 }]);
  assert.equal(messages.at(-1).content, 'How does the Code Camp learning path begin?');
});
