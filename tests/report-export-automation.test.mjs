import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReportExport, reportFolderPath, runReportExport, sanitizeSegment, sheetRow } from '../supabase/functions/report-export/core.mjs';

const migration = readFileSync('supabase/migrations/20260923000100_approved_report_exports.sql', 'utf8');
const edge = readFileSync('supabase/functions/report-export/index.ts', 'utf8');
const page = readFileSync('src/pages/PostEventReport.jsx', 'utf8');
const service = readFileSync('src/services/reportAutomationService.js', 'utf8');
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
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/); assert.match(edge, /decryptToken.*refreshAccessToken/s);
  assert.match(edge, /storage\.from\('event-report-attachments'\)\.download/); assert.match(edge, /appProperties/);
  assert.match(edge, /REPORT_EXPORT_DESTINATION_READY/); assert.match(edge, /'Report ID'.*'Exported at'/s);
  assert.doesNotMatch(page, /SERVICE_ROLE|PRIVATE_KEY|REFRESH_TOKEN|GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(service, /42P01.*PGRST205/s);
  assert.match(page, /status==='approved'/); assert.match(page, /Retry export/);
});
