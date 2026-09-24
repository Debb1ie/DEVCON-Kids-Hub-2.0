import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createPostEventReportRepository, MAX_REPORT_FILE_SIZE, validateReportFile } from '../src/services/postEventReportService.js';

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Local Supabase test environment is required');
assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname), 'Refusing to test against a non-loopback Supabase URL');

const adminApi = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const pass = (name) => results.push({ name, pass: true });
const check = (value, name) => { assert(value, name); pass(name); };
const expectError = async (operation, name) => {
  let failed = false;
  try {
    const result = await operation();
    failed = Boolean(result?.error);
  } catch {
    failed = true;
  }
  assert(failed, `${name}: expected an error`);
  pass(name);
};

const remoteGuard = createPostEventReportRepository({ client: adminApi, backendUrl: 'https://example.supabase.co' });
await assert.rejects(() => remoteGuard.loadByEvent(crypto.randomUUID()), /restricted to the local Supabase environment/);
pass('Repository refuses a non-loopback Supabase target');

const createIdentity = async (label, role, chapterId = null) => {
  const email = `${label}-${crypto.randomUUID()}@local.test`;
  const password = `Local-${crypto.randomUUID()}!`;
  const created = await adminApi.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: label } });
  assert.ifError(created.error);
  await adminApi.from('user_roles').delete().eq('user_id', created.data.user.id);
  const roleResult = await adminApi.from('user_roles').insert({ user_id: created.data.user.id, role, chapter_id: chapterId });
  assert.ifError(roleResult.error);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return { id: created.data.user.id, client, role };
};

const chapterA = (await adminApi.from('chapters').insert({ name: 'Local Chapter A' }).select().single()).data;
const chapterB = (await adminApi.from('chapters').insert({ name: 'Local Chapter B' }).select().single()).data;
const superAdmin = await createIdentity('super-admin', 'super_admin');
const admin = await createIdentity('admin', 'admin');
const chapterCoordinator = await createIdentity('chapter-coordinator', 'chapter_coordinator', chapterA.id);
const otherChapterCoordinator = await createIdentity('other-chapter', 'chapter_coordinator', chapterB.id);
const eventCoordinator = await createIdentity('event-coordinator', 'event_coordinator', chapterA.id);
const volunteer = await createIdentity('volunteer', 'volunteer', chapterA.id);
const pending = await createIdentity('pending', 'pending_volunteer');

const event = (await adminApi.from('events').insert({ chapter_id: chapterA.id, created_by: admin.id, title: 'Local Integration Event', chapter: chapterA.name, event_date: '2026-09-09' }).select().single()).data;
const secondEvent = (await adminApi.from('events').insert({ chapter_id: chapterA.id, created_by: admin.id, title: 'Self Approval Event', chapter: chapterA.name, event_date: '2026-09-10' }).select().single()).data;
const assignment = await admin.client.from('event_assignments').insert({ event_id: event.id, user_id: eventCoordinator.id, assignment_role: 'event_coordinator', assigned_by: admin.id });
assert.ifError(assignment.error); pass('Admin assigns a different Event Coordinator');
const coordinatorSession = await eventCoordinator.client.auth.getSession();
check(coordinatorSession.data.session?.user?.id === eventCoordinator.id, 'Event Coordinator has an authenticated local session');
const visibleAssignment = await eventCoordinator.client.from('event_assignments').select('*').eq('event_id', event.id);
assert.ifError(visibleAssignment.error);
check(visibleAssignment.data.length === 1, 'Event Coordinator can read own assignment');

const coordinatorRepo = createPostEventReportRepository({ client: eventCoordinator.client, backendUrl: url });
const draft = await coordinatorRepo.saveDraft({
  eventId: event.id, userId: eventCoordinator.id,
  report: { venue: 'Local Lab', coordinatorName: 'Event Coordinator', eventSummary: 'Local-only integration report' },
  attendance: { registeredCount: 30, attendedCount: 27, childrenReached: 24, volunteersInvolved: 3, notes: 'Three no-shows' },
  finance: { approvedBudget: 5000 },
  impact: { keyLearnings: 'Hands-on activities worked well.', challenges: 'Limited setup time.', communityImpact: 'Children completed an introductory activity.', recommendations: 'Add setup time.', satisfactionRating: 'excellent' },
  transactions: [{ id: crypto.randomUUID(), description: 'Learning materials', category: 'materials', amount: 1200 }],
});
check(draft.report.status === 'draft' && draft.transactions.length === 1, 'Event Coordinator creates and persists complete draft');
const loaded = await coordinatorRepo.loadByEvent(event.id);
check(loaded.attendance.attended_count === 27 && Number(loaded.finance.approved_budget) === 5000, 'Attendance and finance round-trip through repository');
check(loaded.impact.satisfaction_rating === 'excellent', 'Impact data round-trips through repository');

validateReportFile({ type: 'image/jpeg', size: 1 }); pass('JPEG accepted by client validation');
validateReportFile({ type: 'image/png', size: 1 }); pass('PNG accepted by client validation');
validateReportFile({ type: 'image/webp', size: 1 }); pass('WebP accepted by client validation');
validateReportFile({ type: 'application/pdf', size: 1 }); pass('PDF accepted by client validation');
assert.throws(() => validateReportFile({ type: 'text/plain', size: 1 })); pass('Unsupported MIME rejected before upload');
assert.throws(() => validateReportFile({ type: 'application/pdf', size: MAX_REPORT_FILE_SIZE + 1 })); pass('File over 25 MB rejected before upload');

