import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { buildReportExport, runReportExport } from './core.mjs';
import { decryptToken, requiredEnv } from '../_shared/googleOAuth.ts';

const SAFE_FAILURE = 'Report export failed. Review the Google Workspace configuration and retry.';
const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const driveUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
const fileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

type GoogleDiagnostic = {
  stage: string;
  provider: 'google';
  service: 'oauth' | 'drive' | 'sheets';
  status: number | null;
  reason: string;
  message: string;
};

class GoogleFailure extends Error {
  diagnostic: GoogleDiagnostic;
  constructor(diagnostic: GoogleDiagnostic) {
    super(`${diagnostic.service}:${diagnostic.stage}:${diagnostic.reason}`);
    this.name = 'GoogleFailure';
    this.diagnostic = diagnostic;
  }
}

const safeText = (value: unknown, fallback: string) => String(value || fallback)
  .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
  .replace(/(access_token|refresh_token|client_secret|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 240);

const googleDiagnostic = (stage: string, service: GoogleDiagnostic['service'], status: number | null, body: unknown): GoogleDiagnostic => {
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const nested = payload.error && typeof payload.error === 'object' ? payload.error as Record<string, unknown> : {};
  const details = Array.isArray(nested.errors) && nested.errors[0] && typeof nested.errors[0] === 'object'
    ? nested.errors[0] as Record<string, unknown> : {};
  const reason = safeText(payload.error_description || nested.status || nested.code || details.reason || payload.error, 'provider_error');
  const message = safeText(payload.error_description || nested.message || details.message || 'Google provider request failed.', 'Google provider request failed.');
  return { stage, provider: 'google', service, status, reason, message };
};

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: 'Google provider returned a non-JSON error.' }; }
}

async function refreshGoogleToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'), client_secret: requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  });
  const body = await responseBody(response);
  if (!response.ok) throw new GoogleFailure(googleDiagnostic('oauth_refresh', 'oauth', response.status, body));
  if (!body.access_token) throw new GoogleFailure(googleDiagnostic('oauth_refresh', 'oauth', response.status, { error: 'access_token_unavailable' }));
  return body.access_token as string;
}

async function request(token: string, url: string, stage: string, service: 'drive' | 'sheets', init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
  if (!response.ok) throw new GoogleFailure(googleDiagnostic(stage, service, response.status, await responseBody(response)));
  return response.status === 204 ? null : response.json();
}

