// Local database regression for the Post Event Report lifecycle under the
// real migrations and RLS: draft -> submitted -> needs_revision -> submitted
// -> approved -> export queued. Requires a disposable local PostgreSQL 15+
// and psql. Never point this at Supabase.
//   PGHOST=/tmp PGPORT=5432 PGUSER=postgres node tests/report-workflow-local-e2e.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const database = `devcon_report_e2e_${Date.now()}`;
const migrations = 'supabase/migrations';
const psql = (sql, { db = database, file = null } = {}) => {
  const args = ['-X', '-q', '-At', '-d', db, '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])];
  const result = spawnSync('psql', args, { encoding: 'utf8' });
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
};
const must = (sql, options) => { const r = psql(sql, options); assert.ok(r.ok, r.err); return r.out; };
const as = (id, sql) => `begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${id}', true); ${sql}; commit;`;
const asUser = (id, sql) => psql(as(id, sql));

must(`create database ${database}`, { db: 'postgres' });
try {
  must('', { file: 'tests/fixtures/supabase-local-stub.sql' });
  must('', { file: `${migrations}/backend.sql` });
  // AI-only migrations need pgvector and AI tables; they may skip here without affecting reports.
  for (const name of readdirSync(migrations).filter((n) => /^2026(09|1)/.test(n)).sort()) psql('', { file: `${migrations}/${name}` });
  must('grant usage on schema auth to authenticated; grant select, insert, update on all tables in schema public to authenticated');

  const ids = { coord: 'aaaaaaaa-0000-4000-8000-000000000001', other: 'aaaaaaaa-0000-4000-8000-000000000002', admin: 'aaaaaaaa-0000-4000-8000-000000000003', admin2: 'aaaaaaaa-0000-4000-8000-000000000004' };
  for (const [key, id] of Object.entries(ids)) {
    must(`insert into auth.users(id, email) values ('${id}', '${key}@x.test') on conflict do nothing; insert into public.profiles(id, email, full_name) values ('${id}', '${key}@x.test', '${key}') on conflict (id) do nothing; insert into public.user_roles(user_id, role) select '${id}', 'pending_volunteer' where not exists (select 1 from public.user_roles where user_id = '${id}')`);
  }
  const chapter = must(`select id from public.chapters where name = 'Iloilo'`);
  must(`update public.user_roles set role = 'event_coordinator', chapter_id = '${chapter}' where user_id in ('${ids.coord}', '${ids.other}'); update public.user_roles set role = 'super_admin' where user_id in ('${ids.admin}', '${ids.admin2}')`);
  const event = must(`insert into public.events(title, chapter_id, chapter, status, event_date) values ('Test Automation', '${chapter}', 'Iloilo', 'Completed', '2026-09-30') returning id`).split('\n')[0];
  must(`insert into public.event_assignments(event_id, user_id, assignment_role, assigned_by) values ('${event}', '${ids.coord}', 'event_coordinator', '${ids.admin}')`);

  // Draft: created by the assigned coordinator, invisible to reviewers.
  assert.ok(!asUser(ids.admin, `insert into public.post_event_reports(event_id, submitted_by, status) values ('${event}', '${ids.admin}', 'draft')`).ok, 'reviewers cannot author reports');
  const created = asUser(ids.coord, `insert into public.post_event_reports(event_id, submitted_by, status, venue) values ('${event}', '${ids.coord}', 'draft', 'Lab')`);
  assert.ok(created.ok, created.err);
  const report = must(`select id from public.post_event_reports where event_id = '${event}'`);
  assert.equal(asUser(ids.admin, `select count(*) from public.post_event_reports`).out.split('\n').at(-1), '0', 'drafts never reach the review queue');
  assert.ok(!asUser(ids.coord, `insert into public.post_event_reports(event_id, submitted_by, status) values ('${event}', '${ids.coord}', 'draft')`).ok, 'one report per event');

  // Submit requires the summaries.
  assert.match(asUser(ids.coord, `update public.post_event_reports set status = 'submitted' where id = '${report}'`).err, /Attendance, impact, and finance summaries are required/);
  must(as(ids.coord, `insert into public.post_event_report_attendance(report_id, registered_count, attended_count) values ('${report}', 10, 9); insert into public.post_event_report_impact(report_id, key_learnings, community_impact) values ('${report}', 'k', 'c'); insert into public.post_event_report_finance(report_id, approved_budget) values ('${report}', 100)`));
  must(as(ids.coord, `update public.post_event_reports set status = 'submitted' where id = '${report}'`));
  assert.equal(must(`select count(*) from public.post_event_report_exports`), '0', 'no export before approval');

  // Reviewer sees it; an unrelated coordinator does not.
  assert.equal(asUser(ids.admin, `select status from public.post_event_reports where id = '${report}'`).out.split('\n').at(-1), 'submitted');
  assert.equal(asUser(ids.other, `select count(*) from public.post_event_reports`).out.split('\n').at(-1), '0');
  assert.ok(!asUser(ids.coord, `update public.post_event_reports set status = 'approved' where id = '${report}'`).out.includes('UPDATE 1'));
  assert.equal(must(`select status from public.post_event_reports where id = '${report}'`), 'submitted', 'the author cannot approve');

  // Revision round trip.
  must(as(ids.admin, `update public.post_event_reports set status = 'needs_revision', revision_reason = 'Add photos' where id = '${report}'`));
  must(as(ids.coord, `update public.post_event_reports set event_summary = 'Updated' where id = '${report}'`));
  must(as(ids.coord, `update public.post_event_reports set status = 'submitted' where id = '${report}'`));

  // Approval queues exactly one export job; repeating the request stays idempotent.
  must(as(ids.admin2, `update public.post_event_reports set status = 'approved' where id = '${report}'`));
  assert.equal(must(`select status || '|' || attempt_count from public.post_event_report_exports where report_id = '${report}'`), 'pending|0');
  asUser(ids.admin, `select public.request_report_export('${report}')`);
  asUser(ids.admin, `select public.request_report_export('${report}')`);
  assert.equal(must(`select count(*) from public.post_event_report_exports where report_id = '${report}'`), '1');
  assert.ok(!psql(as(ids.coord, `update public.post_event_reports set event_summary = 'x' where id = '${report}'`)).out.includes('UPDATE 1'));
  assert.equal(must(`select event_summary from public.post_event_reports where id = '${report}'`), 'Updated', 'approved reports are immutable');
  assert.equal(must(`select string_agg(from_status || '>' || to_status, ',' order by created_at) from public.post_event_report_reviews where report_id = '${report}'`), 'draft>submitted,submitted>needs_revision,needs_revision>submitted,submitted>approved');
  console.log('report workflow e2e passed');
} finally {
  psql(`drop database if exists ${database} with (force)`, { db: 'postgres' });
}
