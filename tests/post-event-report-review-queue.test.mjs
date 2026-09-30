import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canAccessRoute, ROLES } from '../src/auth/permissions.js';
import { EXPORT_STATUS_LABELS, filterReviewQueue, normalizePostEventReports, prioritizeReviewQueue, REPORT_STATUS_LABELS } from '../src/services/postEventReportQueue.js';

const page = readFileSync('src/pages/PostEventReportReviewQueue.jsx', 'utf8');
const styles = readFileSync('src/pages/PostEventReportReviewQueue.css', 'utf8');
const service = readFileSync('src/services/postEventReportService.js', 'utf8');
const form = readFileSync('src/pages/PostEventReport.jsx', 'utf8');
const detail = readFileSync('src/pages/PostEventReportReviewDetail.jsx', 'utf8');
const app = readFileSync('src/App.jsx', 'utf8');

const reports = [
  { id: 'approved-1', eventName: 'Cebu Robotics', submitterName: 'Alex Admin', chapter: 'Cebu', status: 'approved', exportStatus: 'completed', submittedAt: '2026-09-20' },
  { id: 'submitted-1', eventName: 'UAT Event Report Workflow', submitterName: 'John Ray Cacananta', chapter: 'Manila', status: 'submitted', exportStatus: null, submittedAt: '2026-09-29' },
  { id: 'revision-1', eventName: 'Davao Web Lab', submitterName: 'Taylor User', chapter: 'Davao', status: 'needs_revision', exportStatus: 'failed', submittedAt: '2026-09-21' },
];

test('review queue loads reports and prioritizes submitted rows', () => {
  assert.match(page, /postEventReportRepository\.listReviewQueue\(\)/);
  assert.equal(prioritizeReviewQueue(reports)[0].id, 'submitted-1');
  assert.match(service, /from\('post_event_reports'\)[\s\S]*events\(id,title,chapter,chapter_id,event_date\)/);
});

test('submitter names resolve from the stable profile relationship', () => {
  assert.match(service, /from\('profiles'\)\.select\('id,full_name,email'\)\.in\('id', submitterIds\)/);
  assert.match(service, /profileById\.get\(report\.submitted_by\)/);
  assert.match(service, /submitter\?\.full_name \|\| submitter\?\.email/);
  assert.doesNotMatch(service, /submitterName:\s*report\.coordinator_name/);
});

test('status, chapter, and event or submitter search filters compose', () => {
  assert.deepEqual(filterReviewQueue(reports).map((item) => item.id), ['submitted-1']);
  assert.deepEqual(filterReviewQueue(reports, { status: 'all', chapter: 'Cebu' }).map((item) => item.id), ['approved-1']);
  assert.deepEqual(filterReviewQueue(reports, { status: 'all', search: 'john ray' }).map((item) => item.id), ['submitted-1']);
  assert.deepEqual(filterReviewQueue(reports, { status: 'all', search: 'robotics' }).map((item) => item.id), ['approved-1']);
});

test('only Admin and Super Admin can access the review queue', () => {
  const route = '/dashboard/post-event-report/review';
  assert.equal(canAccessRoute(ROLES.SUPER_ADMIN, route), true);
  assert.equal(canAccessRoute(ROLES.ADMIN, route), true);
  for (const role of [ROLES.CHAPTER_COORDINATOR, ROLES.EVENT_COORDINATOR, ROLES.VOLUNTEER, ROLES.PENDING_VOLUNTEER]) assert.equal(canAccessRoute(role, route), false);
  assert.match(app, /ProtectedRoute route="\/dashboard\/post-event-report\/review"/);
});

test('Review opens a dedicated read-only detail route by stable report ID', () => {
  assert.match(page, /navigate\(`\/dashboard\/post-event-report\/review\/\$\{encodeURIComponent\(reportId\)\}`\)/);
  assert.match(detail, /postEventReportRepository\.loadById\(reportId\)/);
  assert.match(detail, /General Information/);
  assert.match(detail, /Reviewer Actions/);
  assert.doesNotMatch(detail, /Save draft|Submit report|Existing event/);
  assert.match(service, /from\('post_event_reports'\)\.select\('\*'\)\.eq\('id', reportId\)\.maybeSingle\(\)/);
});

test('eligible event report relations are normalized at the repository boundary', () => {
  const report = { id: 'report-1', status: 'submitted' };
  assert.deepEqual(normalizePostEventReports([report]), [report]);
  assert.deepEqual(normalizePostEventReports(report), [report]);
  assert.deepEqual(normalizePostEventReports(null), []);
  assert.match(service, /post_event_reports: normalizePostEventReports\(event\.post_event_reports\)/);
});

test('review-detail failures cannot expose an authoring form', () => {
  assert.match(detail, /The report was not found or is outside your review scope\./);
  assert.match(detail, /!loading && error/);
  assert.doesNotMatch(detail, /persistDraft|saveDraft|Submit report/);
});

test('report and export labels map actual schema states', () => {
  assert.equal(REPORT_STATUS_LABELS.submitted, 'Submitted');
  assert.equal(REPORT_STATUS_LABELS.approved, 'Approved');
  assert.equal(EXPORT_STATUS_LABELS.pending, 'Export Pending');
  assert.equal(EXPORT_STATUS_LABELS.completed, 'Export Completed');
  assert.match(service, /post_event_report_exports.*select\('report_id,status'\)/s);
});

test('queue includes the required empty state and mobile card structure', () => {
  assert.match(page, /No reports are waiting for review\./);
  assert.match(page, /Submitted Post Event Reports will appear here when they are ready for approval\./);
  assert.match(page, /className="review-queue-table"/);
  assert.match(page, /className="review-queue-cards"/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.review-queue-table-wrap \{ display: none; \}[\s\S]*\.review-queue-cards \{ display: grid;/);
});
