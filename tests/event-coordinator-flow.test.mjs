import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildEventRpcArgs, getEventErrorMessage, getEventValidationIssue, isUuid, isValidIsoDate, resolveCoordinatorSelection } from '../src/services/eventService.js';

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
  assert.match(ui, /directoryChapterId: coordinatorChapterId/);
  assert.match(service, /chapterId !== directoryChapterId/);
  assert.match(ui, /coordinator_user_id: e\.target\.value/);
  assert.match(service, /target_coordinator_id: coordinatorUserId/);
});

test('event writes use the atomic RPC instead of direct table inserts', () => {
  assert.match(service, /rpc\(\s*'save_event_with_coordinator'/);
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

test('Manila and Sinag Exe preserve one UUID through selection, review, validation, and RPC arguments', () => {
  const manilaId = '11111111-1111-4111-8111-111111111111';
  const sinagExeId = '22222222-2222-4222-8222-222222222222';
  const directory = [{ user_id: sinagExeId, full_name: 'Sinag Exe', email: 'sinag@example.test' }];
  const selected = resolveCoordinatorSelection({ chapterId: manilaId, directoryChapterId: manilaId, coordinatorUserId: sinagExeId, coordinators: directory });

  assert.equal(selected?.user_id, sinagExeId);
  assert.equal(isUuid(selected.user_id), true);
  assert.match(ui, /selectedCoordinatorOption\.full_name/);
  assert.match(ui, /addEvent\(payload, selectedCoordinatorOption\.user_id\)/);
  assert.match(service, /target_coordinator_id: coordinatorUserId/);
  assert.doesNotMatch(ui, /\[89ab\]\[0-9a-f\]\{12\}/);
});

test('RPC arguments preserve the resolved coordinator UUID and ISO date exactly', () => {
  const manilaId = '11111111-1111-4111-8111-111111111111';
  const sinagExeId = '22222222-2222-4222-8222-222222222222';
  const args = buildEventRpcArgs({
    event: {
      chapter_id: manilaId,
      title: 'Manila UAT event',
      type: 'Cycle Program',
      description: '',
      image_url: '',
      status: 'Scheduled',
      event_date: '2026-09-15',
    },
    coordinatorUserId: sinagExeId,
  });
  assert.deepEqual(Object.keys(args), [
    'target_event_id', 'target_chapter_id', 'target_coordinator_id', 'event_title',
    'event_type', 'event_description', 'event_image_url', 'event_status_value', 'event_date_value',
  ]);
  assert.equal(args.target_chapter_id, manilaId);
  assert.equal(args.target_coordinator_id, sinagExeId);
  assert.equal(args.event_date_value, '2026-09-15');
});

test('optional ISO event dates validate calendar days without timezone conversion', () => {
  assert.equal(isValidIsoDate(''), true);
  assert.equal(isValidIsoDate('2026-09-15'), true);
  assert.equal(isValidIsoDate('2028-02-29'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2026-02-30'), false);
  assert.equal(isValidIsoDate('09/15/2026'), false);
});

test('known server validation is field-linked while unknown failures stay generic', () => {
  assert.deepEqual(
    getEventValidationIssue({ message: 'Coordinator must be an active approved Event Coordinator in the selected chapter' }),
    { field: 'event-coordinator', stage: 1, message: 'Select an active Event Coordinator assigned to this chapter.' },
  );
  assert.equal(getEventValidationIssue({ code: 'XX000', message: 'unexpected internal failure' }), null);
  assert.match(ui, /setValidationErrors\(issue \? \[createValidationError/);
});

test('coordinator labels and stale chapter directories cannot substitute for UUID identity', () => {
  const manilaId = '11111111-1111-4111-8111-111111111111';
  const coordinatorId = '22222222-2222-4222-8222-222222222222';
  const directory = [{ user_id: coordinatorId, full_name: 'Sinag Exe', email: 'sinag@example.test' }];

  assert.equal(resolveCoordinatorSelection({ chapterId: manilaId, directoryChapterId: manilaId, coordinatorUserId: 'Sinag Exe', coordinators: directory }), null);
  assert.equal(resolveCoordinatorSelection({ chapterId: manilaId, directoryChapterId: '33333333-3333-4333-8333-333333333333', coordinatorUserId: coordinatorId, coordinators: directory }), null);
});
