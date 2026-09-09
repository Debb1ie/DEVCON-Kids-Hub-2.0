import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';
import { decideEventApplication, listManagedEventApplications } from '../services/eventApplicationService';
import './EventApplicationsPanel.css';

const statuses = ['all', 'pending', 'accepted', 'rejected', 'withdrawn'];

export default function EventApplicationsPanel({ events = [] }) {
  const [chapterId, setChapterId] = useState('all');
  const eligibleEvents = useMemo(
    () => events.filter((event) => chapterId === 'all' || event.chapter_id === chapterId),
    [chapterId, events],
  );
  const [eventId, setEventId] = useState('');
  const selectedEventId = eligibleEvents.some((event) => event.id === eventId) ? eventId : eligibleEvents[0]?.id || '';
  const selectedEvent = eligibleEvents.find((event) => event.id === selectedEventId);
  const [status, setStatus] = useState('all');
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [pendingDecision, setPendingDecision] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const chapters = useMemo(() => {
    const values = new Map();
    events.forEach((event) => {
      if (event.chapter_id) values.set(event.chapter_id, event.chapter || 'Assigned chapter');
    });
    return [...values.entries()];
  }, [events]);

  const refresh = async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try { setApplications(await listManagedEventApplications(selectedEventId)); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    if (!selectedEventId) {
      Promise.resolve().then(() => { if (active) setApplications([]); });
      return () => { active = false; };
    }
    Promise.resolve().then(() => {
      if (active) { setLoading(true); setNotice(null); }
      return listManagedEventApplications(selectedEventId);
    })
      .then((items) => { if (active) setApplications(items); })
      .catch((error) => { if (active) setNotice({ type: 'error', message: error.message }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedEventId]);

  const decide = async () => {
    if (!pendingDecision) return;
    setBusyId(pendingDecision.application.id);
    try {
      await decideEventApplication(pendingDecision.application.id, pendingDecision.decision);
      setNotice({ type: 'success', message: `Application ${pendingDecision.decision === 'pending' ? 'reopened' : pendingDecision.decision}.` });
      setPendingDecision(null);
      await refresh();
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally { setBusyId(null); }
  };

  const visible = applications.filter((application) => status === 'all' || application.status === status);
  const accepted = applications.filter((application) => application.status === 'accepted').length;

  return <section className="card event-applications-panel">
    <div className="event-applications-heading"><div><h3><ClipboardCheck size={20}/> Volunteer Applications</h3><p>Review applications only within your authorized event scope.</p></div>{selectedEvent && <strong>{accepted} / {selectedEvent.volunteer_capacity ?? '∞'} accepted</strong>}</div>
    <div className="event-application-filters">
      <label>Chapter<select value={chapterId} onChange={(event) => { setChapterId(event.target.value); setEventId(''); }}><option value="all">All authorized chapters</option>{chapters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Event<select value={selectedEventId} onChange={(event) => setEventId(event.target.value)}>{eligibleEvents.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((value) => <option key={value} value={value}>{value === 'all' ? 'All statuses' : value}</option>)}</select></label>
    </div>
    {notice && <div className={`event-application-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.message}</div>}
    {loading ? <p className="event-applications-empty">Loading applications…</p> : visible.length === 0 ? <p className="event-applications-empty">No applications match these filters.</p> : <div className="event-applications-list">{visible.map((application) => <article key={application.id}>
      <div><strong>{application.volunteer_name}</strong><span>Applied {new Date(application.created_at).toLocaleDateString()}</span></div><span className={`application-state ${application.status}`}>{application.status}</span>
      <div className="application-review-actions">
        {application.status === 'pending' && <><button disabled={busyId === application.id} onClick={() => setPendingDecision({ application, decision: 'accepted' })}>Accept</button><button className="danger" disabled={busyId === application.id} onClick={() => setPendingDecision({ application, decision: 'rejected' })}>Reject</button></>}
        {application.status === 'rejected' && <button disabled={busyId === application.id} onClick={() => setPendingDecision({ application, decision: 'pending' })}>Reopen</button>}
      </div>
    </article>)}</div>}
    {pendingDecision && <ConfirmationModal title={`${pendingDecision.decision === 'pending' ? 'Reopen' : pendingDecision.decision === 'accepted' ? 'Accept' : 'Reject'} application?`} message={`Confirm this application transition to ${pendingDecision.decision}.`} confirmLabel={pendingDecision.decision === 'pending' ? 'Reopen' : pendingDecision.decision === 'accepted' ? 'Accept' : 'Reject'} onCancel={() => setPendingDecision(null)} onConfirm={decide} isBusy={busyId === pendingDecision.application.id}/>} 
  </section>;
}
