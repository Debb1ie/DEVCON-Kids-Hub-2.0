import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deterministicFolderName, findOrCreateEventFolder, upsertReportSheetRow } from '../supabase/functions/google-workspace-worker/core.mjs';
import { buildGoogleAuthorizationUrl, requestOAuthToken, revokeOAuthToken } from '../supabase/functions/_shared/googleOAuthCore.mjs';

const migration = readFileSync('supabase/migrations/20260910000300_google_workspace_automation.sql', 'utf8');
const worker = readFileSync('supabase/functions/google-workspace-worker/index.ts', 'utf8');
const oauth = readFileSync('supabase/functions/google-workspace-auth/index.ts', 'utf8');
const oauthCore = readFileSync('supabase/functions/_shared/googleOAuth.ts', 'utf8');
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

test('OAuth uses authorization code, offline consent, account selection, and a mocked token exchange', async () => {
  const authorization = new URL(buildGoogleAuthorizationUrl({ clientId: 'test-client', redirectUri: 'https://example.test/callback', state: 'opaque-state' }));
  assert.equal(authorization.searchParams.get('response_type'), 'code');
  assert.equal(authorization.searchParams.get('access_type'), 'offline');
  assert.match(authorization.searchParams.get('prompt'), /consent/);
  assert.match(authorization.searchParams.get('prompt'), /select_account/);
  const result = await requestOAuthToken(async () => ({ ok: true, json: async () => ({ access_token: 'mock-access', refresh_token: 'mock-refresh' }) }), new URLSearchParams());
  assert.equal(result.refresh_token, 'mock-refresh');
  let revokedBody;
  assert.equal(await revokeOAuthToken(async (_url, init) => { revokedBody = init.body; return { ok: true }; }, 'mock-refresh'), true);
  assert.equal(revokedBody.get('token'), 'mock-refresh');
});

test('migration allocates a stable Sheet row before provider synchronization', () => {
  assert.match(migration, /sheet_row_number bigint generated always as identity \(start with 2\) unique/i);
  assert.match(worker, /stableReference.*sheet_row_number/s);
  assert.match(worker, /upsertReportSheetRow\(provider, stableReference, values\)/);
});

test('migration defines durable idempotent jobs and lifecycle queue triggers', () => {
  assert.match(migration, /idempotency_key text not null unique/i);
  assert.match(migration, /status text not null default 'pending'.*processing.*succeeded.*failed/is);
  assert.doesNotMatch(migration, /after insert on public\.events/i);
  assert.match(migration, /new\.status::text = 'submitted'.*create_event_folder/is);
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
  assert.match(worker, /decryptToken.*refreshAccessToken/s);
  assert.match(oauthCore, /GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY/);
  assert.match(oauth, /buildGoogleAuthorizationUrl/);
  assert.match(oauth, /CONNECT_GOOGLE_WORKSPACE/);
  assert.match(oauth, /DISCONNECT_GOOGLE_WORKSPACE/);
  assert.doesNotMatch(`${worker}\n${oauth}\n${oauthCore}`, /GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON|google-auth-library|service account/i);
  assert.match(worker, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(worker, /SAFE_FAILURE/);
  assert.doesNotMatch(page, /SERVICE_ROLE|PRIVATE_KEY|REFRESH_TOKEN|GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.doesNotMatch(service, /SERVICE_ROLE|PRIVATE_KEY|REFRESH_TOKEN|GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.doesNotMatch(worker, /console\.(log|error)/);
});
