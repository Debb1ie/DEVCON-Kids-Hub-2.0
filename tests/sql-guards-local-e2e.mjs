// Local database regression for the final Super Admin guard, deletion
// authorization, linked-record protection and the Iloilo chapter merge.
// Requires a disposable local PostgreSQL 15+ and psql. Never point this at Supabase.
//   PGHOST=/tmp PGPORT=5432 PGUSER=postgres node tests/sql-guards-local-e2e.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const database = `devcon_guard_e2e_${Date.now()}`;
const migrations = 'supabase/migrations';
const psql = (sql, { db = database, file = null, stopOnError = true } = {}) => {
  const args = ['-X', '-q', '-At', '-d', db, '-v', `ON_ERROR_STOP=${stopOnError ? 1 : 0}`, ...(file ? ['-f', file] : ['-c', sql])];
  const result = spawnSync('psql', args, { encoding: 'utf8' });
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
};
const must = (sql, options) => { const r = psql(sql, options); assert.ok(r.ok, r.err); return r.out; };
const asUser = (id, sql) => `begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${id}', true); ${sql}; commit;`;

must(`create database ${database}`, { db: 'postgres' });
try {
  must('', { file: 'tests/fixtures/supabase-local-stub.sql' });
  must('', { file: `${migrations}/backend.sql` });
  const required = readdirSync(migrations).filter((name) => /^2026(09|1)/.test(name) && !name.startsWith('20260930')).sort();
  for (const name of required) psql('', { file: `${migrations}/${name}`, stopOnError: true }); // AI-only migrations may skip on plain Postgres
  must('grant usage on schema auth to authenticated');
  must(`insert into public.chapters(name, location_type, status) values ('Ilo Ilo', 'chapter', 'active')`);
  const [s1, s2, a1, v1, v2] = ['11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000004', '11111111-1111-4111-8111-000000000005'];
  for (const [id, email] of [[s1, 's1@x.test'], [s2, 's2@x.test'], [a1, 'a1@x.test'], [v1, 'v1@x.test'], [v2, 'v2@x.test']]) {
    must(`insert into auth.users(id, email) values ('${id}', '${email}') on conflict do nothing; insert into public.profiles(id, email, full_name) values ('${id}', '${email}', '${email}') on conflict (id) do nothing; insert into public.user_roles(user_id, role) select '${id}', 'pending_volunteer' where not exists (select 1 from public.user_roles where user_id = '${id}')`);
  }
  const dup = must(`select id from public.chapters where name = 'Ilo Ilo'`);
  must(`update public.user_roles set role = 'super_admin' where user_id in ('${s1}', '${s2}'); update public.user_roles set role = 'admin' where user_id = '${a1}'; update public.user_roles set role = 'volunteer', chapter_id = '${dup}' where user_id in ('${v1}', '${v2}')`);
  must(`insert into public.events(title, chapter_id, chapter) values ('Hour of AI', '${dup}', 'Ilo Ilo')`);
  must(`insert into public.post_event_reports(event_id, submitted_by) select id, '${v1}' from public.events limit 1`);

  for (const name of readdirSync(migrations).filter((n) => n.startsWith('20260930')).sort()) {
    must('', { file: `${migrations}/${name}` });
    must('', { file: `${migrations}/${name}` }); // re-runnable
  }

  // Authorization runs as the calling actor.
  assert.match(psql(asUser(a1, `select * from public.admin_authorize_user_deletion('${s1}')`)).err, /Only a Super Admin can delete administrative accounts/);
  assert.match(psql(asUser(a1, `select * from public.admin_authorize_user_deletion('${a1}')`)).err, /own account/);
  assert.match(psql(asUser(a1, `select deleted_user_id from public.admin_authorize_user_deletion('${v2}')`)).out, new RegExp(v2));
  assert.match(psql(asUser(s1, `select deleted_user_id from public.admin_authorize_user_deletion('${s2}')`)).out, new RegExp(s2));
  assert.match(psql(asUser(v1, `select * from public.admin_authorize_user_deletion('${v2}')`)).err, /Not authorized/);

  // Linked records block deletion atomically.
  assert.ok(!psql(`delete from auth.users where id = '${v1}'`).ok);
  assert.equal(must(`select count(*) from public.user_roles where user_id = '${v1}'`), '1');

  // Concurrent removal of both Super Admins: exactly one succeeds.
  const run = (sql) => new Promise((resolve) => {
    const child = spawn('psql', ['-X', '-q', '-At', '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
    let err = '';
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => resolve({ ok: code === 0, err }));
  });
  const first = run(`begin; delete from auth.users where id = '${s2}'; select pg_sleep(1.5); commit;`);
  await new Promise((r) => setTimeout(r, 400));
  const second = run(`begin; delete from auth.users where id = '${s1}'; commit;`);
  const results = await Promise.all([first, second]);
  assert.equal(results.filter((r) => r.ok).length, 1, JSON.stringify(results));
  assert.match(results.find((r) => !r.ok).err, /final Super Admin cannot be removed/);
  assert.equal(must(`select count(*) from public.user_roles where role = 'super_admin'`), '1');

  // Demotion of the last Super Admin is refused on every path.
  assert.ok(!psql(`update public.user_roles set role = 'admin' where user_id = '${s1}'`).ok);
  assert.match(psql(asUser(s1, `select * from public.admin_authorize_user_deletion('${s1}')`)).err, /own account/);

  // Iloilo: one canonical chapter, relationships preserved.
  assert.equal(must(`select string_agg(name, ',') from public.chapters where lower(regexp_replace(name, '[^A-Za-z]', '', 'g')) = 'iloilo'`), 'Iloilo');
  const canonical = must(`select id from public.chapters where name = 'Iloilo'`);
  assert.equal(must(`select count(*) from public.user_roles where chapter_id = '${canonical}'`), '2');
  assert.equal(must(`select chapter_id || '|' || chapter from public.events limit 1`), `${canonical}|Iloilo`);
  assert.equal(must(`select count(*) from public.audit_logs where action = 'CHAPTER_MERGED'`), '1');
  console.log('sql guards e2e passed');
} finally {
  psql(`drop database if exists ${database} with (force)`, { db: 'postgres' });
}
