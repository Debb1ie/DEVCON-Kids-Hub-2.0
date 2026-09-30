import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeEventReport, REPORT_CARD_LABELS, reportFormLink, reportReviewLink } from '../src/services/eventReportState.js';
import { filterReviewQueue } from '../src/services/postEventReportQueue.js';

process.env.VITE_SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.VITE_SUPABASE_ANON_KEY ||= 'test-anon-key';
const { createPostEventReportRepository } = await import('../src/services/postEventReportService.js');

const page = readFileSync('src/pages/Events.jsx', 'utf8');
const css = readFileSync('src/pages/Events.css', 'utf8');
const reportPage = readFileSync('src/pages/PostEventReport.jsx', 'utf8');
const service = readFileSync('src/services/postEventReportService.js', 'utf8');
const exportsMigration = readFileSync('supabase/migrations/20260923000100_approved_report_exports.sql', 'utf8');
const roleSeparation = readFileSync('supabase/migrations/20260929000300_post_event_report_role_separation.sql', 'utf8');

const completed = { id: 'e1', status: 'Completed', title: 'Test Automation', event_assignments: [{ user_id: 'coord' }] };
const coordinator = { roleKey: 'event_coordinator', userId: 'coord' };
const otherCoordinator = { roleKey: 'event_coordinator', userId: 'someone-else' };
const reviewer = { roleKey: 'super_admin', userId: 'admin' };

