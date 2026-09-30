// Describes a Post Event Report as it should appear on an event card.
// Event status (Scheduled, Completed, ...) and report status (draft,
// submitted, needs_revision, approved, archived) are separate lifecycles:
// a Completed event only means a report may be written, never that one was
// submitted, approved or exported. Actions mirror the existing routes and
// permissions; nothing here grants access the server would refuse.
import { canPerform } from '../auth/permissions.js';

export const REPORT_CARD_LABELS = Object.freeze({
  draft: 'Draft',
  submitted: 'Pending Review',
  needs_revision: 'Needs Revision',
  approved: 'Approved',
  archived: 'Archived',
});

const REVIEWER_ROLES = new Set(['super_admin', 'admin']);
const EXPORT_HELP = {
  completed: 'Approved and exported to Google Drive.',
  pending: 'Approved. Google Drive export is queued.',
  processing: 'Approved. Google Drive export is in progress.',
  failed: 'Approved. The Google Drive export failed and needs a retry.',
};

export const reportFormLink = (eventId) => `/dashboard/post-event-report?event=${encodeURIComponent(eventId)}`;
export const reportReviewLink = (reportId) => `/dashboard/post-event-report/review/${encodeURIComponent(reportId)}`;

const isAssignedCoordinator = ({ event, roleKey, userId }) => canPerform(roleKey, 'report.create', {
  actorUserId: userId,
  event,
  assignments: (event?.event_assignments || []).map((item) => ({ ...item, event_id: event.id })),
});

export function describeEventReport({ event, report = null, roleKey, userId }) {
  const reviewer = REVIEWER_ROLES.has(roleKey);
  const author = isAssignedCoordinator({ event, roleKey, userId });

  if (!report) {
    if (event?.status !== 'Completed') return null;
    if (author) {
      return { status: 'not_started', label: 'Not Started', helper: 'This event is complete. Its report has not been started.', action: { label: 'Create report', to: reportFormLink(event.id) } };
    }
    return { status: 'not_submitted', label: 'Not Submitted', helper: 'Waiting for the event coordinator to submit a report.', action: null };
  }

  const label = REPORT_CARD_LABELS[report.status] || report.status;
  const view = reviewer ? { label: 'View report', to: reportReviewLink(report.id) } : author ? { label: 'View report', to: reportFormLink(event.id) } : null;
  switch (report.status) {
    case 'draft':
      return { status: 'draft', label, helper: 'Saved as a draft. It has not been submitted for review.', action: author ? { label: 'Continue report', to: reportFormLink(event.id) } : null };
    case 'submitted':
      return reviewer
        ? { status: 'submitted', label, helper: 'Submitted and waiting for review.', action: { label: 'Review report', to: reportReviewLink(report.id) } }
        : { status: 'submitted', label, helper: 'Submitted for review. It is read-only until a reviewer responds.', action: view };
    case 'needs_revision':
      return author
        ? { status: 'needs_revision', label, helper: 'A reviewer requested changes. Revise and resubmit.', action: { label: 'Revise report', to: reportFormLink(event.id) } }
        : { status: 'needs_revision', label, helper: 'Returned to the coordinator for revision.', action: view };
    case 'approved':
      return { status: 'approved', label, helper: EXPORT_HELP[report.exportStatus] || 'Approved. Export has not started yet.', action: view, exportStatus: report.exportStatus || null };
    default:
      return { status: report.status, label, helper: '', action: view };
  }
}
