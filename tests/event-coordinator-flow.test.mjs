import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getEventErrorMessage } from '../src/services/eventService.js';

const ui = readFileSync('src/pages/Events.jsx', 'utf8');
const service = readFileSync('src/services/eventService.js', 'utf8');
const migration = readFileSync('supabase/migrations/20260913000100_event_coordinator_assignment_flow.sql', 'utf8');

test('event form uses a chapter-dependent UUID coordinator dropdown', () => {
  assert.match(ui, /<select id="event-coordinator"/);
  assert.match(ui, /!form\.chapter_id/);
  assert.match(ui, /coordinator\.user_id/);
  assert.match(ui, /coordinator\.full_name.*coordinator\.email/);
  assert.doesNotMatch(ui, /<input id="event-coordinator"/);
  assert.match(ui, /coordinator_user_id: ''/);
});

test('coordinator results stay coupled to the chapter request that returned them', () => {
  assert.match(ui, /const coordinatorRequestRef = useRef\(0\)/);
  assert.match(ui, /coordinatorRequestRef\.current !== requestId/);
  assert.match(ui, /setCoordinatorChapterId\(chapterId\)/);
  assert.match(ui, /coordinatorChapterId === form\.chapter_id/);
  assert.match(ui, /coordinator_user_id: e\.target\.value/);
  assert.match(service, /target_coordinator_id: coordinatorUserId/);
});

test('event writes use the atomic RPC instead of direct table inserts', () => {
  assert.match(service, /rpc\('save_event_with_coordinator'/);
  assert.match(service, /target_coordinator_id: coordinatorUserId/);
  assert.doesNotMatch(service, /from\('events'\)\.insert/);
  assert.match(migration, /insert into public\.events[\s\S]*insert into public\.event_assignments/);
});

test('server validates role and chapter without queuing Google automation', () => {
  assert.match(migration, /ur\.role = 'event_coordinator'/);
  assert.match(migration, /ur\.chapter_id = target_chapter_id/);
  assert.match(migration, /c\.status = 'active'/);
  assert.match(migration, /revoke all on function public\.save_event_with_coordinator[\s\S]*from public, anon/);
  assert.doesNotMatch(migration, /insert into public\.google_workspace_jobs/i);
});

test('known database errors become actionable messages', () => {
  assert.equal(
    getEventErrorMessage({ message: 'Coordinator must be an active approved Event Coordinator in the selected chapter' }),
    'Select an active Event Coordinator assigned to this chapter.'
  );
  assert.equal(
    getEventErrorMessage({ message: 'Not authorized to update this event' }),
    'You are not authorized to update this event or its coordinator assignment.'
  );
});
