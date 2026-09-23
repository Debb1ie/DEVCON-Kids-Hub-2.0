export const AUTOMATION_VERSION = '1';

export const sanitizeSegment = (value, fallback = 'unknown') => {
  const cleaned = String(value || fallback)
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return (cleaned || fallback).slice(0, 120);
};

export const reportFolderPath = ({ report, event, chapter }) => {
  const eventDate = event.event_date || event.date;
  const eventName = event.title || event.name;
  const year = String(eventDate || '').slice(0, 4) || 'Date pending';
  const leaf = [eventDate || 'date-pending', chapter?.name || event.chapter || 'No chapter', eventName, report.id]
    .map((part) => sanitizeSegment(part))
    .join('_');
  return ['Post Event Reports', year, sanitizeSegment(chapter?.name || event.chapter || 'No chapter'), leaf];
};

export const buildReportExport = ({ report, event, chapter, submitter, approver, attendance, impact, finance, transactions, attachments }) => {
  const expenses = (transactions || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const budget = Number(finance?.approved_budget || 0);
  return {
    schema_version: AUTOMATION_VERSION,
    idempotency_key: `post_event_report:${report.id}`,
    report: { id: report.id, status: report.status, submitted_at: report.submitted_at, approved_at: report.approved_at, venue: report.venue, coordinator_name: report.coordinator_name, event_summary: report.event_summary },
    event: { id: event.id, name: event.title, date: event.event_date, chapter_id: event.chapter_id, chapter: chapter?.name || event.chapter || null },
    people: { submitted_by: submitter?.full_name || null, approved_by: approver?.full_name || null },
    attendance: attendance || {},
    impact: impact || {},
    finance: { currency_code: finance?.currency_code || 'PHP', approved_budget: budget, expenses, balance: budget - expenses, transactions: transactions || [] },
    attachments: (attachments || []).map(({ id, file_name, file_type, file_size, category, caption }) => ({ id, file_name, file_type, file_size, category, caption })),
  };
};

export const sheetRow = (payload, automation) => [[
  payload.report.id, payload.event.id, payload.event.name || '', payload.event.chapter || '', payload.event.date || '',
  payload.people.submitted_by || '', payload.people.approved_by || '', payload.attendance.registered_count ?? '',
  payload.attendance.attended_count ?? '', payload.attendance.children_reached ?? '', payload.attendance.volunteers_involved ?? '',
  payload.impact.satisfaction_rating || '', payload.finance.approved_budget, payload.finance.expenses, payload.finance.balance,
  payload.report.status, automation.status, automation.drive_folder_id || '', automation.final_export_file_id || '',
  payload.report.approved_at || '', automation.completed_at || '',
]];

export async function runReportExport({ provider, payload, checkpoint = {} }) {
  if (payload.report.status !== 'approved') throw new Error('Only approved reports can be exported.');
  const next = { ...checkpoint };
  if (!next.drive_folder_id) next.drive_folder_id = await provider.ensureFolderPath(reportFolderPath(payload));
  if (!next.final_export_file_id) next.final_export_file_id = await provider.upsertJsonFile(next.drive_folder_id, `post-event-report-${payload.report.id}.json`, payload, `report:${payload.report.id}:v${AUTOMATION_VERSION}`);
  const uploaded = new Set(next.uploaded_attachment_ids || []);
  for (const attachment of payload.attachments) {
    if (!uploaded.has(attachment.id)) {
      await provider.copyAttachment(next.drive_folder_id, attachment);
      uploaded.add(attachment.id);
      next.uploaded_attachment_ids = [...uploaded];
      await provider.checkpoint?.(next);
    }
  }
  next.completed_at = new Date().toISOString();
  next.sheet_row_reference = await provider.upsertSheetRow(`post_event_report:${payload.report.id}`, sheetRow(payload, { ...next, status: 'completed' }), next.sheet_row_reference);
  return next;
}