test('1. the event image sits in its own fixed-ratio box and cannot cover the title', () => {
  assert.match(css, /\.event-card-media \{[\s\S]*?aspect-ratio: 16 \/ 9;[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.event-card-media img \{[^}]*object-fit: cover;/);
  assert.match(page, /<EventCardMedia[^>]*\/>\s*<div className="event-card-body">[\s\S]*?className="event-card-title"/);
  assert.doesNotMatch(css, /\.event-card-image > \.status-badge \{\s*position: absolute/, 'no badge floats over the image');
});

test('2. missing or broken images fall back safely', () => {
  assert.match(page, /onError=\{\(\) => setBroken\(true\)\}/);
  assert.match(page, /'Image unavailable' : 'No event image'/);
  assert.match(page, /key=\{event\.image_url \|\| 'none'\}/);
});

test('3. cards use a bounded responsive grid, not the stretched list layout', () => {
  assert.doesNotMatch(css, /grid-template-columns: 11rem minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.event-card-image \{ min-height: 100%; aspect-ratio: 16 \/ 9;/);
  assert.match(css, /\.events-page \.events-grid \{[\s\S]*?grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 16\.5rem\), 1fr\)\);/);
  assert.match(css, /\.event-card-title \{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?-webkit-line-clamp: 2;/);
});

test('4. a completed event shows its report status and the next step', () => {
  const submitted = describeEventReport({ event: completed, report: { id: 'r1', status: 'submitted' }, ...reviewer });
  assert.equal(submitted.label, 'Pending Review');
  assert.deepEqual(submitted.action, { label: 'Review report', to: reportReviewLink('r1') });
  assert.match(page, /<StatusBadge status=\{event\.status \|\| 'Draft'\} \/>[\s\S]*?Post Event Report[\s\S]*?<StatusBadge status=\{report\.label\} \/>/);
});

test('5. event status and report status stay separate lifecycles', () => {
  assert.equal(describeEventReport({ event: { ...completed, status: 'Scheduled' }, report: null, ...coordinator }), null, 'no report block before completion');
  const noReport = describeEventReport({ event: completed, report: null, ...reviewer });
  assert.equal(noReport.label, 'Not Submitted', 'Completed never implies Approved');
  const approvedNoExport = describeEventReport({ event: completed, report: { id: 'r', status: 'approved', exportStatus: null }, ...reviewer });
  assert.match(approvedNoExport.helper, /Export has not started/, 'Approved never implies Exported');
  assert.equal(REPORT_CARD_LABELS.submitted, 'Pending Review');
});

test('coordinators only get actions for their assigned events', () => {
  const create = describeEventReport({ event: completed, report: null, ...coordinator });
  assert.deepEqual(create.action, { label: 'Create report', to: reportFormLink('e1') });
  assert.equal(describeEventReport({ event: completed, report: null, ...otherCoordinator }).action, null);
  const submitted = describeEventReport({ event: completed, report: { id: 'r1', status: 'submitted' }, ...coordinator });
  assert.equal(submitted.label, 'Pending Review');
  assert.notEqual(submitted.action?.label, 'Create report', 'a submitted report is never offered for creation again');
  assert.equal(describeEventReport({ event: completed, report: null, roleKey: 'volunteer', userId: 'coord' }).action, null);
});

test('6. submitted reports are what the Review Queue loads for reviewers', async () => {
  const calls = [];
  const client = { from(table) { const q = { select() { return q; }, in(col, values) { calls.push([table, col, values]); return q; }, order() { return Promise.resolve({ data: [], error: null }); } }; return q; } };
  await createPostEventReportRepository({ client }).listReviewQueue();
  assert.deepEqual(calls[0], ['post_event_reports', 'status', ['submitted', 'needs_revision', 'approved']]);
  const rows = [{ status: 'submitted', eventName: 'Test Automation' }, { status: 'draft', eventName: 'Draft only' }];
  assert.deepEqual(filterReviewQueue(rows).map((r) => r.eventName), ['Test Automation']);
});

test('7. a draft is never presented as pending approval', () => {
  const author = describeEventReport({ event: completed, report: { id: 'r', status: 'draft' }, ...coordinator });
  assert.equal(author.label, 'Draft');
  assert.match(author.helper, /not been submitted/);
  assert.equal(author.action.label, 'Continue report');
  assert.match(roleSeparation, /has_role\(array\['super_admin', 'admin'\]\)\s*and r\.status in \('submitted', 'needs_revision', 'approved', 'archived'\)/, 'RLS keeps drafts out of reviewer queries');
});

test('8. needs revision routes the author to revise and the reviewer to view', () => {
  const author = describeEventReport({ event: completed, report: { id: 'r', status: 'needs_revision' }, ...coordinator });
  assert.equal(author.action.label, 'Revise report');
  const admin = describeEventReport({ event: completed, report: { id: 'r', status: 'needs_revision' }, ...reviewer });
  assert.equal(admin.action.to, reportReviewLink('r'));
  assert.match(admin.helper, /Returned to the coordinator/);
});

test('9. approved shows the real export state', () => {
  const states = ['completed', 'pending', 'processing', 'failed'].map((exportStatus) => describeEventReport({ event: completed, report: { id: 'r', status: 'approved', exportStatus }, ...reviewer }).helper);
  assert.match(states[0], /exported to Google Drive/);
  assert.match(states[1], /queued/);
  assert.match(states[2], /in progress/);
  assert.match(states[3], /failed/);
});

test('10. role and chapter scoping stay in the database, not the UI', () => {
  assert.match(service, /Report state per event for the Events page\. RLS decides visibility/);
  assert.match(service, /\.from\('post_event_reports'\)\s*\.select\('id,event_id,status,submitted_by,submitted_at,approved_at'\)\s*\.in\('event_id', ids\)/);
  assert.doesNotMatch(service, /service_role|SERVICE_ROLE/);
  assert.match(roleSeparation, /reports_insert_mvp[\s\S]*?assignment_role = 'event_coordinator'/);
});

test('11. a report cannot be duplicated from the Events page or report form', () => {
  assert.match(readFileSync('supabase/migrations/20260909000100_post_event_report_mvp.sql', 'utf8'), /unique|UNIQUE/);
  assert.match(reportPage, /const requestedEventId = searchParams\.get\('event'\)/);
  assert.match(reportPage, /loadEventData\(event\)/, 'deep links load the existing report instead of creating one');
});

test('12. export is queued only when a report becomes approved', () => {
  assert.match(exportsMigration, /if new\.status::text = 'approved' and old\.status::text is distinct from 'approved' then/);
  assert.match(exportsMigration, /Only approved reports can be exported\./);
});

test('13. approved export stays idempotent', () => {
  assert.match(exportsMigration, /on conflict \(report_id\) do nothing/);
  assert.match(exportsMigration, /idempotency_key text not null unique/);
});
