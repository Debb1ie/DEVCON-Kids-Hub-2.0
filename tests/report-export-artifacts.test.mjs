import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReportExport, JSON_FILE_NAME, jsonArtifactKey, PDF_FILE_NAME, runReportExport } from '../supabase/functions/report-export/core.mjs';
import { encodeWinAnsi, formatDate, formatDateTime, formatMoney, renderReportPdf, wrapText } from '../supabase/functions/report-export/pdf.mjs';
import {
  buildTrackerRow, chooseTrackerRow, COLUMN, currencyPattern, dateSerial, dateTimeSerial, LEGACY_TRACKER_HEADERS, legacyRowToTracker,
  overviewValues, safeText, TRACKER_COLUMNS, TRACKER_HEADERS, trackerFormatRequests, isLegacyHeader,
} from '../supabase/functions/report-export/tracker.mjs';

const edge = readFileSync('supabase/functions/report-export/index.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260930000300_report_export_pdf_artifacts.sql', 'utf8');
const base = {
  report: { id: 'report-1', status: 'approved', submitted_at: '2026-11-15T10:00:00Z', approved_at: '2026-09-30T07:19:00Z', venue: 'Lab', event_summary: 'Summary' },
  event: { id: 'event-1', title: 'Hour of AI', event_date: '2026-11-15', chapter_id: 'chapter-1' },
  chapter: { name: 'Iloilo' }, submitter: { full_name: 'Maria' }, approver: { full_name: 'John Ray' },
  attendance: { registered_count: 20, attended_count: 18, children_reached: 16, volunteers_involved: 2 },
  impact: { key_learnings: 'Learned', community_impact: 'Impact', satisfaction_rating: 'excellent' },
  finance: { approved_budget: 1000, currency_code: 'PHP' },
  transactions: [{ amount: 1250, description: 'Materials', expense_category: 'materials', transaction_date: '2026-11-14' }],
  attachments: [{ id: 'a1', file_name: 'photo.jpg', file_type: 'image/jpeg', file_size: 10, category: 'event_photo' }],
};
const pdfText = (bytes) => Buffer.from(bytes).toString('latin1');
const hexOf = (text) => encodeWinAnsi(text).map((b) => b.toString(16).padStart(2, '0')).join('');

// A fake Drive + Sheet that behaves like the real stable-key lookups.
const fakeWorkspace = ({ failPdfTimes = 0, failSheetTimes = 0 } = {}) => {
  const store = { folders: new Map(), files: new Map(), attachments: new Set(), rows: new Map(), creates: 0, checkpoints: [] };
  let pdfFailures = failPdfTimes; let sheetFailures = failSheetTimes;
  const upsert = (folder, name, key, bytes) => {
    const existing = [...store.files.values()].find((f) => f.folder === folder && f.key === key);
    if (existing) { existing.name = name; existing.bytes = bytes; return existing.id; }
    const id = `file-${store.files.size + 1}`; store.creates += 1;
    store.files.set(id, { id, folder, name, key, bytes }); return id;
  };
  const provider = {
    ensureFolderPath: async (parts) => { const key = parts.join('/'); if (!store.folders.has(key)) store.folders.set(key, `folder-${store.folders.size + 1}`); return store.folders.get(key); },
    ensureChildFolder: async (name, parent) => provider.ensureFolderPath([parent, name]),
    upsertJsonFile: async (folder, name, value, key) => upsert(folder, name, key, JSON.stringify(value)),
    upsertFile: async (folder, name, bytes, _type, key) => { if (pdfFailures > 0) { pdfFailures -= 1; throw new Error('pdf upload failed'); } return upsert(folder, name, key, bytes); },
    copyAttachment: async (folder, attachment) => { store.attachments.add(`${folder}:${attachment.id}`); },
    checkpoint: async (state) => { store.checkpoints.push(structuredClone(state)); },
    upsertSheetRow: async (key, values) => { if (sheetFailures > 0) { sheetFailures -= 1; throw new Error('sheets unavailable'); } store.rows.set(key, values[0]); return 'row-2'; },
  };
  return { store, provider };
};

