import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppState';
import ConfirmationModal from '../components/ConfirmationModal';
import PageHeader from '../components/PageHeader';
import PostEventReportNav from '../components/PostEventReportNav';
import StatusBadge from '../components/StatusBadge';
import { buildEventReportForm } from '../services/postEventReportForm';
import { postEventReportRepository } from '../services/postEventReportService';
import { reportAutomationService } from '../services/reportAutomationService';
import { getExportLabel, REPORT_STATUS_LABELS } from '../services/postEventReportQueue';
import './PostEventReport.css';
import './PostEventReportReviewQueue.css';

const formatDate = (value) => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0));

export default function PostEventReportReviewDetail() {
  const { reportId } = useParams();
  const { user } = useApp();
  const [data, setData] = useState(null);
  const [automation, setAutomation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState(null);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const requestPending = useRef(false);

  useEffect(() => {
    let active = true;
    postEventReportRepository.loadById(reportId)
      .then(async (result) => {
        if (!result) throw new Error('The report was not found or is outside your review scope.');
        const recovery = await reportAutomationService.loadAndRecover(result.report.id);
        if (active) {
          setData(result);
          setAutomation(recovery.automation);
          if (recovery.dispatchError) setExportNotice('Report approved, but export could not be started automatically. It remains queued for recovery.');
        }
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'The report could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reportId]);

  const form = useMemo(() => data ? buildEventReportForm(data.event, data) : null, [data]);
  const expenses = useMemo(() => (data?.transactions || []).reduce((sum, item) => sum + Number(item.amount || 0), 0), [data]);
  const submitter = data?.submitter?.full_name || data?.submitter?.email || data?.report?.submitted_by || 'Unknown submitter';
  const canReview = data?.report?.status === 'submitted';
  const isOwnReport = Boolean(user?.id && user.id === data?.report?.submitted_by);

  const confirm = async () => {
    if (!action || requestPending.current) return;
    const trimmed = note.trim();
    if (action === 'revision' && !trimmed) { setActionError('A revision reason is required.'); return; }
    requestPending.current = true; setBusy(true); setActionError('');
    try {
      const updated = action === 'revision'
        ? await postEventReportRepository.requestRevision(reportId, trimmed)
        : await postEventReportRepository.approve(reportId, trimmed || null);
      setData((current) => ({ ...current, report: { ...current.report, ...updated } }));
      if (updated.status === 'approved') {
        try {
          const dispatch = await reportAutomationService.loadAndRecover(reportId);
          setAutomation(dispatch.automation);
          setExportNotice(dispatch.dispatchError
            ? 'Report approved, but export could not be started automatically. It remains queued for recovery.'
            : dispatch.dispatched ? 'Report approved. Export started automatically.' : 'Report approved. Export is waiting to start.');
        } catch {
          setExportNotice('Report approved, but export status could not be loaded. The export remains separate from approval.');
        }
      }
      setAction(null); setNote('');
    } catch (reviewError) {
      setActionError(reviewError.message || 'The review action could not be completed.');
    } finally { requestPending.current = false; setBusy(false); }
  };

  const openAttachment = async (attachment) => {
    try {
      const url = await postEventReportRepository.createSignedUrl(attachment.storage_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (attachmentError) { setError(attachmentError.message || 'The attachment could not be opened.'); }
  };

  return <div className="post-report-page report-review-detail-page">
    <PageHeader eyebrow="Event Reporting" title="Post Event Report Review" description="Inspect the submitted report and take a reviewer action." />
    <PostEventReportNav />
    <Link className="review-back-link" to="/dashboard/post-event-report/review"><ArrowLeft size={16} /> Back to Review Queue</Link>
    {loading && <div className="review-queue-state"><Loader2 className="spin" size={20} /> Loading report…</div>}
    {!loading && error && <div className="review-queue-state review-queue-error" role="alert">{error}</div>}
    {!loading && data && form && <>
      <section className="card review-detail-header">
        <div><span>Event</span><strong>{form.eventName}</strong></div><div><span>Chapter</span><strong>{form.chapter || '—'}</strong></div>
        <div><span>Coordinator</span><strong>{form.coordinator}</strong></div><div><span>Submitted by</span><strong>{submitter}</strong></div>
        <div><span>Submitted date</span><strong>{formatDate(data.report.submitted_at)}</strong></div><div><span>Status</span><StatusBadge status={REPORT_STATUS_LABELS[data.report.status] || data.report.status} /></div>
      </section>
      <ReadOnlySection title="General Information" items={[["Event date", formatDate(form.eventDate)], ["Venue", form.venue], ["Event summary", form.summary]]} />
      <ReadOnlySection title="Attendance" items={[["Registered", form.registered], ["Attended", form.attended], ["Children reached", form.children], ["Volunteers involved", form.volunteers], ["Notes", form.attendanceNotes]]} />
      <ReadOnlySection title="Finance" items={[["Approved budget", money(form.budget)], ["Expenses", money(expenses)], ["Remaining", money(Number(form.budget || 0) - expenses)], ["Transactions", data.transactions?.length || 0]]} />
      <ReadOnlySection title="Impact and Documentation" items={[["Key learnings", form.keyLearnings], ["Challenges", form.challenges], ["Community impact", form.communityImpact], ["Recommendations", form.recommendations], ["Satisfaction", form.satisfaction || '—']]} />
      <section className="card review-detail-section"><h2>Attachments</h2>{data.attachments?.length ? <ul className="review-attachment-list">{data.attachments.map((item) => <li key={item.id}><span>{item.file_name}</span><button type="button" className="btn-secondary" onClick={() => openAttachment(item)}><ExternalLink size={15} /> Open</button></li>)}</ul> : <p>No attachments were submitted.</p>}</section>
      <section className="card reviewer-actions-panel"><div><h2>Reviewer Actions</h2><p>{canReview && isOwnReport ? 'You cannot approve a report you submitted. Another authorized reviewer must review this report.' : canReview ? 'Request a revision or approve this submitted report.' : `No reviewer mutation is available while this report is ${REPORT_STATUS_LABELS[data.report.status] || data.report.status}.`}</p>{data.report.revision_reason && <p><strong>Revision reason:</strong> {data.report.revision_reason}</p>}<p><strong>Export status:</strong> {getExportLabel(automation?.status)}</p>{exportNotice && <p role="status">{exportNotice}</p>}</div>{canReview && !isOwnReport && <div className="review-actions"><button type="button" className="btn-secondary" onClick={() => setAction('revision')}>Request revision</button><button type="button" className="btn-primary" onClick={() => setAction('approve')}>Approve report</button></div>}</section>
    </>}
    {action && <ConfirmationModal title={action === 'revision' ? 'Request Report Revision' : 'Approve Post Event Report'} message={action === 'revision' ? 'Explain what the coordinator must revise before resubmitting.' : 'Approve this submitted report and begin the existing export queue lifecycle.'} cancelLabel="Cancel" confirmLabel={action === 'revision' ? 'Request revision' : 'Approve report'} busyLabel="Working…" onCancel={() => { if (!busy) { setAction(null); setNote(''); setActionError(''); } }} onConfirm={confirm} isBusy={busy} role="dialog" tone="primary"><label className="review-note-field"><span>{action === 'revision' ? 'Revision reason *' : 'Reviewer note (optional)'}</span><textarea rows="4" value={note} onChange={(event) => { setNote(event.target.value); setActionError(''); }} disabled={busy} autoFocus />{actionError && <small role="alert">{actionError}</small>}</label></ConfirmationModal>}
  </div>;
}

function ReadOnlySection({ title, items }) {
  return <section className="card review-detail-section"><h2>{title}</h2><dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === '' || value == null ? '—' : value}</dd></div>)}</dl></section>;
}
