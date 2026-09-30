export const REPORT_STATUS_LABELS = Object.freeze({
  draft: 'Draft',
  submitted: 'Submitted',
  needs_revision: 'Needs Revision',
  approved: 'Approved',
  archived: 'Archived',
});

export const EXPORT_STATUS_LABELS = Object.freeze({
  pending: 'Export Pending',
  processing: 'Export Processing',
  completed: 'Export Completed',
  failed: 'Export Failed',
});

export const getExportLabel = (status) => EXPORT_STATUS_LABELS[status] || 'Not started';

export const normalizePostEventReports = (reports) => (
  Array.isArray(reports) ? reports : reports ? [reports] : []
);

export const filterReviewQueue = (reports, { status = 'submitted', chapter = 'all', search = '' } = {}) => {
  const term = search.trim().toLowerCase();
  return reports.filter((report) => {
    if (status !== 'all' && report.status !== status) return false;
    if (chapter !== 'all' && report.chapter !== chapter) return false;
    if (!term) return true;
    return [report.eventName, report.submitterName].some((value) => String(value || '').toLowerCase().includes(term));
  });
};

export const prioritizeReviewQueue = (reports) => [...reports].sort((left, right) => {
  const priority = Number(right.status === 'submitted') - Number(left.status === 'submitted');
  if (priority) return priority;
  return String(right.submittedAt || right.updatedAt || '').localeCompare(String(left.submittedAt || left.updatedAt || ''));
});
