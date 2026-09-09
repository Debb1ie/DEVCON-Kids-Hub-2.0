import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { applyToEvent, listMyEventApplications, listOpenVolunteerEvents, withdrawEventApplication } from '../services/eventApplicationService';
import './VolunteerEvents.css';

export default function VolunteerEvents() {
  const [events, setEvents] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setNotice(null);
    try {
      const [openEvents, ownApplications] = await Promise.all([listOpenVolunteerEvents(), listMyEventApplications()]);
      setEvents(openEvents); setApplications(ownApplications);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([listOpenVolunteerEvents(), listMyEventApplications()])
      .then(([openEvents, ownApplications]) => {
        if (!active) return;
        setEvents(openEvents);
        setApplications(ownApplications);
      })
      .catch((error) => {
        if (active) setNotice({ type: 'error', message: error.message });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);
  const byEvent = useMemo(() => new Map(applications.map((item) => [item.event_id, item])), [applications]);

  const apply = async (eventId) => {
    setBusyId(eventId); setNotice(null);
    try { await applyToEvent(eventId); setNotice({ type: 'success', message: 'Application submitted for review.' }); await load(); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setBusyId(null); }
  };

  const withdraw = async (application) => {
    setBusyId(application.event_id); setNotice(null);
    try { await withdrawEventApplication(application.id); setNotice({ type: 'success', message: 'Pending application withdrawn.' }); await load(); }
    catch (error) { setNotice({ type: 'error', message: error.message }); }
    finally { setBusyId(null); }
  };

  return <div className="volunteer-events-page">
    <header><h1>Open Events</h1><p>Browse published events and apply to volunteer. Coordinators review every application.</p></header>
    {notice && <div className={`event-application-notice ${notice.type}`} role="status">{notice.message}</div>}
    {loading ? <div className="card event-application-state">Loading open events…</div> : events.length === 0 ?
      <div className="card event-application-state"><CalendarDays size={28}/><h2>No open events</h2><p>Check back when applications open.</p><button className="btn-secondary" onClick={load}>Retry</button></div> :
      <div className="volunteer-event-grid">{events.map((event) => { const application = byEvent.get(event.event_id); return <article className="card volunteer-event-card" key={event.event_id}>
        <div className="volunteer-event-heading"><div><h2>{event.title}</h2><span>{event.status}</span></div></div>
        <p>{event.description || 'Event details will be shared by the coordinating chapter.'}</p>
        <div className="volunteer-event-meta"><span><MapPin size={16}/>{event.chapter_name || 'DEVCON Philippines'}</span><span><CalendarDays size={16}/>{event.event_date || 'Date to be announced'}</span><span><Users size={16}/>{event.available_slots} slots available</span></div>
        {application ? <div className="application-status"><strong>Status: {application.status}</strong>{application.status === 'pending' && <button className="btn-secondary" disabled={busyId === event.event_id} onClick={() => withdraw(application)}>Withdraw application</button>}</div> :
          <button className="btn-primary" disabled={busyId === event.event_id} onClick={() => apply(event.event_id)}>{busyId === event.event_id ? 'Submitting…' : 'Apply as Volunteer'}</button>}
      </article>;})}</div>}
  </div>;
}
