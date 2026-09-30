import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canAccessRoute, canPerform, ROLES } from '../src/auth/permissions.js';

const app = readFileSync('src/App.jsx', 'utf8');
const nav = readFileSync('src/components/PostEventReportNav.jsx', 'utf8');
const author = readFileSync('src/pages/PostEventReport.jsx', 'utf8');
const detail = readFileSync('src/pages/PostEventReportReviewDetail.jsx', 'utf8');
const service = readFileSync('src/services/postEventReportService.js', 'utf8');
const migration = readFileSync('supabase/migrations/20260929000300_post_event_report_role_separation.sql', 'utf8');

test('Event Coordinator is the only report author role', () => {
  assert.equal(canAccessRoute(ROLES.EVENT_COORDINATOR, '/dashboard/post-event-report'), true);
  for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.CHAPTER_COORDINATOR, ROLES.VOLUNTEER]) {
    assert.equal(canAccessRoute(role, '/dashboard/post-event-report'), false);
    assert.equal(canPerform(role, 'report.create'), false);
  }
  const assigned = { actorUserId: 'coordinator', eventId: 'event-1', assignments: [{ event_id: 'event-1', user_id: 'coordinator' }] };
  assert.equal(canPerform(ROLES.EVENT_COORDINATOR, 'report.create', assigned), true);
  assert.equal(canPerform(ROLES.EVENT_COORDINATOR, 'report.edit_own', assigned), true);
  assert.equal(canPerform(ROLES.EVENT_COORDINATOR, 'report.submit', assigned), true);
  assert.equal(canPerform(ROLES.EVENT_COORDINATOR, 'report.review'), false);
  assert.equal(canPerform(ROLES.EVENT_COORDINATOR, 'report.approve'), false);
  assert.equal(canPerform(ROLES.EVENT_COORDINATOR, 'report.request_revision'), false);
});

test('Admin and Super Admin are reviewer-only roles', () => {
  for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
    assert.equal(canAccessRoute(role, '/dashboard/post-event-report/review'), true);
    assert.equal(canAccessRoute(role, '/dashboard/post-event-report/review/:reportId'), true);
    assert.equal(canPerform(role, 'report.review'), true);
    assert.equal(canPerform(role, 'report.request_revision'), true);
    assert.equal(canPerform(role, 'report.approve', { actorUserId: 'reviewer', submittedBy: 'author' }), true);
  }
  assert.match(app, /\['admin', 'super_admin'\]\.includes\(roleKey\)[\s\S]*Navigate to="\/dashboard\/post-event-report\/review" replace/);
  assert.match(nav, /canAuthor && <NavLink[\s\S]*Report Form/);
  assert.match(nav, /canReview && <NavLink[\s\S]*Review Queue/);
});

test('coordinator event eligibility uses authenticated UUID assignment joins', () => {
  assert.match(service, /client\.auth\.getUser\(\)/);
  assert.match(service, /event_assignments!inner\(user_id,assignment_role\)/);
  assert.match(service, /\.eq\('event_assignments\.user_id', userId\)/);
  assert.match(service, /\.eq\('event_assignments\.assignment_role', 'event_coordinator'\)/);
  assert.doesNotMatch(service, /\.eq\([^\n]*coordinator[^\n]*user/i);
});

test('author and reviewer interfaces do not mix mutation controls', () => {
  assert.match(author, /Complete and submit the report for your assigned event\./);
  assert.doesNotMatch(author, /isAdmin&&status==='submitted'/);
  assert.match(detail, /Request revision/);
  assert.match(detail, /Approve report/);
  assert.doesNotMatch(detail, /Save draft|Submit report|report-steps/);
  assert.match(detail, /user\.id === data\?\.report\?\.submitted_by/);
  assert.match(detail, /You cannot approve a report you submitted\. Another authorized reviewer must review this report\./);
  assert.match(detail, /canReview && !isOwnReport/);
});

test('review-only migration denies reviewer creation and editing', () => {
  assert.match(migration, /public\.has_role\(array\['event_coordinator'\]\)/);
  assert.match(migration, /submitted_by = auth\.uid\(\)[\s\S]*status in \('draft', 'needs_revision'\)/);
  assert.match(migration, /ea\.user_id = auth\.uid\(\)[\s\S]*ea\.assignment_role = 'event_coordinator'/);
  const insertPolicy = migration.match(/create policy reports_insert_mvp[\s\S]*?\n\);/i)?.[0] || '';
  assert.doesNotMatch(insertPolicy, /super_admin|admin|chapter_coordinator/);
  assert.match(migration, /Do not apply automatically/);
  assert.match(migration, /r\.submitted_by <> auth\.uid\(\)/);
});

test('deployed reviewer transition contract preserves separation of duties', () => {
  const baseline = readFileSync('supabase/migrations/20260909000100_post_event_report_mvp.sql', 'utf8');
  assert.match(baseline, /create function public\.can_approve_report[\s\S]*?r\.status = 'submitted'[\s\S]*?r\.submitted_by <> auth\.uid\(\)[\s\S]*?has_role\(array\['super_admin', 'admin'\]\)/);
  assert.match(baseline, /old\.status = 'submitted' and new\.status = 'approved'[\s\S]*?can_approve_report\(old\.id\)[\s\S]*?Only a non-submitting Admin or Super Admin may approve/);
  assert.match(baseline, /create policy reports_update_mvp[\s\S]*?using \([\s\S]*?can_approve_report\(id\)[\s\S]*?with check \(public\.can_access_report\(id\)\)/);
});
