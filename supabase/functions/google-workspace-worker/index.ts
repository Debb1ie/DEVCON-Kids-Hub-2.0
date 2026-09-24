import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { findOrCreateEventFolder, upsertReportSheetRow } from './core.mjs';
import { decryptToken, refreshAccessToken, requiredEnv } from '../_shared/googleOAuth.ts';

const SAFE_FAILURE = 'Google Workspace synchronization failed. Review the integration configuration and retry.';
const JSON_HEADERS = { 'content-type': 'application/json' };

const respond = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const escapeDriveQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

async function googleRequest(accessToken: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...init.headers },
  });
  if (!response.ok) throw new Error(`Provider request failed with status ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function ensureEventFolder(db: ReturnType<typeof createClient>, token: string, job: Record<string, string>) {
  const existing = await db.from('google_workspace_event_links').select('*').eq('event_id', job.event_id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.google_folder_id;

  const [eventResult, settingsResult] = await Promise.all([
    db.from('events').select('id,title,event_date').eq('id', job.event_id).single(),
    db.from('google_workspace_settings').select('*').eq('singleton', true).single(),
  ]);
  if (eventResult.error || settingsResult.error) throw eventResult.error || settingsResult.error;
  const provider = {
    findFolders: async (name: string, parentId: string) => {
      const query = encodeURIComponent(`name = '${escapeDriveQuery(name)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
      const found = await googleRequest(token, `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)&pageSize=2`);
      return found.files || [];
    },
    createFolder: (name: string, parentId: string) => googleRequest(token, 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST', body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    }),
  };
  const { folder } = await findOrCreateEventFolder(provider, eventResult.data, settingsResult.data.google_drive_root_folder_id);
  const saved = await db.from('google_workspace_event_links').upsert({
    event_id: job.event_id,
    google_folder_id: folder.id,
    google_folder_url: folder.webViewLink || folderUrl(folder.id),
  }, { onConflict: 'event_id' });
  if (saved.error) throw saved.error;
  return folder.id;
}

async function syncReport(db: ReturnType<typeof createClient>, token: string, job: Record<string, string>) {
  const [settings, report, existingSync] = await Promise.all([
    db.from('google_workspace_settings').select('*').eq('singleton', true).single(),
    db.from('post_event_reports').select('id,event_id,status,submitted_at,approved_at,submitted_by,events(title,event_date,chapter),post_event_report_attendance(registered_count,attended_count,children_reached,volunteers_involved),post_event_report_impact(satisfaction_rating)').eq('id', job.report_id).single(),
    db.from('google_workspace_report_syncs').select('*').eq('report_id', job.report_id).maybeSingle(),
  ]);
  if (settings.error || report.error || existingSync.error) throw settings.error || report.error || existingSync.error;
  let [folder, submitter] = await Promise.all([
    db.from('google_workspace_event_links').select('google_folder_url').eq('event_id', report.data.event_id).maybeSingle(),
    db.from('profiles').select('full_name').eq('id', report.data.submitted_by).maybeSingle(),
  ]);
  if (folder.error || submitter.error) throw folder.error || submitter.error;
  if (!folder.data && settings.data.automatic_folder_creation_enabled) {
    await ensureEventFolder(db, token, { event_id: report.data.event_id });
    folder = await db.from('google_workspace_event_links').select('google_folder_url').eq('event_id', report.data.event_id).single();
    if (folder.error) throw folder.error;
  }
  const attendance = Array.isArray(report.data.post_event_report_attendance) ? report.data.post_event_report_attendance[0] || {} : report.data.post_event_report_attendance || {};
  const impact = Array.isArray(report.data.post_event_report_impact) ? report.data.post_event_report_impact[0] || {} : report.data.post_event_report_impact || {};
  const metricsApproved = report.data.status === 'approved';
  const values = [[
    report.data.events?.title || '', report.data.events?.event_date || '', report.data.events?.chapter || '',
    report.data.status, submitter.data?.full_name || '', report.data.submitted_at || '', report.data.approved_at || '',
    metricsApproved ? attendance.registered_count ?? '' : '', metricsApproved ? attendance.attended_count ?? '' : '',
    metricsApproved ? attendance.children_reached ?? '' : '', metricsApproved ? attendance.volunteers_involved ?? '' : '',
    metricsApproved ? impact.satisfaction_rating ?? '' : '', folder.data?.google_folder_url || '', '',
  ]];
  const tab = settings.data.report_sheet_tab_name.replace(/'/g, "''");
  let syncRecord = existingSync.data;
  if (!syncRecord) {
    const allocated = await db.from('google_workspace_report_syncs').insert({ report_id: job.report_id }).select('*').single();
    if (allocated.error) throw allocated.error;
    syncRecord = allocated.data;
  }
  const stableReference = syncRecord.sheet_row_reference || `'${tab}'!A${syncRecord.sheet_row_number}:N${syncRecord.sheet_row_number}`;
  const provider = {
    updateRow: (reference: string, rowValues: unknown[][]) => googleRequest(token, `https://sheets.googleapis.com/v4/spreadsheets/${settings.data.report_sheet_id}/values/${encodeURIComponent(reference)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: rowValues }) }),
    appendRow: async () => { throw new Error('Stable Sheet row allocation is required'); },
  };
  await provider.updateRow(`'${tab}'!A1:N1`, [[
    'Event name', 'Event date', 'Chapter', 'Report status', 'Submitted by', 'Submitted at', 'Approved at',
    'Registered', 'Attended', 'Children reached', 'Volunteers involved', 'Satisfaction', 'Event folder', 'Report attachment',
  ]]);
  const rowReference = await upsertReportSheetRow(provider, stableReference, values);
  const saved = await db.from('google_workspace_report_syncs').upsert({ report_id: job.report_id, sheet_row_reference: rowReference, last_synced_at: new Date().toISOString() }, { onConflict: 'report_id' });
  if (saved.error) throw saved.error;
  return rowReference;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });
  try {
    const url = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('authorization') || '';
    const caller = createClient(url, anonKey, { global: { headers: { authorization } }, auth: { persistSession: false } });
    const user = await caller.auth.getUser();
    if (user.error || !user.data.user) return respond(401, { error: 'Authentication required.' });
    const role = await caller.from('user_roles').select('role').eq('user_id', user.data.user.id).eq('role', 'super_admin').maybeSingle();
    if (role.error || !role.data) return respond(403, { error: 'Only a Super Admin can process integration jobs.' });

    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const credential = await db.from('google_oauth_credentials').select('refresh_token_ciphertext').eq('singleton', true).single();
    if (credential.error) throw credential.error;
    const token = await refreshAccessToken(await decryptToken(credential.data.refresh_token_ciphertext));
    const claimed = await db.rpc('claim_google_workspace_jobs', { batch_size: 10 });
    if (claimed.error) throw claimed.error;
    let succeeded = 0;
    for (const job of claimed.data || []) {
      try {
        const externalRef = job.job_type === 'create_event_folder'
          ? await ensureEventFolder(db, token, job)
          : await syncReport(db, token, job);
        const finished = await db.rpc('finish_google_workspace_job', { job_id: job.id, succeeded: true, external_ref: externalRef });
        if (finished.error) throw finished.error;
        succeeded += 1;
      } catch {
        await db.rpc('finish_google_workspace_job', { job_id: job.id, succeeded: false, safe_error: SAFE_FAILURE });
      }
    }
    return respond(200, { processed: claimed.data?.length || 0, succeeded });
  } catch {
    return respond(500, { error: SAFE_FAILURE });
  }
});