const multipart = (metadata: unknown, bytes: Uint8Array, type: string) => {
  const boundary = `devcon_${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const before = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`);
  const after = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(before.length + bytes.length + after.length);
  body.set(before); body.set(bytes, before.length); body.set(after, before.length + bytes.length);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });
  let exportRow: Record<string, unknown> | null = null;
  let db: ReturnType<typeof createClient> | null = null;
  let currentStage = 'request_validation';
  try {
    const { reportId } = await req.json();
    if (!reportId || typeof reportId !== 'string') return reply(400, { error: 'A report ID is required.' });
    const url = requiredEnv('SUPABASE_URL');
    const anon = requiredEnv('SUPABASE_ANON_KEY');
    const service = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'Authentication required.', code: 'AUTH_REQUIRED' });
    const accessToken = authorization.slice('Bearer '.length).trim();
    if (!accessToken) return reply(401, { error: 'Authentication required.', code: 'AUTH_REQUIRED' });
    const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    // This server-side client has no persisted browser session. Validate the
    // incoming caller JWT explicitly, matching the working ai-chat boundary.
    const session = await caller.auth.getUser(accessToken);
    if (session.error) return reply(401, { error: 'Authentication required.', code: 'INVALID_JWT' });
    if (!session.data.user) return reply(401, { error: 'Authentication required.', code: 'USER_LOOKUP_FAILED' });
    const queued = await caller.rpc('request_report_export', { check_report_id: reportId });
    if (queued.error) return reply(queued.error.code === '42501' ? 403 : 409, { error: queued.error.message });
    if (queued.data.status === 'completed') return reply(200, { export: queued.data, duplicate: true });
    if (queued.data.status === 'processing') return reply(202, { export: queued.data });

    db = createClient(url, service, { auth: { persistSession: false } });
    const claimed = await db.from('post_event_report_exports').update({ status: 'processing', attempt_count: Number(queued.data.attempt_count) + 1, last_attempted_at: new Date().toISOString() })
      .eq('report_id', reportId).eq('status', 'pending').select('*').maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) return reply(202, { export: queued.data });
    exportRow = claimed.data;
    await db.from('audit_logs').insert({ actor_id: session.data.user.id, action: 'REPORT_EXPORT_STARTED', target_table: 'post_event_reports', target_id: reportId });

    const [report, attendance, impact, finance, transactions, attachments, settings, credential] = await Promise.all([
      db.from('post_event_reports').select('*,events(*,chapters(name))').eq('id', reportId).single(),
      db.from('post_event_report_attendance').select('*').eq('report_id', reportId).maybeSingle(),
      db.from('post_event_report_impact').select('*').eq('report_id', reportId).maybeSingle(),
      db.from('post_event_report_finance').select('*').eq('report_id', reportId).maybeSingle(),
      db.from('post_event_report_transactions').select('*').eq('report_id', reportId).order('created_at'),
      db.from('post_event_report_attachments').select('*').eq('report_id', reportId).order('created_at'),
      db.from('google_workspace_settings').select('*').eq('singleton', true).single(),
      db.from('google_oauth_credentials').select('refresh_token_ciphertext').eq('singleton', true).single(),
    ]);
    const failed = [report, attendance, impact, finance, transactions, attachments, settings, credential].find((item) => item.error);
    if (failed?.error) throw failed.error;
    if (report.data.status !== 'approved') throw new Error('Only approved reports can be exported.');
    const [submitter, approver] = await Promise.all([
      db.from('profiles').select('full_name').eq('id', report.data.submitted_by).maybeSingle(),
      db.from('profiles').select('full_name').eq('id', report.data.reviewed_by).maybeSingle(),
    ]);
    const event = report.data.events;
    const payload = buildReportExport({ report: report.data, event, chapter: event.chapters, submitter: submitter.data, approver: approver.data, attendance: attendance.data, impact: impact.data, finance: finance.data, transactions: transactions.data, attachments: attachments.data });
    currentStage = 'oauth_decrypt';
    const refreshToken = await decryptToken(credential.data.refresh_token_ciphertext);
    currentStage = 'oauth_refresh';
    const token = await refreshGoogleToken(refreshToken);
    const root = settings.data.google_drive_root_folder_id;
    if (!root || !settings.data.report_sheet_id) throw new Error('Google Drive and Sheets destinations are required.');

    const ensureChild = async (name: string, parent: string) => {
      const q = encodeURIComponent(`name='${escapeQuery(name)}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      currentStage = 'drive_folder_lookup';
      const found = await request(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, currentStage, 'drive');
      if (found.files?.[0]) return found.files[0].id;
      currentStage = 'drive_folder_create';
      return (await request(token, 'https://www.googleapis.com/drive/v3/files?fields=id', currentStage, 'drive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) })).id;
    };
    const provider = {
      ensureFolderPath: async (parts: string[]) => { let parent = root; for (const part of parts) parent = await ensureChild(part, parent); return parent; },
      upsertJsonFile: async (folderId: string, name: string, value: unknown, stableKey: string) => {
        const q = encodeURIComponent(`'${folderId}' in parents and appProperties has { key='devconKey' and value='${escapeQuery(stableKey)}' } and trashed=false`);
        currentStage = 'drive_json_lookup';
        const found = await request(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, currentStage, 'drive');
        const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2));
        const metadata = found.files?.[0] ? { name } : { name, parents: [folderId], appProperties: { devconKey: stableKey } };
        const part = multipart(metadata, bytes, 'application/json');
        const endpoint = found.files?.[0] ? `https://www.googleapis.com/upload/drive/v3/files/${found.files[0].id}?uploadType=multipart&fields=id` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
        currentStage = 'drive_json_upload';
        return (await request(token, endpoint, currentStage, 'drive', { method: found.files?.[0] ? 'PATCH' : 'POST', headers: { 'content-type': part.contentType }, body: part.body })).id;
      },
      copyAttachment: async (folderId: string, attachment: Record<string, string>) => {
        const stableKey = `attachment:${attachment.id}`;
        const q = encodeURIComponent(`'${folderId}' in parents and appProperties has { key='devconKey' and value='${escapeQuery(stableKey)}' } and trashed=false`);
        currentStage = 'drive_attachment_lookup';
        const found = await request(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, currentStage, 'drive');
        if (found.files?.[0]) return found.files[0].id;
        const source = await db!.storage.from('event-report-attachments').download((attachments.data.find((row) => row.id === attachment.id)).storage_path);
        if (source.error) throw source.error;
        const bytes = new Uint8Array(await source.data.arrayBuffer());
        const part = multipart({ name: attachment.file_name, parents: [folderId], appProperties: { devconKey: stableKey } }, bytes, attachment.file_type);
        currentStage = 'drive_attachment_upload';
        await request(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', currentStage, 'drive', { method: 'POST', headers: { 'content-type': part.contentType }, body: part.body });
      },
      checkpoint: async (state: Record<string, unknown>) => { await db!.from('post_event_report_exports').update(state).eq('report_id', reportId); },
      upsertSheetRow: async (_key: string, values: unknown[][], existing: string | null) => {
        let reference = existing;
        if (!reference) {
          const allocation = await db!.from('google_workspace_report_syncs').upsert({ report_id: reportId }, { onConflict: 'report_id', ignoreDuplicates: true }).select('*').maybeSingle();
          const row = allocation.data || (await db!.from('google_workspace_report_syncs').select('*').eq('report_id', reportId).single()).data;
          const tab = settings.data.report_sheet_tab_name.replace(/'/g, "''"); reference = `'${tab}'!A${row.sheet_row_number}:U${row.sheet_row_number}`;
        }
        const tab = settings.data.report_sheet_tab_name.replace(/'/g, "''");
        currentStage = 'sheets_header_write';
        await request(token, `https://sheets.googleapis.com/v4/spreadsheets/${settings.data.report_sheet_id}/values/${encodeURIComponent(`'${tab}'!A1:U1`)}?valueInputOption=RAW`, currentStage, 'sheets', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: [[
          'Report ID', 'Event ID', 'Event name', 'Chapter', 'Event date', 'Submitted by', 'Approved by', 'Registered', 'Attended', 'Learners reached', 'Volunteers', 'Satisfaction', 'Approved budget', 'Expenses', 'Balance', 'Report status', 'Export status', 'Drive folder ID', 'Final export file ID', 'Approved at', 'Exported at',
        ]] }) });
        currentStage = 'sheets_row_write';
        await request(token, `https://sheets.googleapis.com/v4/spreadsheets/${settings.data.report_sheet_id}/values/${encodeURIComponent(reference)}?valueInputOption=RAW`, currentStage, 'sheets', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values }) });
        return reference;
      },
    };
    const completedAt = new Date().toISOString();
    const result = await runReportExport({ provider, payload, checkpoint: claimed.data });
    await db.from('audit_logs').insert({ actor_id: session.data.user.id, action: 'REPORT_EXPORT_DESTINATION_READY', target_table: 'post_event_reports', target_id: reportId, metadata: { drive_folder_id: result.drive_folder_id, final_export_file_id: result.final_export_file_id } });
    const completed = await db.from('post_event_report_exports').update({ ...result, status: 'completed', completed_at: completedAt, safe_error_message: null, drive_folder_url: driveUrl(result.drive_folder_id), final_export_url: fileUrl(result.final_export_file_id) }).eq('report_id', reportId).select('*').single();
    if (completed.error) throw completed.error;
    await db.from('audit_logs').insert({ actor_id: session.data.user.id, action: 'REPORT_EXPORT_COMPLETED', target_table: 'post_event_reports', target_id: reportId, metadata: { automation_version: '1' } });
    return reply(200, { export: completed.data });
  } catch (error) {
    if (db && exportRow) {
      const diagnostic: GoogleDiagnostic | { stage: string; provider: 'internal'; service: 'worker'; status: null; reason: string; message: string } = error instanceof GoogleFailure
        ? error.diagnostic
        : { stage: currentStage, provider: 'internal', service: 'worker', status: null, reason: 'worker_error', message: 'The export worker failed outside a Google provider response.' };
      const safeLedgerError = diagnostic.provider === 'google'
        ? `Google ${diagnostic.service} failed at ${diagnostic.stage}${diagnostic.status ? ` (HTTP ${diagnostic.status})` : ''}: ${diagnostic.reason}.`
        : SAFE_FAILURE;
      console.error(JSON.stringify({ event: 'REPORT_EXPORT_FAILED', report_id: exportRow.report_id, diagnostic }));
      await db.from('post_event_report_exports').update({ status: 'failed', safe_error_message: safeLedgerError }).eq('report_id', exportRow.report_id);
      await db.from('audit_logs').insert({ actor_id: exportRow.initiated_by, action: 'REPORT_EXPORT_FAILED', target_table: 'post_event_reports', target_id: exportRow.report_id, metadata: { error: SAFE_FAILURE, diagnostic } });
    }
    return reply(500, { error: SAFE_FAILURE });
  }
});
