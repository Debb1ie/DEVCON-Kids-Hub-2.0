import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildEventReportForm } from '../src/services/postEventReportForm.js';

const page = readFileSync('src/pages/PostEventReport.jsx', 'utf8');
const service = readFileSync('src/services/postEventReportService.js', 'utf8');
const migration = readFileSync('supabase/migrations/20260929000200_event_report_workflow.sql', 'utf8');

test('selected event supplies every event-owned report field and stable identity', () => {
  const form = buildEventReportForm({
    id: 'event-1', title: 'Hour of AI — Manila', chapter: 'Manila', chapter_id: 'chapter-1',
    event_date: '2026-09-29', venue: 'Community Hall', coordinator: 'Sinag Exe',
  });
  assert.deepEqual(
    { id: form.eventId, name: form.eventName, chapter: form.chapter, date: form.eventDate, venue: form.venue, coordinator: form.coordinator },
    { id: 'event-1', name: 'Hour of AI — Manila', chapter: 'Manila', date: '2026-09-29', venue: 'Community Hall', coordinator: 'Sinag Exe' },
  );
});

test('existing snapshot values load while missing coordinator is explicit', () => {
  const event = { id: 'event-2', title: 'Workshop', chapter: 'Cebu', event_date: '2026-10-01', venue: 'Event venue' };
  assert.equal(buildEventReportForm(event).coordinator, 'No coordinator assigned');
  const form = buildEventReportForm(event, { report: { venue: 'Saved venue', coordinator_name: 'Saved coordinator', event_summary: 'Outcome' } });
  assert.equal(form.venue, 'Saved venue');
  assert.equal(form.coordinator, 'Saved coordinator');
  assert.equal(form.summary, 'Outcome');
});

test('report selector refetches authorized events and explains existing reports', () => {
  assert.match(service, /listEligibleEvents/);
  assert.match(service, /from\('events'\)[\s\S]*post_event_reports\(id,status\)/);
  assert.match(page, /useEffect\(\(\) => \{[\s\S]*listEligibleEvents\(\)/);
  assert.match(page, /Report already exists/);
  assert.doesNotMatch(service, /restricted to the local Supabase environment/);
  assert.doesNotMatch(service, /service_role|SERVICE_ROLE/);
});

test('event-derived fields are read-only while the summary remains editable', () => {
  for (const field of ['form.eventName', 'form.chapter', 'form.eventDate', 'form.venue', 'form.coordinator']) {
    assert.match(page, new RegExp(`disabled[^>]*value=\\{${field.replace('.', '\\.')}\\}`));
  }
  assert.match(page, /value=\{form\.summary\} onChange=/);
});

test('review-only migration adds venue to the atomic event/coordinator write', () => {
  assert.match(migration, /alter table public\.events add column if not exists venue text/i);
  assert.match(migration, /event_date_value date,\s*event_venue text/i);
  assert.match(migration, /insert into public\.events[\s\S]*event_date, venue/i);
  assert.match(migration, /grant execute on function public\.save_event_with_coordinator[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /drop function if exists public\.save_event_with_coordinator\(uuid,uuid,uuid,text,text,text,text,text,date\)/i);
  assert.doesNotMatch(migration, /service_role/i);
});

test('one report per event remains enforced by the deployed report migration', () => {
  const reportMigration = readFileSync('supabase/migrations/20260909000100_post_event_report_mvp.sql', 'utf8');
  assert.match(reportMigration, /post_event_reports_event_id_unique unique \(event_id\)/i);
});
