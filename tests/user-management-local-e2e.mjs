import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, 'Local Supabase credentials are required');
assert(['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname), 'Refusing a non-loopback target');

const adminApi = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const pass = (name) => results.push(name);
const ok = (condition, name) => { assert(condition, name); pass(name); };
const expectError = async (operation, name) => {
  let result;
  try { result = await operation(); }
  catch (error) { result = { error }; }
  assert(result?.error, `${name}: expected failure`);
  pass(name);
};

const chapterA = (await adminApi.from('chapters').insert({ name: 'Local Alpha' }).select().single()).data;
const chapterB = (await adminApi.from('chapters').insert({ name: 'Local Beta' }).select().single()).data;
assert(chapterA && chapterB);

async function identity(label, role, chapterId = null) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const email = `${slug}-${crypto.randomUUID()}@example.test`;
  const password = `Local-${crypto.randomUUID()}!Aa1`;
  const created = await adminApi.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: label } });
  assert.ifError(created.error);
  const userId = created.data.user.id;
  const assigned = await adminApi.from('user_roles').update({ role, chapter_id: chapterId }).eq('user_id', userId).select();
  assert.ifError(assigned.error); assert.equal(assigned.data.length, 1);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return { id: userId, email, client };
}

const superA = await identity('Super Alpha', 'super_admin');
const superB = await identity('Super Beta', 'super_admin');
const regularAdmin = await identity('Admin User', 'admin');
const chapterCoordinator = await identity('Chapter Coordinator', 'chapter_coordinator', chapterA.id);
const eventCoordinator = await identity('Event Coordinator', 'event_coordinator', chapterA.id);
const volunteer = await identity('Volunteer User', 'volunteer', chapterB.id);
const pending = await identity('Pending Person', 'pending_volunteer');
const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

const directory = await superA.client.rpc('admin_list_users');
assert.ifError(directory.error);
ok(directory.data.length >= 7, 'Super Admin lists directory');
ok(Object.keys(directory.data[0]).sort().join(',') === 'avatar_url,chapter_id,chapter_name,created_at,email,full_name,role,user_id', 'Directory returns approved fields only');
ok(directory.data.every((row, index, all) => index === 0 || row.created_at <= all[index - 1].created_at), 'Directory ordering is deterministic');

const adminDirectory = await regularAdmin.client.rpc('admin_list_users');
assert.ifError(adminDirectory.error); ok(adminDirectory.data.length >= 7, 'Admin lists permitted directory');
for (const [args, expected, name] of [
  [{ search_query: 'super alpha' }, 1, 'Display-name search'],
  [{ search_query: superA.email.toUpperCase() }, 1, 'Case-insensitive email search'],
  [{ role_filter: 'volunteer' }, 1, 'Role filter'],
  [{ chapter_filter: chapterA.id }, 2, 'Chapter filter'],
  [{ search_query: 'coordinator', chapter_filter: chapterA.id }, 2, 'Combined filters'],
  [{ search_query: 'does-not-exist' }, 0, 'Empty search'],
]) {
  const query = await superA.client.rpc('admin_list_users', args);
  assert.ifError(query.error); ok(query.data.length === expected, name);
}
for (const [actor, name] of [[chapterCoordinator, 'Chapter Coordinator'], [eventCoordinator, 'Event Coordinator'], [volunteer, 'Volunteer'], [pending, 'Pending Volunteer']])
  await expectError(() => actor.client.rpc('admin_list_users'), `${name} cannot list users`);
await expectError(() => anonymous.rpc('admin_list_users'), 'Anonymous cannot list users');
await expectError(() => superA.client.rpc('admin_list_users', { role_filter: 'invalid_role' }), 'Invalid directory role fails safely');

const beforeMetadata = (await adminApi.auth.admin.getUserById(pending.id)).data.user.user_metadata;
const beforeCounts = {
  profiles: (await adminApi.from('profiles').select('*', { count: 'exact', head: true })).count,
  chapters: (await adminApi.from('chapters').select('*', { count: 'exact', head: true })).count,
};
const approve = await superA.client.rpc('admin_manage_user_role', { target_user_id: pending.id, new_role: 'volunteer', new_chapter_id: chapterA.id });
assert.ifError(approve.error); pass('Super Admin approves Pending Volunteer with chapter');
let assignment = await adminApi.from('user_roles').select('role,chapter_id').eq('user_id', pending.id);
ok(assignment.data.length === 1 && assignment.data[0].role === 'volunteer' && assignment.data[0].chapter_id === chapterA.id, 'Exactly one intended role row changes');

