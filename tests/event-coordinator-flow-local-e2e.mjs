import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Local Supabase credentials are required');
assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname), 'Refusing a non-local target');
const root = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const passed = [];

async function identity(label, role, chapterId = null) {
  const emailLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const email = `${emailLabel}-${crypto.randomUUID()}@local.test`;
  const password = `Local-${crypto.randomUUID()}!Aa1`;
  const created = await root.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: label } });
  assert.ifError(created.error);
  await root.from('profiles').upsert({ id: created.data.user.id, full_name: label, email });
  assert.ifError((await root.from('user_roles').delete().eq('user_id', created.data.user.id)).error);
  assert.ifError((await root.from('user_roles').insert({ user_id: created.data.user.id, role, chapter_id: chapterId })).error);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { id: created.data.user.id, client };
}

const expectFailure = async (operation, label) => {
  const result = await operation();
  assert(result.error, `${label} must fail`);
  passed.push(label);
};

const suffix = crypto.randomUUID();
const chapterA = (await root.from('chapters').insert({ name: `Manila UAT ${suffix}` }).select().single()).data;
const chapterB = (await root.from('chapters').insert({ name: `Cebu UAT ${suffix}` }).select().single()).data;
const superAdmin = await identity('Flow Super Admin', 'super_admin');
const chapterCoordinator = await identity('Manila Chapter Coordinator', 'chapter_coordinator', chapterA.id);
const coordinatorA = await identity('Manila Event Coordinator', 'event_coordinator', chapterA.id);
const coordinatorA2 = await identity('Second Manila Event Coordinator', 'event_coordinator', chapterA.id);
const coordinatorB = await identity('Cebu Event Coordinator', 'event_coordinator', chapterB.id);
const inactiveUser = await identity('Inactive Coordinator', 'pending_volunteer');

const listA = await superAdmin.client.rpc('list_eligible_event_coordinators', { target_chapter_id: chapterA.id });
assert.ifError(listA.error);
assert.deepEqual(new Set(listA.data.map((row) => row.user_id)), new Set([coordinatorA.id, coordinatorA2.id]));
passed.push('Manila lists only Manila Event Coordinators');

const listB = await superAdmin.client.rpc('list_eligible_event_coordinators', { target_chapter_id: chapterB.id });
assert.ifError(listB.error);
assert.deepEqual(listB.data.map((row) => row.user_id), [coordinatorB.id]);
passed.push('A different chapter lists only its Event Coordinators');

const baseArgs = {
  target_event_id: null,
  target_chapter_id: chapterA.id,
  target_coordinator_id: coordinatorA.id,
  event_title: `Coordinator Flow UAT ${suffix}`,
  event_type: 'Cycle Program',
  event_description: 'Non-sensitive local UAT event',
  event_image_url: null,
  event_status_value: 'Scheduled',
  event_date_value: '2026-09-13',
};

for (const [label, coordinatorId] of [
  ['inactive coordinator rejected', inactiveUser.id],
  ['cross-chapter coordinator rejected', coordinatorB.id],
  ['unknown coordinator rejected', crypto.randomUUID()],
]) {
  await expectFailure(
    () => superAdmin.client.rpc('save_event_with_coordinator', { ...baseArgs, target_coordinator_id: coordinatorId }),
    label
  );
}
await expectFailure(
  () => superAdmin.client.rpc('save_event_with_coordinator', { ...baseArgs, target_coordinator_id: 12345 }),
  'numeric coordinator ID rejected'
);
await expectFailure(
  () => superAdmin.client.rpc('save_event_with_coordinator', { ...baseArgs, target_coordinator_id: 'not-a-uuid' }),
  'invalid coordinator ID rejected'
);

const beforeJobs = await root.from('google_workspace_jobs').select('id', { count: 'exact', head: true });
assert.ifError(beforeJobs.error);
const created = await superAdmin.client.rpc('save_event_with_coordinator', baseArgs);
assert.ifError(created.error);
assert(created.data?.id);
const assignments = await root.from('event_assignments').select('*').eq('event_id', created.data.id);
assert.ifError(assignments.error);
assert.equal(assignments.data.length, 1);
assert.equal(assignments.data[0].user_id, coordinatorA.id);
passed.push('event creation atomically creates exactly one correct assignment');

const afterCreateJobs = await root.from('google_workspace_jobs').select('id', { count: 'exact', head: true });
assert.ifError(afterCreateJobs.error);
assert.equal(afterCreateJobs.count, beforeJobs.count);
passed.push('event creation creates no Google automation job');

const reassigned = await superAdmin.client.rpc('save_event_with_coordinator', {
  ...baseArgs,
  target_event_id: created.data.id,
  target_coordinator_id: coordinatorA2.id,
  event_description: 'Safely reassigned locally',
});
assert.ifError(reassigned.error);
const updatedAssignments = await root.from('event_assignments').select('*').eq('event_id', created.data.id);
assert.equal(updatedAssignments.data.length, 1);
assert.equal(updatedAssignments.data[0].user_id, coordinatorA2.id);
passed.push('event editing safely replaces the coordinator assignment');

const selfList = await coordinatorA2.client.rpc('list_eligible_event_coordinators', { target_chapter_id: chapterA.id });
assert.ifError(selfList.error);
assert.deepEqual(selfList.data.map((row) => row.user_id), [coordinatorA2.id]);
const selfUpdate = await coordinatorA2.client.rpc('save_event_with_coordinator', {
  ...baseArgs,
  target_event_id: created.data.id,
  target_coordinator_id: coordinatorA2.id,
  event_description: 'Assigned coordinator preserved',
});
assert.ifError(selfUpdate.error);
passed.push('assigned Event Coordinator can edit while preserving their UUID assignment');

await expectFailure(
  () => chapterCoordinator.client.rpc('save_event_with_coordinator', { ...baseArgs, target_chapter_id: chapterB.id, target_coordinator_id: coordinatorB.id }),
  'Chapter Coordinator cross-chapter creation rejected'
);
const finalJobs = await root.from('google_workspace_jobs').select('id', { count: 'exact', head: true });
assert.equal(finalJobs.count, beforeJobs.count);
passed.push('event updates and rejected writes create no Google automation jobs');

console.log(JSON.stringify({ passed: passed.length, results: passed }, null, 2));
