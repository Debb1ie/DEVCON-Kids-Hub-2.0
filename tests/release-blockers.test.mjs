import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MAX_EVENT_IMAGE_SIZE, validateEventImage } from '../src/services/eventService.js';

const migration = readFileSync('supabase/migrations/20260914000100_release_blocker_storage_and_knowledge.sql', 'utf8');
const knowledgePage = readFileSync('src/pages/KnowledgeBase.jsx', 'utf8');
const ragService = readFileSync('src/services/ragService.js', 'utf8');
const eventsPage = readFileSync('src/pages/Events.jsx', 'utf8');
const eventService = readFileSync('src/services/eventService.js', 'utf8');
const embedFunction = readFileSync('supabase/functions/ai-embed/index.ts', 'utf8');

test('Knowledge Base upload reconciles metadata drift and finalizes source plus chunks atomically', () => {
  assert.match(migration, /alter table public\.documents add column uploaded_by uuid/);
  assert.match(migration, /create function public\.finalize_knowledge_document/);
  assert.match(migration, /insert into public\.documents[\s\S]*insert into public\.knowledge_base/);
  assert.match(ragService, /storage\.from\(KNOWLEDGE_BUCKET\)\.upload/);
  assert.match(ragService, /rpc\('finalize_knowledge_document'/);
  assert.match(knowledgePage, /uploadKnowledgeDocument\(file, processedDoc, roleKey\)/);
  assert.doesNotMatch(knowledgePage, /createDocumentMetadata/);
  assert.match(ragService, /embedding\.length !== 1024/);
});

test('Knowledge Base source files remain private and Super-Admin-only', () => {
  assert.match(migration, /'knowledge-base-documents', 'knowledge-base-documents', false/);
  assert.match(migration, /if not public\.has_role\(array\['super_admin'\]\)/);
  assert.doesNotMatch(migration, /for (?:insert|update|delete) to anon/i);
});

test('server-side embedding permits approved roles and denies pending or anonymous callers', () => {
  assert.match(embedFunction, /client\.auth\.getUser\(\)/);
  assert.match(embedFunction, /allowed_roles: \['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator', 'volunteer'\]/);
  assert.doesNotMatch(embedFunction, /pending_volunteer/);
  assert.match(embedFunction, /Deno\.env\.get\('MISTRAL_API_KEY'\)/);
  assert.doesNotMatch(embedFunction, /VITE_MISTRAL_API_KEY/);
});

test('event image validation accepts supported images and rejects unsafe files', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    assert.equal(validateEventImage({ type, size: 10 }), true);
  }
  assert.throws(() => validateEventImage({ type: 'image/svg+xml', size: 10 }));
  assert.throws(() => validateEventImage({ type: 'image/png', size: MAX_EVENT_IMAGE_SIZE + 1 }));
});

test('event images use private intents and preserve URL fallback', () => {
  assert.match(migration, /'event-images', 'event-images', false/);
  assert.match(migration, /create function public\.prepare_event_image_upload/);
  assert.match(migration, /create function public\.finalize_event_image_upload/);
  assert.match(eventService, /target_event_id: eventId/);
  assert.match(eventService, /target_upload_intent_id: uploadIntent\.upload_intent_id/);
  assert.match(eventService, /createSignedUrl\(finalized\.image_storage_path/);
  assert.match(eventsPage, /type="file" accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(eventsPage, /event-image-url/);
  assert.doesNotMatch(migration, /insert into public\.google_workspace_jobs/i);
});