assert.ifError((await superA.client.rpc('admin_manage_user_role', { target_user_id: pending.id, new_role: 'admin' })).error);
assignment = await adminApi.from('user_roles').select('role,chapter_id').eq('user_id', pending.id).single();
ok(assignment.data.role === 'admin' && assignment.data.chapter_id === null, 'Super Admin assigns admin and clears chapter');
assert.ifError((await regularAdmin.client.rpc('admin_manage_user_role', { target_user_id: volunteer.id, new_role: 'event_coordinator', new_chapter_id: chapterA.id })).error);
pass('Admin manages a non-administrative role');

await expectError(() => regularAdmin.client.rpc('admin_manage_user_role', { target_user_id: volunteer.id, new_role: 'super_admin' }), 'Admin cannot grant Super Admin');
await expectError(() => regularAdmin.client.rpc('admin_manage_user_role', { target_user_id: superA.id, new_role: 'volunteer', new_chapter_id: chapterA.id }), 'Admin cannot remove Super Admin');
for (const [actor, name] of [[chapterCoordinator, 'Chapter Coordinator'], [eventCoordinator, 'Event Coordinator'], [volunteer, 'Volunteer'], [pending, 'Pending Volunteer']])
  await expectError(() => actor.client.rpc('admin_manage_user_role', { target_user_id: regularAdmin.id, new_role: 'volunteer', new_chapter_id: chapterA.id }), `${name} cannot manage roles`);
await expectError(() => anonymous.rpc('admin_manage_user_role', { target_user_id: regularAdmin.id, new_role: 'volunteer', new_chapter_id: chapterA.id }), 'Anonymous cannot manage roles');
await expectError(() => superA.client.rpc('admin_manage_user_role', { target_user_id: superA.id, new_role: 'admin' }), 'Self role change rejected');
await expectError(() => superA.client.rpc('admin_manage_user_role', { target_user_id: crypto.randomUUID(), new_role: 'volunteer', new_chapter_id: chapterA.id }), 'Invalid user rejected');
await expectError(() => superA.client.rpc('admin_manage_user_role', { target_user_id: chapterCoordinator.id, new_role: 'invalid_role' }), 'Invalid role rejected');
await expectError(() => superA.client.rpc('admin_manage_user_role', { target_user_id: chapterCoordinator.id, new_role: 'volunteer', new_chapter_id: crypto.randomUUID() }), 'Invalid chapter rejected');
await expectError(() => superA.client.rpc('admin_manage_user_role', { target_user_id: chapterCoordinator.id, new_role: 'volunteer' }), 'Required chapter enforced');

const metadataAfter = (await adminApi.auth.admin.getUserById(pending.id)).data.user.user_metadata;
assert.deepEqual(metadataAfter, beforeMetadata); pass('Auth metadata remains unchanged');
ok((await adminApi.from('profiles').select('*', { count: 'exact', head: true })).count === beforeCounts.profiles, 'No unrelated profile changes');
ok((await adminApi.from('chapters').select('*', { count: 'exact', head: true })).count === beforeCounts.chapters, 'No unrelated chapter changes');

const audits = await adminApi.from('audit_logs').select('*').eq('target_id', pending.id).order('created_at');
assert.ifError(audits.error);
ok(audits.data.length === 2, 'One audit row per successful change');
ok(audits.data[0].actor_id === superA.id && audits.data[0].metadata.from_role === 'pending_volunteer' && audits.data[0].metadata.to_role === 'volunteer', 'Audit records actor, target, and role transition');
ok(Boolean(audits.data[0].created_at) && !JSON.stringify(audits.data).match(/token|secret|password/i), 'Audit timestamp exists without credential fields');
const failedAuditCount = (await adminApi.from('audit_logs').select('*', { count: 'exact', head: true })).count;
const auditEdit = await volunteer.client.from('audit_logs').update({ action: 'tampered' }).eq('id', audits.data[0].id).select();
assert.ifError(auditEdit.error); ok(auditEdit.data.length === 0, 'Ordinary user cannot modify audit rows');
ok((await adminApi.from('audit_logs').select('*', { count: 'exact', head: true })).count === failedAuditCount, 'Failed operations create no misleading audits');

const races = await Promise.all([
  superA.client.rpc('admin_manage_user_role', { target_user_id: superB.id, new_role: 'admin' }),
  superB.client.rpc('admin_manage_user_role', { target_user_id: superA.id, new_role: 'admin' }),
]);
ok(races.filter((result) => !result.error).length === 1, 'Concurrent final-Super-Admin changes allow exactly one success');
const superCount = (await adminApi.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'super_admin')).count;
ok(superCount === 1, 'Concurrent requests preserve one Super Admin');

console.log(JSON.stringify({ passed: results.length, failed: 0 }));
