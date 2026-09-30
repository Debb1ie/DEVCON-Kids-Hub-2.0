import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReportExport, reportFolderPath, runReportExport, sanitizeSegment, sheetRow } from '../supabase/functions/report-export/core.mjs';
import { createReportAutomationService, isRecoverablePendingExport } from '../src/services/reportAutomationDispatch.js';
import { authSessionLifecycle } from '../src/auth/sessionLifecycle.js';

const migration = readFileSync('supabase/migrations/20260923000100_approved_report_exports.sql', 'utf8');
const edge = readFileSync('supabase/functions/report-export/index.ts', 'utf8');
const page = readFileSync('src/pages/PostEventReport.jsx', 'utf8');
const reviewDetail = readFileSync('src/pages/PostEventReportReviewDetail.jsx', 'utf8');
const service = readFileSync('src/services/reportAutomationService.js', 'utf8');
const dispatchService = readFileSync('src/services/reportAutomationDispatch.js', 'utf8');
const base = {
  report: { id: 'report-1', status: 'approved', submitted_at: '2026-09-20', approved_at: '2026-09-23', venue: 'Lab' },
  event: { id: 'event-1', title: 'Kids / AI', event_date: '2026-09-21', chapter_id: 'chapter-1', chapter: 'Manila' },
  chapter: { name: 'Manila' }, submitter: { full_name: 'Submitter' }, approver: { full_name: 'Approver' },
  attendance: { registered_count: 20, attended_count: 18, children_reached: 16, volunteers_involved: 2 },
  impact: { satisfaction_rating: 'excellent' }, finance: { approved_budget: 1000, currency_code: 'PHP' },
  transactions: [{ amount: 250, description: 'Materials' }], attachments: [{ id: 'a1', file_name: 'photo.jpg', file_type: 'image/jpeg', file_size: 10, category: 'event_photo' }],
};

test('only approved reports enter the export runner', async () => {
  const provider = { ensureFolderPath: async () => 'folder' };
  await assert.rejects(() => runReportExport({ provider, payload: { ...buildReportExport(base), report: { ...base.report, status: 'draft' } } }), /Only approved/);
  for (const status of ['submitted', 'needs_revision']) await assert.rejects(() => runReportExport({ provider, payload: { ...buildReportExport(base), report: { ...base.report, status } } }), /Only approved/);
});

test('export is resumable and does not recreate completed resources', async () => {
  const calls = { folder: 0, file: 0, attachment: 0, sheet: 0 };
  const provider = {
    ensureFolderPath: async () => { calls.folder += 1; return 'folder'; },
    upsertJsonFile: async () => { calls.file += 1; return 'file'; },
    copyAttachment: async () => { calls.attachment += 1; }, checkpoint: async () => {},
    upsertSheetRow: async (_key, _values, ref) => { calls.sheet += 1; return ref || 'row-2'; },
  };
  const payload = buildReportExport(base);
  const first = await runReportExport({ provider, payload });
  const second = await runReportExport({ provider, payload, checkpoint: first });
  assert.deepEqual(calls, { folder: 1, file: 1, attachment: 1, sheet: 2 });
  assert.equal(second.drive_folder_id, 'folder'); assert.equal(second.sheet_row_reference, 'row-2');
});

test('partial attachment failure checkpoints successes for a safe retry', async () => {
  const checkpoints = []; let calls = 0;
  const payload = buildReportExport({ ...base, attachments: [...base.attachments, { ...base.attachments[0], id: 'a2' }] });
  const provider = { ensureFolderPath: async () => 'folder', upsertJsonFile: async () => 'file', copyAttachment: async () => { calls += 1; if (calls === 2) throw new Error('provider unavailable'); }, checkpoint: async (state) => checkpoints.push(structuredClone(state)) };
  await assert.rejects(() => runReportExport({ provider, payload }), /provider unavailable/);
  assert.deepEqual(checkpoints.at(-1).uploaded_attachment_ids, ['a1']);
});

test('folder and JSON identifiers are checkpointed before later provider work', async () => {
  const checkpoints = [];
  const provider = {
    ensureFolderPath: async () => 'folder-1',
    upsertJsonFile: async () => 'file-1',
    copyAttachment: async () => { throw new Error('stop after durable resources'); },
    checkpoint: async (state) => checkpoints.push(structuredClone(state)),
  };
  await assert.rejects(() => runReportExport({ provider, payload: buildReportExport(base) }), /stop after durable resources/);
  assert.equal(checkpoints[0].drive_folder_id, 'folder-1');
  assert.equal(checkpoints[0].final_export_file_id, undefined);
  assert.equal(checkpoints[1].drive_folder_id, 'folder-1');
  assert.equal(checkpoints[1].final_export_file_id, 'file-1');
});

