import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hardening = readFileSync(new URL('../supabase/migrations/20260909000400_rbac_hardening.sql', import.meta.url), 'utf8');
const applications = readFileSync(new URL('../supabase/migrations/20260909000500_volunteer_event_applications.sql', import.meta.url), 'utf8');
const identifiers = readFileSync(new URL('../supabase/migrations/20260910000100_event_identifier_hardening.sql', import.meta.url), 'utf8');

test('review migrations are transactional and contain rollback guidance', () => {
  for (const sql of [hardening, applications, identifiers]) {
    assert.match(sql, /^-- REVIEW ONLY/m);
    assert.match(sql, /begin;/i);
    assert.match(sql, /commit;/i);
    assert.match(sql, /rollback/i);
  }
});

test('role and assignment helpers are protected from anonymous execution', () => {
  assert.match(hardening, /security definer[\s\S]*set search_path = pg_catalog, public/i);
  assert.match(hardening, /revoke all on function public\.can_manage_event\(uuid\) from public, anon/i);
  assert.match(hardening, /revoke insert, update, delete on public\.user_roles from authenticated, anon/i);
});

test('event applications enforce one record per volunteer and event', () => {
  assert.match(applications, /unique\(event_id, volunteer_user_id\)/i);
  assert.match(applications, /volunteer_capacity/i);
  assert.match(applications, /application_deadline/i);
});

test('only volunteers can apply and they cannot decide their own application', () => {
  assert.match(applications, /has_role\(array\['volunteer'\]\)/i);
  assert.match(applications, /application\.volunteer_user_id=auth\.uid\(\)/i);
  assert.match(applications, /not public\.can_manage_event\(application\.event_id\)/i);
});

test('application decisions record actor, timestamp, and audit row', () => {
  assert.match(applications, /decided_by=case when new_status='pending' then null else auth\.uid\(\) end/i);
  assert.match(applications, /decided_at=case when new_status='pending' then null else now\(\) end/i);
  assert.match(applications, /insert into public\.audit_logs/i);
});

test('application table cannot be mutated directly by browser roles', () => {
  assert.match(applications, /revoke insert,update,delete on public\.event_applications from authenticated/i);
  assert.match(applications, /revoke all on public\.event_applications from anon/i);
});

test('knowledge, AI settings, audit, and task policies remove broad access', () => {
  assert.match(hardening, /drop policy "Users can view knowledge base"/i);
  assert.match(hardening, /ai_settings_superadmin_rbac/i);
  assert.match(hardening, /revoke insert, update, delete on public\.audit_logs from authenticated, anon/i);
  assert.match(hardening, /assigned_to=auth\.uid\(\)/i);
});

test('new event writes require a valid active UUID-backed chapter', () => {
  assert.match(identifiers, /check\(chapter_id is not null\) not valid/i);
  assert.match(identifiers, /c\.id=new\.chapter_id and c\.status='active'/i);
  assert.match(identifiers, /before insert or update of chapter_id/i);
});
