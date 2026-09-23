import { supabase } from '../lib/supabase.js';

const safeMessage = (error, fallback) => {
  if (error?.code === '42501') return 'You are not authorized to export this report.';
  return error?.message || fallback;
};

export const createReportAutomationService = (client = supabase) => ({
  async load(reportId) {
    if (!reportId) return null;
    const result = await client.from('post_event_report_exports')
      .select('report_id,status,attempt_count,last_attempted_at,completed_at,safe_error_message,drive_folder_url,final_export_url,sheet_row_reference,automation_version')
      .eq('report_id', reportId).maybeSingle();
    // Keep the existing report screen usable while the review-only migration is
    // awaiting an explicitly authorized database rollout.
    if (result.error?.code === '42P01' || result.error?.code === 'PGRST205') return null;
    if (result.error) throw new Error(safeMessage(result.error, 'Export status could not be loaded.'));
    return result.data;
  },

  async export(reportId) {
    if (!reportId) throw new Error('Save the report before exporting it.');
    const result = await client.functions.invoke('report-export', { body: { reportId } });
    if (result.error) throw new Error(safeMessage(result.data, 'Report export could not be started.'));
    return result.data?.export || null;
  },
});

export const reportAutomationService = createReportAutomationService();