const uploads = [
  ['photo.jpg', 'image/jpeg', 'event_photo'], ['image.png', 'image/png', 'event_documentation'],
  ['image.webp', 'image/webp', 'event_documentation'], ['report.pdf', 'application/pdf', 'impact_report'],
];
const attachments = [];
for (const [name, type, category] of uploads) {
  const file = new File([new Uint8Array([1, 2, 3, 4])], name, { type });
  attachments.push(await coordinatorRepo.uploadAttachment({ reportId: draft.report.id, eventId: event.id, category, file }));
}
check(attachments.length === 4 && attachments.every((item) => item.storage_path.startsWith(`events/${event.id}/reports/${draft.report.id}/`)), 'Four supported file types upload through intent-derived private paths');
const receipt = await coordinatorRepo.uploadAttachment({ reportId: draft.report.id, eventId: event.id, category: 'finance_support', transactionId: draft.transactions[0].id, file: new File([new Uint8Array([5, 6])], 'receipt.pdf', { type: 'application/pdf' }) });
const receiptLink = await eventCoordinator.client.from('post_event_report_transaction_attachments').select('*').eq('attachment_id', receipt.id).single();
assert.ifError(receiptLink.error); pass('Finance receipt links to a transaction in the same report');
const signedUrl = await coordinatorRepo.createSignedUrl(attachments[0], 60);
const download = await fetch(signedUrl);
check(download.ok, 'Authorized signed URL downloads a private object');
await expectError(() => eventCoordinator.client.storage.from('event-report-attachments').upload(`events/${event.id}/arbitrary.jpg`, new Blob([new Uint8Array([1])], { type: 'image/jpeg' })), 'Arbitrary Storage path is rejected');
await expectError(() => volunteer.client.storage.from('event-report-attachments').createSignedUrl(attachments[0].storage_path, 60), 'Volunteer cannot create an attachment signed URL');

const submitted = await coordinatorRepo.submit(draft.report.id);
check(submitted.status === 'submitted', 'Event Coordinator submits report');
const submittedEdit = await eventCoordinator.client.from('post_event_report_attendance').update({ attended_count: 26 }).eq('report_id', draft.report.id).select();
check(!submittedEdit.error && submittedEdit.data.length === 0, 'Submitted report content is immutable');
const adminRepo = createPostEventReportRepository({ client: admin.client, backendUrl: url });
const revision = await adminRepo.requestRevision(draft.report.id, 'Clarify participant outcome.');
check(revision.status === 'needs_revision', 'Different Admin requests revision');
const revised = await coordinatorRepo.saveDraft({ reportId: draft.report.id, eventId: event.id, userId: eventCoordinator.id, report: { venue: 'Local Lab', coordinatorName: 'Event Coordinator', eventSummary: 'Updated outcome details' }, attendance: { registeredCount: 30, attendedCount: 27, childrenReached: 24, volunteersInvolved: 3 }, finance: { approvedBudget: 5000 }, impact: { keyLearnings: 'Hands-on activities worked well.', communityImpact: 'Children completed and explained the introductory activity.', satisfactionRating: 'excellent' }, transactions: draft.transactions });
check(revised.report.status === 'needs_revision', 'Revision content saves while needs revision');
await coordinatorRepo.resubmit(draft.report.id); pass('Event Coordinator resubmits revision');
const approved = await adminRepo.approve(draft.report.id, 'Verified locally.');
check(approved.status === 'approved', 'Different Admin approves report');
const approvedEdit = await eventCoordinator.client.from('post_event_report_attendance').update({ attended_count: 25 }).eq('report_id', draft.report.id).select();
check(!approvedEdit.error && approvedEdit.data.length === 0, 'Approved report data is immutable');
const attemptedRemoval = await eventCoordinator.client.storage.from('event-report-attachments').remove([attachments[0].storage_path]);
assert.ifError(attemptedRemoval.error);
const immutableDownload = await fetch(await adminRepo.createSignedUrl(attachments[0], 60));
check(immutableDownload.ok, 'Approved attachment object remains after unauthorized delete no-op');

const adminSubmitterRepo = createPostEventReportRepository({ client: admin.client, backendUrl: url });
const selfDraft = await adminSubmitterRepo.saveDraft({ eventId: secondEvent.id, userId: admin.id, report: { venue: 'Local Venue' }, attendance: { registeredCount: 1, attendedCount: 1, childrenReached: 1, volunteersInvolved: 0 }, finance: { approvedBudget: 0 }, impact: { keyLearnings: 'Test learning', communityImpact: 'Test impact' }, transactions: [] });
await adminSubmitterRepo.submit(selfDraft.report.id);
await expectError(() => adminSubmitterRepo.approve(selfDraft.report.id), 'Submitting Admin cannot approve own report');
const superRepo = createPostEventReportRepository({ client: superAdmin.client, backendUrl: url });
check((await superRepo.approve(selfDraft.report.id)).status === 'approved', 'Different Super Admin can approve report');

for (const [identity, expected, label] of [
  [superAdmin, true, 'Super Admin'], [admin, true, 'Admin'], [chapterCoordinator, true, 'same-chapter Chapter Coordinator'],
  [otherChapterCoordinator, false, 'other-chapter Chapter Coordinator'], [eventCoordinator, true, 'assigned Event Coordinator'],
  [volunteer, false, 'Volunteer'], [pending, false, 'Pending Volunteer'],
]) {
  const query = await identity.client.from('post_event_reports').select('id').eq('id', draft.report.id);
  assert.ifError(query.error); check((query.data.length > 0) === expected, `${label} report access matches RLS`);
}

const reviewHistory = await admin.client.from('post_event_report_reviews').select('*').eq('report_id', draft.report.id);
check(reviewHistory.data?.length === 4, 'Submit, revision, resubmit, and approval are recorded in review history');
console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
