import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createPostEventReportRepository } from '../src/services/postEventReportService.js';

const url = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Local Supabase credentials are required');
assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname), 'Refusing a non-local target');
const root = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const passed = [];
const pass = (name) => passed.push(name);

async function identity(label, role, chapterId = null) {
  const email = `${label}-${crypto.randomUUID()}@local.test`;
  const password = `Local-${crypto.randomUUID()}!Aa1`;
  const created = await root.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  assert.ifError((await root.from('user_roles').delete().eq('user_id', created.data.user.id)).error);
  assert.ifError((await root.from('user_roles').insert({ user_id: created.data.user.id, role, chapter_id: chapterId })).error);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { id: created.data.user.id, client };
}

const chapter = (await root.from('chapters').insert({ name: `Google Local ${crypto.randomUUID()}` }).select().single()).data;
const superAdmin = await identity('google-super', 'super_admin');
const admin = await identity('google-admin', 'admin');
const chapterCoordinator = await identity('google-chapter', 'chapter_coordinator', chapter.id);
const coordinator = await identity('google-coordinator', 'event_coordinator', chapter.id);
const volunteer = await identity('google-volunteer', 'volunteer', chapter.id);
const pending = await identity('google-pending', 'pending_volunteer');

const deniedActors = [
  ['anonymous', anonymous], ['Admin', admin.client], ['Chapter Coordinator', chapterCoordinator.client],
  ['Event Coordinator', coordinator.client], ['Volunteer', volunteer.client], ['Pending Volunteer', pending.client],
];
for (const [label, client] of deniedActors) {
  const settings = await client.rpc('get_google_workspace_settings');
  assert(settings.error, `${label} configuration access must fail`);
  const retry = await client.rpc('retry_google_workspace_job', { job_id: crypto.randomUUID() });
  assert(retry.error, `${label} retry access must fail`);
  pass(`${label} cannot configure or retry`);
}

const invalid = await superAdmin.client.rpc('update_google_workspace_settings', {
  shared_drive_root: 'not a Google resource', report_sheet: 'also invalid', automatic_folders: true, sheet_sync: true, sheet_tab_name: 'Post Event Reports',
});
assert(invalid.error, 'Invalid resource identifiers must be rejected'); pass('Server validates Google resource identifiers');
const configured = await superAdmin.client.rpc('update_google_workspace_settings', {
  shared_drive_root: 'local_folder_12345', report_sheet: 'local_sheet_12345', automatic_folders: true, sheet_sync: true, sheet_tab_name: 'Post Event Reports',
});
assert.ifError(configured.error); pass('Super Admin saves non-secret integration configuration');

const event = (await superAdmin.client.from('events').insert({ chapter_id: chapter.id, created_by: superAdmin.id, title: 'Local Automation Event', chapter: chapter.name, event_date: '2026-09-10' }).select().single()).data;
assert(event?.id, 'Event must be created');
let folderJobs = await root.from('google_workspace_jobs').select('*').eq('event_id', event.id).eq('job_type', 'create_event_folder');
assert.equal(folderJobs.data.length, 1); pass('Event creation queues exactly one folder job');
assert.ifError((await superAdmin.client.from('events').update({ description: 'No duplicate folder job' }).eq('id', event.id)).error);
folderJobs = await root.from('google_workspace_jobs').select('*').eq('event_id', event.id).eq('job_type', 'create_event_folder');
assert.equal(folderJobs.data.length, 1); pass('Repeated event processing does not duplicate folder jobs');

assert.ifError((await superAdmin.client.from('event_assignments').insert({ event_id: event.id, user_id: coordinator.id, assignment_role: 'event_coordinator', assigned_by: superAdmin.id })).error);
const coordinatorReports = createPostEventReportRepository({ client: coordinator.client, backendUrl: url });
const reviewerReports = createPostEventReportRepository({ client: superAdmin.client, backendUrl: url });
const draft = await coordinatorReports.saveDraft({
  eventId: event.id, userId: coordinator.id, report: { venue: 'Local Lab', coordinatorName: 'Coordinator', eventSummary: 'Automation test' },
  attendance: { registeredCount: 12, attendedCount: 11, childrenReached: 10, volunteersInvolved: 2 }, finance: { approvedBudget: 1000 },
  impact: { keyLearnings: 'Local learning', communityImpact: 'Local impact' }, transactions: [],
});
await coordinatorReports.submit(draft.report.id);
await reviewerReports.requestRevision(draft.report.id, 'Local revision requested.');
await coordinatorReports.resubmit(draft.report.id);
await reviewerReports.approve(draft.report.id, 'Approved locally.');
const reportJobs = await root.from('google_workspace_jobs').select('*').eq('report_id', draft.report.id).eq('job_type', 'sync_report_sheet');
assert.equal(reportJobs.data.length, 4); pass('Submission, revision, resubmission, and approval each queue an idempotent Sheet job');

const failedJob = folderJobs.data[0];
assert.ifError((await root.from('google_workspace_jobs').update({ status: 'failed', safe_error_message: 'Safe local failure' }).eq('id', failedJob.id)).error);
assert((await admin.client.rpc('retry_google_workspace_job', { job_id: failedJob.id })).error, 'Admin retry must fail');
assert.ifError((await superAdmin.client.rpc('retry_google_workspace_job', { job_id: failedJob.id })).error);
pass('Failed jobs retain safe state and only Super Admin can retry');

for (const [label, client] of deniedActors.slice(1)) {
  const hiddenJobs = await client.from('google_workspace_jobs').select('id');
  assert.ifError(hiddenJobs.error); assert.equal(hiddenJobs.data.length, 0); pass(`RLS hides job history from ${label}`);
}
const audits = await root.from('audit_logs').select('action').in('action', ['UPDATE_GOOGLE_WORKSPACE_SETTINGS', 'RETRY_GOOGLE_WORKSPACE_JOB']);
assert(audits.data.some((row) => row.action === 'UPDATE_GOOGLE_WORKSPACE_SETTINGS'));
assert(audits.data.some((row) => row.action === 'RETRY_GOOGLE_WORKSPACE_JOB')); pass('Configuration and retry actions are audited safely');

console.log(JSON.stringify({ passed: passed.length, results: passed }, null, 2));