test('normalized payload, Drive path, and Sheet row use real schema values', () => {
  const payload = buildReportExport(base); const row = sheetRow(payload, { status: 'completed', drive_folder_id: 'folder' })[0];
  assert.equal(payload.finance.expenses, 250); assert.equal(payload.finance.balance, 750); assert.equal(row[0], 'report-1'); assert.equal(row[16], 'completed');
  assert.equal(reportFolderPath(payload).at(-1), '2026-09-21_Manila_Kids - AI_report-1');
  assert.equal(sanitizeSegment('bad<>:"/\\|?* name.'), 'bad--------- name');
});

test('migration enforces authorization, scope, approval, idempotency, transitions, audit, and retry cap', () => {
  assert.match(migration, /has_role\(array\['super_admin','admin','chapter_coordinator','event_coordinator'\]\)/);
  assert.match(migration, /can_access_report\(check_report_id\)/); assert.match(migration, /status::text = 'approved'/);
  assert.match(migration, /idempotency_key text not null unique/); assert.match(migration, /status in \('pending','processing','completed','failed'\)/);
  assert.match(migration, /attempt_count between 0 and 5/); assert.match(migration, /REPORT_EXPORT_(QUEUED|REQUESTED)/);
  assert.match(migration, /drop trigger if exists queue_google_report_sync_trigger/);
  assert.doesNotMatch(migration, /service_role_key|private_key|refresh_token/i);
});

test('Edge Function keeps privileged credentials and attachments server-side', () => {
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/); assert.match(edge, /decryptToken.*refreshGoogleToken/s);
  assert.match(edge, /storage\.from\('event-report-attachments'\)\.download/); assert.match(edge, /appProperties/);
  assert.match(edge, /REPORT_EXPORT_DESTINATION_READY/); assert.match(edge, /'Report ID'.*'Exported at'/s);
  assert.doesNotMatch(page, /SERVICE_ROLE|PRIVATE_KEY|REFRESH_TOKEN|GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(dispatchService, /42P01.*PGRST205/s);
  assert.match(service, /createReportAutomationService\(supabase\)/);
  assert.match(reviewDetail, /reportAutomationService\.load/); assert.match(reviewDetail, /Export status:/);
  assert.doesNotMatch(reviewDetail, /SERVICE_ROLE|PRIVATE_KEY|REFRESH_TOKEN|GOOGLE_OAUTH_CLIENT_SECRET/);
});

const automationClient = ({ row, fetchError = null, fetchStatus = 200, invokeResult = null, session = { access_token: 'test-access-token', user: { id: 'user-1' } } } = {}) => {
  const state = { row: row ? structuredClone(row) : null, fetches: [] };
  const fetch = async (url, options) => {
    state.fetches.push({ url, options });
    if (fetchError) throw fetchError;
    return {
      ok: fetchStatus >= 200 && fetchStatus < 300,
      status: fetchStatus,
      async json() { return { export: structuredClone(invokeResult || { ...state.row, status: 'processing', attempt_count: 1 }) }; },
    };
  };
  return {
    state,
    serviceOptions: { supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'test-anon-key', fetch },
    client: {
      auth: {
        async getSession() { return { data: { session }, error: null }; },
        async refreshSession() { return { data: { session }, error: null }; },
      },
      from(table) {
        assert.equal(table, 'post_event_report_exports');
        return {
          select() { return this; },
          eq(column, value) { assert.equal(column, 'report_id'); assert.equal(value, state.row?.report_id); return this; },
          async maybeSingle() { return { data: structuredClone(state.row), error: null }; },
        };
      },
    },
  };
};

test('approval dispatch and stranded recovery invoke the worker with the stable report ID', async () => {
  const pending = { report_id: 'report-1', status: 'pending', attempt_count: 0, last_attempted_at: null };
  assert.equal(isRecoverablePendingExport(pending), true);
  const { client, state, serviceOptions } = automationClient({ row: pending });
  const result = await createReportAutomationService(client, serviceOptions).loadAndRecover('report-1');
  assert.equal(result.dispatched, true);
  assert.equal(result.automation.status, 'processing');
  assert.equal(state.fetches.length, 1);
  assert.equal(state.fetches[0].url, 'https://project.supabase.co/functions/v1/report-export');
  assert.deepEqual(state.fetches[0].options, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-access-token', apikey: 'test-anon-key', 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId: 'report-1' }),
  });
});

