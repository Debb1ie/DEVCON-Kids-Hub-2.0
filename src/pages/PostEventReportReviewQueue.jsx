import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSearch, Loader2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import PostEventReportNav from '../components/PostEventReportNav';
import StatusBadge from '../components/StatusBadge';
import { postEventReportRepository } from '../services/postEventReportService';
import { filterReviewQueue, getExportLabel, prioritizeReviewQueue, REPORT_STATUS_LABELS } from '../services/postEventReportQueue';
import './PostEventReport.css';
import './PostEventReportReviewQueue.css';

const formatDate = (value) => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value)) : '—';

export default function PostEventReportReviewQueue() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('submitted');
  const [chapter, setChapter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    postEventReportRepository.listReviewQueue()
      .then((rows) => { if (active) setReports(prioritizeReviewQueue(rows)); })
      .catch((loadError) => { if (active) setError(loadError.message || 'The review queue could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const chapters = useMemo(() => [...new Set(reports.map((report) => report.chapter).filter(Boolean))].sort(), [reports]);
  const visible = useMemo(() => filterReviewQueue(reports, { status, chapter, search }), [reports, status, chapter, search]);
  const counts = useMemo(() => ({
    submitted: reports.filter((report) => report.status === 'submitted').length,
    needs_revision: reports.filter((report) => report.status === 'needs_revision').length,
    approved: reports.filter((report) => report.status === 'approved').length,
    export_failed: reports.filter((report) => report.exportStatus === 'failed').length,
  }), [reports]);
  const review = (reportId) => navigate(`/dashboard/post-event-report/review/${encodeURIComponent(reportId)}`);

  return <div className="post-report-page report-review-queue-page">
    <PageHeader eyebrow="Event Reporting" title="Post Event Report Review Queue" description="Review submitted event reports and monitor approval and export status." />
    <PostEventReportNav />
    <section className="review-queue-counts" aria-label="Report review summary">
      <span><strong>{counts.submitted}</strong>Awaiting Review</span>
      <span><strong>{counts.needs_revision}</strong>Needs Revision</span>
      <span><strong>{counts.approved}</strong>Approved</span>
      <span><strong>{counts.export_failed}</strong>Export Failed</span>
    </section>
    <section className="review-queue-filters card" aria-label="Review queue filters">
      <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="submitted">Submitted</option><option value="all">All statuses</option>{Object.entries(REPORT_STATUS_LABELS).filter(([key]) => key !== 'submitted').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span>Chapter</span><select value={chapter} onChange={(event) => setChapter(event.target.value)}><option value="all">All chapters</option>{chapters.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label className="review-queue-search"><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Event or submitter" /></label>
    </section>
    {loading && <div className="review-queue-state"><Loader2 className="spin" size={20} /> Loading reports…</div>}
    {!loading && error && <div className="review-queue-state review-queue-error" role="alert">{error}</div>}
    {!loading && !error && visible.length === 0 && <div className="review-queue-state"><FileSearch size={28} /><strong>No reports are waiting for review.</strong><span>Submitted Post Event Reports will appear here when they are ready for approval.</span></div>}
    {!loading && !error && visible.length > 0 && <>
      <div className="review-queue-table-wrap card">
        <table className="review-queue-table"><thead><tr><th>Event</th><th>Chapter</th><th>Submitted by</th><th>Coordinator</th><th>Event date</th><th>Submitted</th><th>Status</th><th>Export</th><th>Last updated</th><th>Action</th></tr></thead><tbody>{visible.map((report) => <tr key={report.id}><td>{report.eventName}</td><td>{report.chapter || '—'}</td><td>{report.submitterName}</td><td>{report.coordinatorName || '—'}</td><td>{formatDate(report.eventDate)}</td><td>{formatDate(report.submittedAt)}</td><td><StatusBadge status={REPORT_STATUS_LABELS[report.status] || report.status} /></td><td><StatusBadge status={getExportLabel(report.exportStatus)} /></td><td>{formatDate(report.updatedAt)}</td><td><button type="button" className="btn-secondary" onClick={() => review(report.id)}>Review</button></td></tr>)}</tbody></table>
      </div>
      <div className="review-queue-cards">{visible.map((report) => <article key={report.id} className="card"><div><strong>{report.eventName}</strong><StatusBadge status={REPORT_STATUS_LABELS[report.status] || report.status} /></div><dl><div><dt>Chapter</dt><dd>{report.chapter || '—'}</dd></div><div><dt>Submitted by</dt><dd>{report.submitterName}</dd></div><div><dt>Coordinator</dt><dd>{report.coordinatorName || '—'}</dd></div><div><dt>Event date</dt><dd>{formatDate(report.eventDate)}</dd></div><div><dt>Submitted</dt><dd>{formatDate(report.submittedAt)}</dd></div><div><dt>Export</dt><dd><StatusBadge status={getExportLabel(report.exportStatus)} /></dd></div></dl><button type="button" className="btn-primary" onClick={() => review(report.id)}>Review report</button></article>)}</div>
    </>}
  </div>;
}
