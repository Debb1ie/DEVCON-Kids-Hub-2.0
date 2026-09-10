import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deterministicFolderName, findOrCreateEventFolder, upsertReportSheetRow } from '../supabase/functions/google-workspace-worker/core.mjs';

const migration = readFileSync('supabase/migrations/20260910000300_google_workspace_automation.sql', 'utf8');
const worker = readFileSync('supabase/functions/google-workspace-worker/index.ts', 'utf8');
const page = readFileSync('src/pages/IntegrationSettings.jsx', 'utf8');
const service = readFileSync('src/services/googleWorkspaceService.js', 'utf8');

test('deterministic folder creation reuses a matching folder', async () => {
  let creates = 0;
  const provider = { findFolders: async () => [{ id: 'existing' }], createFolder: async () => { creates += 1; } };
  const result = await findOrCreateEventFolder(provider, { event_date: '2026-09-10', title: 'Hour of AI' }, 'root');
  assert.equal(deterministicFolderName({ event_date: '2026-09-10', title: 'Hour of AI' }), '2026-09-10 - Hour of AI');
  assert.equal(result.folder.id, 'existing');
  assert.equal(creates, 0);
});

test('mocked Sheet synchronization updates existing rows instead of appending duplicates', async () => {
  let appends = 0; let updates = 0;
  const provider = { appendRow: async () => { appends += 1; return "'Post Event Reports'!A2:N2"; }, updateRow: async () => { updates += 1; } };
  const first = await upsertReportSheetRow(provider, null, [['event']]);
  const second = await upsertReportSheetRow(provider, first, [['event revised']]);
  assert.equal(first, second); assert.equal(appends, 1); assert.equal(updates, 1);
});

test('migration allocates a stable Sheet row before provider synchronization', () => {
  assert.match(migration, /sheet_row_number bigint generated always as identity \(start with 2\) unique/i);
  assert.match(worker, /stableReference.*sheet_row_number/s);
  assert.match(worker, /upsertReportSheetRow\(provider, stableReference, values\)/);
});

test('migration defines durable idempotent jobs and lifecycle queue triggers', () => {
  assert.match(migration, /idempotency_key text not null unique/i);
  assert.match(migration, /status text not null default 'pending'.*processing.*succeeded.*failed/is);
  assert.match(migration, /after insert on public\.events/i);
  assert.match(migration, /new\.status::text in \('submitted', 'needs_revision', 'approved'\)/i);
  assert.match(migration, /on conflict \(idempotency_key\) do nothing/i);
  assert.doesNotMatch(migration, /http_post|net\.http|googleapis\.com/i);
});

test('configuration and retries are Super Admin-only at RPC, RLS, service, route, and UI boundaries', () => {
  assert.match(migration, /if not public\.has_role\(array\['super_admin'\]\)/i);
  assert.match(migration, /google_workspace_settings_superadmin/);
  assert.match(migration, /google_workspace_jobs_superadmin/);
  assert.match(service, /role !== 'super_admin'/);
  assert.match(page, /googleWorkspaceService\.retry\(roleKey/);
});

test('worker keeps credentials server-side and returns only safe failures', () => {
  assert.match(worker, /GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON/);
  assert.match(worker, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(worker, /SAFE_FAILURE/);
  assert.doesNotMatch(page, /SERVICE_ROLE|PRIVATE_KEY|GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON/);
  assert.doesNotMatch(service, /SERVICE_ROLE|PRIVATE_KEY|GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON/);
  assert.doesNotMatch(worker, /console\.(log|error)/);
});
