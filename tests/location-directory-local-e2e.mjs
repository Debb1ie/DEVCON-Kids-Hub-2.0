import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { isKnownLocationId } from '../src/auth/locationRules.js';

const url = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Local Supabase credentials are required');
assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname), 'Refusing a non-loopback target');

const root = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const passed = [];
const check = (condition, name) => { assert(condition, name); passed.push(name); };
const expectError = async (operation, name) => {
  let result;
  try { result = await operation(); } catch (error) { result = { error }; }
  assert(result?.error, `${name}: expected failure`); passed.push(name);
};

async function identity(label, role) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}!Aa1`;
  const created = await root.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: label } });
  assert.ifError(created.error);
  const assigned = await root.from('user_roles').update({ role }).eq('user_id', created.data.user.id).select();
  assert.ifError(assigned.error); assert.equal(assigned.data.length, 1);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { id: created.data.user.id, client };
}

const roster = ['Manila', 'Laguna', 'Pampanga', 'Legazpi', 'Cebu', 'Iloilo', 'Davao', 'Iligan', 'Bukidnon', 'Bohol', 'Bacolod', 'CDO'];
const allLocations = (await root.from('chapters').select('id,name,location_type,status')).data;
const approved = allLocations.filter((row) => roster.includes(row.name));
check(approved.length === 12, 'Exactly 12 approved locations exist');
check(approved.filter((row) => row.location_type === 'chapter').length === 9, 'Exactly 9 chapters exist');
check(approved.filter((row) => row.location_type === 'volunteer_community').length === 3, 'Exactly 3 volunteer communities exist');
check(new Set(approved.map((row) => row.id)).size === 12, 'Every approved location has a distinct UUID');
check(new Set(approved.map((row) => row.name.trim().toLowerCase())).size === 12, 'No normalized roster names are duplicated');
check(roster.every((name) => approved.some((row) => row.name === name)), 'Roster names match exactly');
check(allLocations.some((row) => row.name === 'Unrelated Local Chapter'), 'Unrelated chapter is preserved');

const superAdmin = await identity('super-admin', 'super_admin');
const admin = await identity('admin', 'admin');
const chapterCoordinator = await identity('chapter-coordinator', 'chapter_coordinator');
const eventCoordinator = await identity('event-coordinator', 'event_coordinator');
const volunteer = await identity('volunteer', 'volunteer');
const pending = await identity('pending', 'pending_volunteer');
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

for (const [actor, name] of [[superAdmin, 'Super Admin'], [admin, 'Admin']]) {
  const result = await actor.client.rpc('admin_list_assignable_locations');
  assert.ifError(result.error); check(result.data.length >= 12, `${name} can list locations`);
}
for (const [actor, name] of [[chapterCoordinator, 'Chapter Coordinator'], [eventCoordinator, 'Event Coordinator'], [volunteer, 'Volunteer'], [pending, 'Pending Volunteer']]) {
  await expectError(() => actor.client.rpc('admin_list_assignable_locations'), `${name} cannot list locations`);
}
await expectError(() => anonymous.rpc('admin_list_assignable_locations'), 'Anonymous cannot list locations');

const directoryResult = await superAdmin.client.rpc('admin_list_assignable_locations');
assert.ifError(directoryResult.error);
const directory = directoryResult.data;
const manila = directory.find((row) => row.display_name === 'Manila');
const cebu = directory.find((row) => row.display_name === 'Cebu');
const bohol = directory.find((row) => row.display_name === 'Bohol (Volunteer Community)');
check(isKnownLocationId(manila.location_id, directory), 'Manila exposes a real directory UUID');
check(isKnownLocationId(cebu.location_id, directory), 'Cebu exposes a real directory UUID');
check(bohol.location_type === 'volunteer_community', 'Bohol is identified as a Volunteer Community');
check(!isKnownLocationId('1', directory), 'Numeric mock ID is rejected');
check(!isKnownLocationId(crypto.randomUUID(), directory), 'Unknown UUID is rejected');

const metadataBefore = (await root.auth.admin.getUserById(pending.id)).data.user.user_metadata;
const auditBefore = (await root.from('audit_logs').select('*', { count: 'exact', head: true })).count;
const update = await superAdmin.client.rpc('admin_manage_user_role', { target_user_id: pending.id, new_role: 'volunteer', new_chapter_id: manila.location_id });
assert.ifError(update.error); passed.push('Pending user assigned to Manila');
const assignment = await root.from('user_roles').select('role,chapter_id').eq('user_id', pending.id);
check(assignment.data.length === 1 && assignment.data[0].chapter_id === manila.location_id, 'Exactly one role row receives the real UUID');
check((await root.from('audit_logs').select('*', { count: 'exact', head: true })).count === auditBefore + 1, 'Exactly one audit row is created');
assert.deepEqual((await root.auth.admin.getUserById(pending.id)).data.user.user_metadata, metadataBefore); passed.push('Auth metadata is unchanged');
await expectError(() => superAdmin.client.rpc('admin_manage_user_role', { target_user_id: superAdmin.id, new_role: 'admin' }), 'Self-change remains denied');
const filtered = await superAdmin.client.rpc('admin_list_users', { chapter_filter: manila.location_id });
assert.ifError(filtered.error); check(filtered.data.some((row) => row.user_id === pending.id), 'Filtering works with the real location UUID');

console.log(JSON.stringify({ passed: passed.length, failed: 0 }));
