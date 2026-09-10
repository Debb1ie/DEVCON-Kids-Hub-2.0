import { supabase } from '../lib/supabase.js';

const assertSuperAdmin = (role) => {
  if (role !== 'super_admin') throw new Error('Only a Super Admin can manage Google Workspace integration.');
};

const friendly = (error, fallback) => {
  if (!error) return null;
  if (error.code === '42501') return new Error('Only a Super Admin can manage Google Workspace integration.');
  if (error.code === '22023') return new Error(error.message || 'Check the Google resource URL or ID.');
  return new Error(fallback);
};

export const createGoogleWorkspaceService = (client = supabase) => ({
  async load(role) {
    assertSuperAdmin(role);
    const [settings, jobs] = await Promise.all([
      client.rpc('get_google_workspace_settings'),
      client.from('google_workspace_jobs').select('id,job_type,status,attempt_count,safe_error_message,created_at,updated_at,completed_at,event_id,report_id').order('created_at', { ascending: false }).limit(100),
    ]);
    if (settings.error) throw friendly(settings.error, 'Integration settings could not be loaded.');
    if (jobs.error) throw friendly(jobs.error, 'Integration job history could not be loaded.');
    return { settings: settings.data, jobs: jobs.data || [] };
  },

  async save(role, values) {
    assertSuperAdmin(role);
    const result = await client.rpc('update_google_workspace_settings', {
      shared_drive_root: values.sharedDriveRoot,
      report_sheet: values.reportSheet,
      automatic_folders: Boolean(values.automaticFolders),
      sheet_sync: Boolean(values.sheetSync),
      sheet_tab_name: values.sheetTabName || 'Post Event Reports',
    });
    if (result.error) throw friendly(result.error, 'Integration settings could not be saved.');
    return result.data;
  },

  async retry(role, jobId) {
    assertSuperAdmin(role);
    const result = await client.rpc('retry_google_workspace_job', { job_id: jobId });
    if (result.error) throw friendly(result.error, 'The failed job could not be queued for retry.');
    return result.data;
  },

  async process(role) {
    assertSuperAdmin(role);
    const result = await client.functions.invoke('google-workspace-worker', { body: {} });
    if (result.error) throw new Error('Integration jobs could not be processed. Try again later.');
    return result.data;
  },
});

export const googleWorkspaceService = createGoogleWorkspaceService();
