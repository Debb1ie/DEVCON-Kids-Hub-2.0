import { buildTrackerRow } from './tracker.mjs';
import { renderReportPdf } from './pdf.mjs';

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

export const JSON_FILE_NAME = 'Post Event Report.json';
export const PDF_FILE_NAME = 'Post Event Report.pdf';
export const ATTACHMENTS_FOLDER_NAME = 'Attachments';
// The JSON key keeps its original value so earlier exports are updated, not duplicated.
export const jsonArtifactKey = (reportId) => `report:${reportId}:v${AUTOMATION_VERSION}`;
export const pdfArtifactKey = (reportId) => `report-pdf:${reportId}:v1`;

export const sheetRow = (payload, automation) => [buildTrackerRow(payload, automation)];

// Every artifact is checkpointed as soon as it exists. A retry resumes from
// the checkpoint: finished artifacts are reused and only missing ones are
// produced. The caller marks the export completed only after this resolves.
export async function runReportExport({ provider, payload, checkpoint = {}, renderPdf = renderReportPdf, now = () => new Date().toISOString() }) {
  if (payload.report.status !== 'approved') throw new Error('Only approved reports can be exported.');
  const next = { ...checkpoint };
  const save = async () => { await provider.checkpoint?.(next); };
  if (!next.drive_folder_id) {
    next.drive_folder_id = await provider.ensureFolderPath(reportFolderPath(payload));
    await save();
  }
  if (!next.final_export_file_id) {
    next.final_export_file_id = await provider.upsertJsonFile(next.drive_folder_id, JSON_FILE_NAME, payload, jsonArtifactKey(payload.report.id));
    await save();
  }
  if (!next.pdf_file_id) {
    const bytes = renderPdf(payload, { generatedAt: now(), driveFolderId: next.drive_folder_id, jsonFileId: next.final_export_file_id });
    if (!bytes?.length) throw new Error('The report PDF could not be generated.');
    next.pdf_file_id = await provider.upsertFile(next.drive_folder_id, PDF_FILE_NAME, bytes, 'application/pdf', pdfArtifactKey(payload.report.id));
    await save();
  }
  const uploaded = new Set(next.uploaded_attachment_ids || []);
  const remaining = (payload.attachments || []).filter((attachment) => !uploaded.has(attachment.id));
  if (remaining.length && !next.attachments_folder_id) {
    next.attachments_folder_id = await provider.ensureChildFolder(ATTACHMENTS_FOLDER_NAME, next.drive_folder_id);
    await save();
  }
  for (const attachment of remaining) {
    await provider.copyAttachment(next.attachments_folder_id, attachment);
    uploaded.add(attachment.id);
    next.uploaded_attachment_ids = [...uploaded];
    await save();
  }
  next.completed_at = now();
  next.sheet_row_reference = await provider.upsertSheetRow(`post_event_report:${payload.report.id}`, sheetRow(payload, { ...next, status: 'completed' }), next.sheet_row_reference, { currency: payload.finance.currency_code, reportId: payload.report.id });
  return next;
}
