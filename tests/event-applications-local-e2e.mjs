import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Local Supabase credentials are required');
assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname), 'Refusing a non-loopback target');

const root = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const passed = [];
const check = (condition, name) => { assert(condition, name); passed.push(name); };
const expectFailure = async (operation, name) => {
  let result;
  try { result = await operation(); } catch (error) { result = { error }; }
  assert(result?.error, `${name}: expected failure`);
  passed.push(name);
};

async function identity(label, role, chapterId = null) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}!Aa1`;
  const created = await root.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: label } });
  assert.ifError(created.error);
  const assigned = await root.from('user_roles').update({ role, chapter_id: chapterId }).eq('user_id', created.data.user.id).select();
  assert.ifError(assigned.error);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { id: created.data.user.id, client };
}

const chapterA = (await root.from('chapters').insert({ name: `Applications A ${crypto.randomUUID()}` }).select().single()).data;
const chapterB = (await root.from('chapters').insert({ name: `Applications B ${crypto.randomUUID()}` }).select().single()).data;
assert(chapterA && chapterB);
const inactiveChapter = (await root.from('chapters').insert({ name: `Inactive ${crypto.randomUUID()}`, status: 'inactive' }).select().single()).data;
await expectFailure(() => root.from('events').insert({ title: 'Missing chapter' }), 'New event without chapter UUID is rejected');
await expectFailure(() => root.from('events').insert({ title: 'Numeric chapter', chapter_id: '1' }), 'Numeric chapter identifier is rejected');
await expectFailure(() => root.from('events').insert({ title: 'Unknown chapter', chapter_id: crypto.randomUUID() }), 'Unknown chapter UUID is rejected');
await expectFailure(() => root.from('events').insert({ title: 'Inactive chapter', chapter_id: inactiveChapter.id }), 'Inactive chapter UUID is rejected');
const superAdmin = await identity('super-admin', 'super_admin');
const admin = await identity('admin', 'admin');
const chapterAReview = await identity('chapter-a', 'chapter_coordinator', chapterA.id);
const chapterBReview = await identity('chapter-b', 'chapter_coordinator', chapterB.id);
const assignedCoordinator = await identity('assigned-event', 'event_coordinator', chapterA.id);
const unassignedCoordinator = await identity('unassigned-event', 'event_coordinator', chapterA.id);
const volunteerA = await identity('volunteer-a', 'volunteer', chapterA.id);
const volunteerB = await identity('volunteer-b', 'volunteer', chapterB.id);
const pending = await identity('pending', 'pending_volunteer');

const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
const yesterday = new Date(Date.now() - 86_400_000).toISOString();
async function event(values) {
  const result = await root.from('events').insert({
    chapter_id: chapterA.id, created_by: admin.id, title: `Local ${crypto.randomUUID()}`,
    status: 'Scheduled', event_date: '2026-09-30', is_published: true,
    applications_open: true, application_deadline: tomorrow, volunteer_capacity: 3, ...values,
  }).select().single();
  assert.ifError(result.error);
  return result.data;
}

const openEvent = await event({});
const otherEvent = await event({});
const closedEvent = await event({ applications_open: false });
const pastEvent = await event({ application_deadline: yesterday });
const fullEvent = await event({ volunteer_capacity: 1 });
assert.ifError((await root.from('event_assignments').insert({ event_id: openEvent.id, user_id: assignedCoordinator.id, assignment_role: 'event_coordinator', assigned_by: admin.id })).error);

const openList = await volunteerA.client.rpc('list_open_events_for_volunteers');
assert.ifError(openList.error);
check(openList.data.some((item) => item.event_id === openEvent.id), 'Volunteer sees an eligible published event');
check(!openList.data.some((item) => [closedEvent.id, pastEvent.id].includes(item.event_id)), 'Closed and past-deadline events are hidden');
await expectFailure(() => pending.client.rpc('list_open_events_for_volunteers'), 'Pending Volunteer cannot execute open-event RPC');
await expectFailure(() => anonymous.rpc('list_open_events_for_volunteers'), 'Anonymous cannot execute open-event RPC');

const applied = await volunteerA.client.rpc('apply_to_event', { target_event_id: openEvent.id });
assert.ifError(applied.error); check(Boolean(applied.data), 'Eligible Volunteer applies');
await expectFailure(() => volunteerA.client.rpc('apply_to_event', { target_event_id: openEvent.id }), 'Duplicate pending application is rejected');
await expectFailure(() => volunteerA.client.rpc('apply_to_event', { target_event_id: closedEvent.id }), 'Closed event application is rejected');
await expectFailure(() => volunteerA.client.rpc('apply_to_event', { target_event_id: pastEvent.id }), 'Past-deadline application is rejected');
await expectFailure(() => pending.client.rpc('apply_to_event', { target_event_id: openEvent.id }), 'Pending Volunteer cannot apply');
const directInsert = await volunteerA.client.from('event_applications').insert({ event_id: openEvent.id, volunteer_user_id: volunteerA.id, status: 'accepted' });
check(Boolean(directInsert.error), 'Browser cannot directly insert an accepted application');

const own = await volunteerA.client.rpc('list_my_event_applications');
assert.ifError(own.error); check(own.data.length === 1 && own.data[0].id === applied.data, 'Volunteer sees only own application');
const otherOwn = await volunteerB.client.rpc('list_my_event_applications');
assert.ifError(otherOwn.error); check(otherOwn.data.length === 0, 'Other Volunteer cannot see private application');

assert.ifError((await volunteerA.client.rpc('withdraw_event_application', { target_application_id: applied.data })).error);
passed.push('Volunteer withdraws own pending application');
await expectFailure(() => volunteerB.client.rpc('withdraw_event_application', { target_application_id: applied.data }), 'Other Volunteer cannot withdraw application');
const resubmitted = await volunteerA.client.rpc('apply_to_event', { target_event_id: openEvent.id });
assert.ifError(resubmitted.error); check(resubmitted.data === applied.data, 'Withdrawn application returns to pending without a duplicate row');

await expectFailure(() => unassignedCoordinator.client.rpc('list_event_applications_for_management', { target_event_id: openEvent.id }), 'Unassigned Event Coordinator cannot list applications');
assert.ifError((await assignedCoordinator.client.rpc('list_event_applications_for_management', { target_event_id: openEvent.id })).error);
passed.push('Assigned Event Coordinator lists applications');
await expectFailure(() => chapterBReview.client.rpc('decide_event_application', { target_application_id: applied.data, new_status: 'rejected' }), 'Cross-chapter coordinator decision is rejected');
await expectFailure(() => volunteerA.client.rpc('decide_event_application', { target_application_id: applied.data, new_status: 'accepted' }), 'Volunteer cannot decide own application');

let auditBefore = (await root.from('audit_logs').select('*', { count: 'exact', head: true })).count;
assert.ifError((await assignedCoordinator.client.rpc('decide_event_application', { target_application_id: applied.data, new_status: 'rejected' })).error);
check((await root.from('audit_logs').select('*', { count: 'exact', head: true })).count === auditBefore + 1, 'Successful rejection creates exactly one audit row');
await expectFailure(() => volunteerA.client.rpc('apply_to_event', { target_event_id: openEvent.id }), 'Rejected applicant cannot self-reapply');
auditBefore = (await root.from('audit_logs').select('*', { count: 'exact', head: true })).count;
assert.ifError((await chapterAReview.client.rpc('decide_event_application', { target_application_id: applied.data, new_status: 'pending' })).error);
check((await root.from('audit_logs').select('*', { count: 'exact', head: true })).count === auditBefore + 1, 'Own-chapter reviewer reopens rejection with one audit row');
assert.ifError((await admin.client.rpc('decide_event_application', { target_application_id: applied.data, new_status: 'accepted' })).error);
passed.push('Admin accepts an application nationwide');

const superApplication = await volunteerB.client.rpc('apply_to_event', { target_event_id: otherEvent.id });
assert.ifError(superApplication.error);
assert.ifError((await superAdmin.client.rpc('decide_event_application', { target_application_id: superApplication.data, new_status: 'accepted' })).error);
passed.push('Super Admin decides nationwide');

const visibleAssigned = await assignedCoordinator.client.from('events').select('id');
assert.ifError(visibleAssigned.error);
check(visibleAssigned.data.length === 1 && visibleAssigned.data[0].id === openEvent.id, 'Event assignment does not grant chapter-wide event access');

const capacityA = await volunteerA.client.rpc('apply_to_event', { target_event_id: fullEvent.id });
const capacityB = await volunteerB.client.rpc('apply_to_event', { target_event_id: fullEvent.id });
assert.ifError(capacityA.error); assert.ifError(capacityB.error);
auditBefore = (await root.from('audit_logs').select('*', { count: 'exact', head: true })).count;
const race = await Promise.all([
  admin.client.rpc('decide_event_application', { target_application_id: capacityA.data, new_status: 'accepted' }),
  superAdmin.client.rpc('decide_event_application', { target_application_id: capacityB.data, new_status: 'accepted' }),
]);
check(race.filter((result) => !result.error).length === 1, 'Concurrent acceptance enforces capacity atomically');
check((await root.from('audit_logs').select('*', { count: 'exact', head: true })).count === auditBefore + 1, 'Failed concurrent decision creates no audit row');

console.log(JSON.stringify({ passed: passed.length, failed: 0 }));