test('PDF generates as a valid, paginated, branded document from the payload', () => {
  const payload = buildReportExport(base);
  const bytes = renderReportPdf(payload, { generatedAt: '2026-09-30T07:20:00Z', driveFolderId: 'folder-1', jsonFileId: 'json-1' });
  const text = pdfText(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  const xref = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
  const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((offset, i) => assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  for (const expected of ['Post Event Report', 'Hour of AI', 'Iloilo', 'Nov 15, 2026', 'report-1', 'EVENT INFORMATION', 'ATTENDANCE', 'IMPACT', 'FINANCE', 'ATTACHMENTS', 'APPROVAL AND EXPORT', 'photo.jpg', 'PHP 1,250.00', '-PHP 250.00', '90%', 'Page 1 of']) {
    assert.ok(text.includes(hexOf(expected)), `PDF should contain ${expected}`);
  }
  assert.match(text, /\/BaseFont \/Helvetica-Bold/);
  assert.doesNotMatch(text, /gradient|\/Shading/i);
});

test('PDF helpers format dates, money, wrapping and unsupported characters', () => {
  assert.equal(formatDate('2026-11-15'), 'Nov 15, 2026');
  assert.equal(formatDateTime('2026-09-30T07:19:00Z'), 'Sep 30, 2026 3:19 PM PHT');
  assert.equal(formatMoney(1000, 'PHP'), 'PHP 1,000.00');
  assert.equal(formatMoney(-12.5, 'USD'), '-USD 12.50');
  assert.deepEqual(encodeWinAnsi('₱1'), [80, 72, 80, 32, 49]);
  assert.deepEqual(encodeWinAnsi('ñ—'), [0xf1, 0x97]);
  assert.ok(wrapText('word '.repeat(60), { size: 10, width: 200 }).length > 5);
});

test('JSON still generates with the same stable key, and PDF uses the same snapshot', async () => {
  const payload = buildReportExport(base);
  const seen = [];
  const { provider, store } = fakeWorkspace();
  await runReportExport({ provider, payload, renderPdf: (value) => { seen.push(value); return new Uint8Array([1]); } });
  assert.equal(seen[0], payload);
  const json = [...store.files.values()].find((f) => f.name === JSON_FILE_NAME);
  assert.equal(json.key, jsonArtifactKey('report-1'));
  assert.equal(json.key, 'report:report-1:v1');
  assert.equal(json.bytes, JSON.stringify(payload));
  assert.ok([...store.files.values()].some((f) => f.name === PDF_FILE_NAME));
});

test('Drive structure places PDF and JSON in the report folder and files in Attachments/', async () => {
  const { provider, store } = fakeWorkspace();
  const result = await runReportExport({ provider, payload: buildReportExport(base) });
  assert.deepEqual([...store.folders.keys()], ['Post Event Reports/2026/Iloilo/2026-11-15_Iloilo_Hour of AI_report-1', 'folder-1/Attachments']);
  assert.ok(store.attachments.has(`${result.attachments_folder_id}:a1`));
});

test('no attachments means no Attachments folder', async () => {
  const { provider, store } = fakeWorkspace();
  const result = await runReportExport({ provider, payload: buildReportExport({ ...base, attachments: [] }) });
  assert.equal(result.attachments_folder_id, undefined);
  assert.equal(store.folders.size, 1);
});

test('partial failure (JSON done, PDF failed) resumes without duplicating artifacts', async () => {
  const { provider, store } = fakeWorkspace({ failPdfTimes: 1 });
  const payload = buildReportExport(base);
  await assert.rejects(() => runReportExport({ provider, payload }), /pdf upload failed/);
  const checkpoint = store.checkpoints.at(-1);
  assert.ok(checkpoint.drive_folder_id && checkpoint.final_export_file_id);
  assert.equal(checkpoint.pdf_file_id, undefined);
  assert.equal(checkpoint.completed_at, undefined, 'not completed while an artifact is missing');
  assert.equal(store.rows.size, 0, 'no sheet row until every artifact exists');
  const result = await runReportExport({ provider, payload, checkpoint });
  assert.equal(result.final_export_file_id, checkpoint.final_export_file_id);
  assert.equal(store.creates, 2, 'one JSON and one PDF, never duplicated');
  assert.equal(store.folders.size, 2);
  assert.ok(result.completed_at);
});

test('retrying a finished export or a failed Sheet write never duplicates files or rows', async () => {
  const { provider, store } = fakeWorkspace({ failSheetTimes: 1 });
  const payload = buildReportExport(base);
  await assert.rejects(() => runReportExport({ provider, payload }), /sheets unavailable/);
  const resumed = await runReportExport({ provider, payload, checkpoint: store.checkpoints.at(-1) });
  await runReportExport({ provider, payload, checkpoint: resumed });
  assert.equal(store.creates, 2);
  assert.equal(store.rows.size, 1);
  assert.equal(store.attachments.size, 1);
});

test('tracker row is human-first with links, real dates, numbers and IDs on the right', () => {
  const payload = buildReportExport(base);
  const row = buildTrackerRow(payload, { status: 'completed', drive_folder_id: 'f1', pdf_file_id: 'p1', final_export_file_id: 'j1', completed_at: '2026-09-30T07:20:00Z' });
  assert.deepEqual(TRACKER_HEADERS.slice(0, 3), ['Event Name', 'Chapter', 'Event Date']);
  assert.deepEqual(TRACKER_HEADERS.slice(-2), ['Report ID', 'Event ID']);
  assert.equal(row[COLUMN.event_name], 'Hour of AI');
  assert.equal(row[COLUMN.event_date], dateSerial('2026-11-15'));
  assert.equal(row[COLUMN.event_date], 46341);
  assert.equal(row[COLUMN.approved_budget], 1000);
  assert.equal(row[COLUMN.balance], -250);
  assert.equal(row[COLUMN.drive_folder], '=HYPERLINK("https://drive.google.com/drive/folders/f1","Open Folder")');
  assert.equal(row[COLUMN.pdf], '=HYPERLINK("https://drive.google.com/file/d/p1/view","View PDF")');
  assert.equal(row[COLUMN.json], '=HYPERLINK("https://drive.google.com/file/d/j1/view","View JSON")');
  assert.equal(row[COLUMN.report_status], 'Approved');
  assert.equal(row[COLUMN.export_status], 'Completed');
  assert.equal(dateTimeSerial('2026-09-30T07:19:00Z'), Math.round((46295 + (15 * 60 + 19) / 1440) * 1e6) / 1e6);
  assert.equal(currencyPattern('PHP'), '"₱"#,##0.00;-"₱"#,##0.00');
});

test('free text cannot become a spreadsheet formula', () => {
  assert.equal(safeText('=IMPORTXML("http://x")'), '\'=IMPORTXML("http://x")');
  assert.equal(safeText('+63 917'), "'+63 917");
  assert.equal(safeText('Iloilo'), 'Iloilo');
});

test('existing legacy tracker rows upgrade in place without data loss', () => {
  assert.equal(isLegacyHeader(LEGACY_TRACKER_HEADERS), true);
  assert.equal(isLegacyHeader(TRACKER_HEADERS), false);
  const legacy = ['report-9', 'event-9', 'Robotics Day', 'Cebu', '2026-08-01', 'Ana', 'Jose', 30, 28, 25, 4, 'good', 5000, 4200, 800, 'approved', 'completed', 'folder-9', 'json-9', '2026-08-02T01:00:00Z', '2026-08-02T01:05:00Z'];
  const row = legacyRowToTracker(legacy);
  assert.equal(row[COLUMN.event_name], 'Robotics Day');
  assert.equal(row[COLUMN.report_id], 'report-9');
  assert.equal(row[COLUMN.event_id], 'event-9');
  assert.equal(row[COLUMN.registered], 30);
  assert.equal(row[COLUMN.balance], 800);
  assert.equal(row[COLUMN.satisfaction], 'Good');
  assert.equal(row[COLUMN.event_date], dateSerial('2026-08-01'));
  assert.match(row[COLUMN.drive_folder], /folder-9/);
  assert.match(row[COLUMN.json], /json-9/);
  assert.equal(row[COLUMN.pdf], '');
  assert.ok(legacyRowToTracker([]).every((cell) => cell === ''));
});

test('rows are found by Report ID, so sorting never duplicates a row', () => {
  assert.equal(chooseTrackerRow({ reportIds: ['Report ID', 'r2', 'r1'], reportId: 'r1', preferredRow: 2 }), 3);
  assert.equal(chooseTrackerRow({ reportIds: ['Report ID', 'r2'], reportId: 'r1', preferredRow: 3 }), 3);
  assert.equal(chooseTrackerRow({ reportIds: ['Report ID', 'r2', 'r3'], reportId: 'r1', preferredRow: 2 }), 4);
  assert.equal(chooseTrackerRow({ reportIds: ['Report ID'], reportId: 'r1' }), 2);
});

test('formatting setup is idempotent and preserves other rules and filters', () => {
  const first = trackerFormatRequests({ sheetId: 7, rowCount: 1000 });
  assert.ok(first.some((r) => r.addBanding));
  assert.ok(first.some((r) => r.setBasicFilter));
  assert.equal(first.filter((r) => r.deleteConditionalFormatRule).length, 0);
  const ours = first.filter((r) => r.addConditionalFormatRule).map((r) => ({ ranges: r.addConditionalFormatRule.rule.ranges }));
  const userRule = { ranges: [{ startColumnIndex: 0, endColumnIndex: 1 }] };
  const second = trackerFormatRequests({ sheetId: 7, rowCount: 1000, bandedRangeIds: [42], conditionalFormats: [userRule, ...ours], hasBasicFilter: true, basicFilterColumns: TRACKER_COLUMNS.length });
  assert.ok(!second.some((r) => r.addBanding));
  assert.equal(second.find((r) => r.updateBanding).updateBanding.bandedRange.bandedRangeId, 42);
  assert.ok(!second.some((r) => r.setBasicFilter), 'an existing filter keeps its criteria');
  const deletions = second.filter((r) => r.deleteConditionalFormatRule).map((r) => r.deleteConditionalFormatRule.index);
  assert.deepEqual(deletions, ours.map((_, i) => i + 1).reverse(), 'only the exporter rules are replaced, highest index first');
  assert.equal(second.filter((r) => r.addConditionalFormatRule).length, ours.length);
  const header = first.find((r) => r.repeatCell && r.repeatCell.range.endRowIndex === 1).repeatCell.cell.userEnteredFormat;
  assert.equal(header.textFormat.bold, true);
  assert.equal(header.verticalAlignment, 'MIDDLE');
  assert.equal(header.wrapStrategy, 'WRAP');
  assert.deepEqual(first[0].updateSheetProperties.properties.gridProperties, { frozenRowCount: 1, frozenColumnCount: 1 });
});

test('overview KPIs reference the tracker columns and never live inside the export table', () => {
  const values = overviewValues("Post Event Reports");
  assert.match(values[4][0], /COUNTIF\('Post Event Reports'!N2:N,"Approved"\)/);
  assert.match(values[4][3], /SUM\('Post Event Reports'!H2:H\)/);
});

test('Edge Function wires the new artifacts, keeps secrets server-side and never blocks on formatting', () => {
  assert.match(edge, /upsertFile:/);
  assert.match(edge, /ensureChildFolder:/);
  assert.match(edge, /isLegacyHeader/);
  assert.match(edge, /valueInputOption=\$\{input\}/);
  assert.match(edge, /bestEffort\('tracker_format'/);
  assert.match(edge, /Never overwrite an Overview tab someone else created/);
  assert.match(edge, /pdf_url: fileUrl\(result\.pdf_file_id\)/);
  assert.match(edge, /status: 'completed'/);
  assert.doesNotMatch(edge, /console\.(log|error)\([^)]*(refreshToken|token\b|SERVICE_ROLE)/);
  assert.match(migration, /add column if not exists pdf_file_id text/);
  assert.match(migration, /add column if not exists attachments_folder_id text/);
});