test('dispatcher refreshes an expiring session and sends the refreshed bearer token', async () => {
  const pending = { report_id: 'report-1', status: 'pending', attempt_count: 0, last_attempted_at: null };
  const { client, state, serviceOptions } = automationClient({ row: pending, session: { access_token: 'stale-token', expires_at: 1, user: { id: 'user-1' } } });
  client.auth.refreshSession = async () => ({ data: { session: { access_token: 'fresh-token', expires_at: 4102444800, user: { id: 'user-1' } } }, error: null });
  const result = await createReportAutomationService(client, serviceOptions).loadAndRecover('report-1');
  assert.equal(result.dispatched, true);
  assert.equal(state.fetches[0].options.headers.Authorization, 'Bearer fresh-token');
});

test('missing session and 401/403 gateway authorization failures map to safe dispatch diagnostics', async () => {
  const pending = { report_id: 'report-1', status: 'pending', attempt_count: 0, last_attempted_at: null };
  authSessionLifecycle.resetForTests();
  const missing = automationClient({ row: pending, session: null });
  const missingResult = await createReportAutomationService(missing.client, missing.serviceOptions).loadAndRecover('report-1');
  assert.equal(missingResult.dispatchErrorCode, 'DISPATCH_AUTH_REQUIRED');
  assert.equal(missing.state.fetches.length, 0);

  for (const [status, code] of [[401, 'DISPATCH_AUTH_REQUIRED'], [403, 'DISPATCH_GATEWAY_REJECTED']]) {
    authSessionLifecycle.resetForTests();
    const denied = automationClient({ row: pending, fetchStatus: status });
    const deniedResult = await createReportAutomationService(denied.client, denied.serviceOptions).loadAndRecover('report-1');
    assert.equal(deniedResult.dispatchErrorCode, code);
    assert.equal(deniedResult.automation.report_id, 'report-1');
  }
});

test('dispatch failure preserves the same pending job for later recovery', async () => {
  const pending = { report_id: 'report-1', status: 'pending', attempt_count: 0, last_attempted_at: null };
  const { client, state, serviceOptions } = automationClient({ row: pending, fetchError: new Error('network unavailable') });
  const result = await createReportAutomationService(client, serviceOptions).loadAndRecover('report-1');
  assert.equal(result.dispatched, false);
  assert.equal(result.automation.status, 'pending');
  assert.equal(result.automation.report_id, 'report-1');
  assert.equal(state.fetches.length, 1);
});

test('fetch or CORS failure is sanitized and leaves the same pending job untouched', async () => {
  const pending = { report_id: 'report-1', status: 'pending', attempt_count: 0, last_attempted_at: null };
  const { client, serviceOptions } = automationClient({ row: pending, fetchError: new Error('sensitive transport detail') });
  const result = await createReportAutomationService(client, serviceOptions).loadAndRecover('report-1');
  assert.equal(result.dispatchErrorCode, 'DISPATCH_CORS_FAILED');
  assert.equal(result.automation.status, 'pending');
  assert.equal(result.automation.attempt_count, 0);
});

test('processing and completed exports are never auto-dispatched', async () => {
  for (const status of ['processing', 'completed']) {
    const { client, state, serviceOptions } = automationClient({ row: { report_id: 'report-1', status, attempt_count: 1, last_attempted_at: '2026-09-29T00:00:00Z' } });
    const result = await createReportAutomationService(client, serviceOptions).loadAndRecover('report-1');
    assert.equal(result.dispatched, false);
    assert.equal(state.fetches.length, 0);
  }
});

test('duplicate client dispatches rely on the worker atomic pending claim', async () => {
  const pending = { report_id: 'report-1', status: 'pending', attempt_count: 0, last_attempted_at: null };
  const { client, state, serviceOptions } = automationClient({ row: pending });
  const service = createReportAutomationService(client, serviceOptions);
  await Promise.all([service.dispatchPending('report-1', pending), service.dispatchPending('report-1', pending)]);
  assert.equal(state.fetches.length, 1);
  assert.match(edge, /\.eq\('report_id', reportId\)\.eq\('status', 'pending'\)/);
});

test('worker authorization, retry cap, and stable queue identity remain enforced', () => {
  assert.match(edge, /headers\.get\('authorization'\)/);
  assert.match(edge, /startsWith\('Bearer '\)/);
  assert.match(edge, /authorization\.slice\('Bearer '\.length\)\.trim\(\)/);
  assert.match(edge, /caller\.auth\.getUser\(accessToken\)/);
  assert.match(edge, /queued\.error\.code === '42501' \? 403 : 409/);
  assert.match(migration, /attempt_count between 0 and 5/);
  assert.match(migration, /on conflict \(report_id\) do nothing/);
  assert.match(migration, /'post_event_report:' \|\| new\.id::text/);
  assert.match(edge, /class GoogleFailure/);
  assert.match(edge, /stage.*provider.*service.*status.*reason.*message/s);
  assert.match(edge, /REPORT_EXPORT_FAILED.*diagnostic/s);
  assert.doesNotMatch(edge, /return reply\(500, \{ error: safeLedgerError/);
});
