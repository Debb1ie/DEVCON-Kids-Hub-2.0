import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppState';
import { CalendarDays, Check, ClipboardCheck, ClipboardList, FolderKanban, FolderOpen, Image as ImageIcon, PencilLine, Plus, Trash2, TrendingUp, Users, Wallet } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import './Events.css';

const createEmptyForm = () => ({
  title: 'Hour of AI',
  type: 'Cycle Program',
  chapter: 'Manila',
  coordinator: 'Program Coordinators',
  event_date: '',
  description: '',
  image_url: '',
  status: 'Scheduled'
});

const createEmptyReport = () => ({
  event: '',
  chapter: '',
  eventDate: '',
  venue: '',
  summary: '',
  registeredParticipants: '',
  attendedParticipants: '',
  volunteers: '',
  attendanceNotes: '',
  budget: '',
  expenses: '',
  receipts: '',
  receiptDetails: '',
  keyLearnings: '',
  challenges: '',
  communityImpact: '',
  recommendations: '',
  satisfaction: ''
});

const EVENTS_PER_PAGE = 6;

const isValidHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const isValidDate = (value) => {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const buildFolderPreview = (title) => {
  const folderName = (title || 'New Event').trim() || 'New Event';
  return {
    folderPath: `Google Drive/DEVCON Kids/Events/${folderName}`,
    assetsPath: `Google Drive/DEVCON Kids/Events/${folderName}/Assets`
  };
};

const mockEventReports = {
  1: {
    eventId: 1,
    eventName: 'Hour of AI',
    chapter: 'Manila',
    date: '2026-06-15',
    attendance: 72,
    expectedParticipants: 85,
    registeredParticipants: 81,
    outcomes: 'Students completed hands-on AI activities, demonstrated confidence in prompt design, and engaged in collaborative problem-solving throughout the program.',
    volunteerInvolvement: '7 volunteers supported facilitation, setup, and mentoring, with two lead instructors guiding the hands-on labs.',
    issues: 'A few learners needed extra help with device setup during the first 20 minutes, and internet connectivity was inconsistent for one station.',
    followUpActions: ['Share accessibility tips for station setup with facilitators', 'Prepare a simplified onboarding checklist for future runs', 'Review device check-in process before the next cycle'],
    status: 'Submitted',
    completion: 88
  },
  2: {
    eventId: 2,
    eventName: 'STEM CodeCamp',
    chapter: 'Cebu',
    date: '2026-07-10',
    attendance: 46,
    expectedParticipants: 55,
    registeredParticipants: 52,
    outcomes: 'The cohort showed strong engagement with robotics fundamentals and completed project-based challenges with minimal instructor intervention.',
    volunteerInvolvement: 'Five volunteers coordinated breakout sessions, supported coding exercises, and provided peer mentoring during final demos.',
    issues: 'One workshop module ran longer than planned, and a few kits required battery replacement before the second session.',
    followUpActions: ['Shift the pacing for the complex robotics module', 'Pre-test hardware kits before event day', 'Add a backup supplies checklist for volunteers'],
    status: 'Draft',
    completion: 64
  }
};

export default function Events() {
  const navigate = useNavigate();
  const location = useLocation();
  const { eventsList, addEvent, updateEvent, deleteEvent, isSuperadmin } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState(createEmptyForm);
  const [initialForm, setInitialForm] = useState(createEmptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingDiscard, setPendingDiscard] = useState(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);
  const [selectedReportEventId, setSelectedReportEventId] = useState(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportForm, setReportForm] = useState(createEmptyReport);
  const [reportInitial, setReportInitial] = useState(createEmptyReport);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!deleteSuccess) return undefined;
    const timer = window.setTimeout(() => setDeleteSuccess(''), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteSuccess]);

  const featuredEvent = useMemo(
    () => eventsList?.find((event) => (event.title || '').toLowerCase().includes('hour of ai')) || eventsList?.[0],
    [eventsList]
  );

  useEffect(() => {
    if (!eventsList || eventsList.length === 0) {
      setSelectedReportEventId(null);
      return;
    }

    if (selectedReportEventId == null || !eventsList.some((event) => Number(event.id) === Number(selectedReportEventId))) {
      setSelectedReportEventId(featuredEvent?.id ?? eventsList[0].id);
    }
  }, [eventsList, featuredEvent, selectedReportEventId]);

  const selectedReport = useMemo(() => {
    const sourceEvent = eventsList?.find((event) => Number(event.id) === Number(selectedReportEventId)) || featuredEvent || eventsList?.[0];
    const fallback = mockEventReports[Number(sourceEvent?.id ?? 1)] || mockEventReports[1];

    const attendance = Number(fallback.attendance ?? 0);
    const expectedParticipants = Number(fallback.expectedParticipants ?? fallback.registeredParticipants ?? 0);
    const registeredParticipants = Number(fallback.registeredParticipants ?? fallback.expectedParticipants ?? 0);
    const attendanceRate = expectedParticipants > 0 ? Math.round((attendance / expectedParticipants) * 100) : 0;

    return {
      eventName: sourceEvent?.title || fallback.eventName,
      chapter: sourceEvent?.chapter || fallback.chapter,
      date: sourceEvent?.event_date || fallback.date,
      attendance,
      expectedParticipants,
      registeredParticipants,
      attendanceRate,
      outcomes: fallback.outcomes,
      volunteerInvolvement: fallback.volunteerInvolvement,
      issues: fallback.issues,
      followUpActions: fallback.followUpActions,
      status: fallback.status,
      completion: Number(fallback.completion ?? 0)
    };
  }, [eventsList, featuredEvent, selectedReportEventId]);

  const filteredEvents = eventsList?.filter((event) => {
    const searchBlob = `${event.title} ${event.type} ${event.chapter} ${event.coordinator} ${event.description}`.toLowerCase();
    return searchBlob.includes(searchTerm.toLowerCase());
  }) || [];
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedEvents = filteredEvents.slice((activePage - 1) * EVENTS_PER_PAGE, activePage * EVENTS_PER_PAGE);

  const openCreateForm = () => {
    const newForm = createEmptyForm();
    setEditingId(null);
    setForm(newForm);
    setInitialForm(newForm);
    setFormError('');
    setFormSuccess('');
    setImagePreviewFailed(false);
    setShowForm(true);
  };

  useEffect(() => {
    if (!location.state?.openCreateForm) {
      return;
    }

    openCreateForm();
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const openEditForm = (event) => {
    setEditingId(event.id);
    const eventForm = {
      title: event.title || '',
      type: event.type || 'Cycle Program',
      chapter: event.chapter || 'Manila',
      coordinator: event.coordinator || 'Program Coordinators',
      event_date: event.event_date || '',
      description: event.description || '',
      image_url: event.image_url || '',
      status: event.status || 'Scheduled'
    };
    setForm(eventForm);
    setInitialForm(eventForm);
    setFormError('');
    setFormSuccess('');
    setImagePreviewFailed(false);
    setShowForm(true);
  };

  const hasUnsavedChanges = showForm && JSON.stringify(form) !== JSON.stringify(initialForm);

  const finishCloseForm = () => {
    setEditingId(null);
    setForm(createEmptyForm());
    setInitialForm(createEmptyForm());
    setFormError('');
    setImagePreviewFailed(false);
    setShowForm(false);
  };

  const closeForm = () => {
    if (isSubmitting) return;
    if (hasUnsavedChanges) {
      setPendingDiscard('event');
      return;
    }
    finishCloseForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.title.trim()) {
      setFormError('Enter an event name.');
      return;
    }

    if (!form.chapter.trim()) {
      setFormError('Enter a chapter or location.');
      return;
    }

    if (!form.coordinator.trim()) {
      setFormError('Enter a coordinator.');
      return;
    }

    if (!isValidDate(form.event_date)) {
      setFormError('Enter a valid event date.');
      return;
    }

    if (form.image_url.trim() && !isValidHttpUrl(form.image_url.trim())) {
      setFormError('Image URL must start with http:// or https://.');
      return;
    }

    setFormError('');
    setFormSuccess('');
    setIsSubmitting(true);
    const folderPreview = buildFolderPreview(form.title);
    const payload = {
      ...form,
      title: form.title.trim(),
      chapter: form.chapter.trim(),
      coordinator: form.coordinator.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim(),
      google_folder_name: form.title.trim(),
      google_folder_path: folderPreview.folderPath,
      google_assets_path: folderPreview.assetsPath,
      google_folder_status: 'Ready for Google Drive sync'
    };

    try {
      if (editingId) {
        await updateEvent(editingId, payload);
        setFormSuccess('Event updated successfully.');
      } else {
        await addEvent(payload);
        setFormSuccess('Event created successfully.');
      }

      setEditingId(null);
      setForm(createEmptyForm());
      setInitialForm(createEmptyForm());
      setImagePreviewFailed(false);
      setShowForm(false);
    } catch (error) {
      console.error('Failed to save event', error);
      setFormError('Unable to save the event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (event) => {
    setDeleteSuccess('');
    setFormSuccess('');
    setPendingDelete(event);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError('');
    setDeletingId(pendingDelete.id);

    try {
      await deleteEvent(pendingDelete.id);
      setDeleteSuccess('Event deleted successfully.');
    } catch (error) {
      console.error('Failed to delete event', error);
      setDeleteError(`Unable to delete "${pendingDelete.title}". Please try again.`);
    } finally {
      setDeletingId(null);
      setPendingDelete(null);
    }
  };

  const openReportForm = () => {
    setReportForm(createEmptyReport());
    setReportInitial(createEmptyReport());
    setReportError('');
    setShowReportForm(true);
  };

  const finishCloseReportForm = () => {
    setReportError('');
    setShowReportForm(false);
  };

  const closeReportForm = () => {
    if (JSON.stringify(reportForm) !== JSON.stringify(reportInitial)) {
      setPendingDiscard('report');
      return;
    }
    finishCloseReportForm();
  };

  const confirmDiscard = () => {
    if (pendingDiscard === 'event') finishCloseForm();
    if (pendingDiscard === 'report') finishCloseReportForm();
    setPendingDiscard(null);
  };

  const updateReportField = (field, value) => {
    setReportError('');
    setReportForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleReportSubmit = (e) => {
    e.preventDefault();

    if (!reportForm.event.trim()) {
      setReportError('Enter the event name.');
      return;
    }
    if (!reportForm.chapter.trim()) {
      setReportError('Enter the chapter.');
      return;
    }
    if (!reportForm.eventDate) {
      setReportError('Select the event date.');
      return;
    }

    setReportError('');
    setReportSuccess('Post-event report submitted successfully.');
    setReportForm(createEmptyReport());
    setReportInitial(createEmptyReport());
    setShowReportForm(false);
  };

  const reportReviewItems = [
    { label: 'Event', value: reportForm.event },
    { label: 'Chapter', value: reportForm.chapter },
    { label: 'Event date', value: reportForm.eventDate },
    { label: 'Venue', value: reportForm.venue },
    { label: 'Event summary', value: reportForm.summary },
    { label: 'Registered participants', value: reportForm.registeredParticipants },
    { label: 'Attended participants', value: reportForm.attendedParticipants },
    { label: 'Volunteers', value: reportForm.volunteers },
    { label: 'Attendance notes', value: reportForm.attendanceNotes },
    { label: 'Budget (PHP)', value: reportForm.budget },
    { label: 'Expenses (PHP)', value: reportForm.expenses },
    { label: 'Receipts (count)', value: reportForm.receipts },
    { label: 'Receipt details', value: reportForm.receiptDetails },
    { label: 'Key learnings', value: reportForm.keyLearnings },
    { label: 'Challenges', value: reportForm.challenges },
    { label: 'Community impact', value: reportForm.communityImpact },
    { label: 'Recommendations', value: reportForm.recommendations },
    { label: 'Satisfaction rating', value: reportForm.satisfaction }
  ];

  return (
    <div className="module-page events-page">
      {pendingDelete && (
        <ConfirmationModal
          title="Delete event?"
          message={`Delete "${pendingDelete.title}"? This action cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          isBusy={deletingId === pendingDelete.id}
        />
      )}
      {pendingDiscard && (
        <ConfirmationModal
          title="Discard changes?"
          message={pendingDiscard === 'event' ? 'You have unsaved event changes.' : 'You have unsaved report changes.'}
          confirmLabel="Discard changes"
          onCancel={() => setPendingDiscard(null)}
          onConfirm={confirmDiscard}
        />
      )}
      {/* Modal Overlay - excludes sidebar */}
      {isSuperadmin && showForm && (
        <div className="event-modal-overlay" onClick={closeForm} />
      )}

      {/* Modal Container */}
      {isSuperadmin && showForm && (
        <div className="event-modal-container">
          <div className="event-modal card">
            <div className="event-form-header">
              <div className="event-modal-header-content">
                <div className="event-modal-header-icon">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <h3>{editingId ? 'Edit Event / CodeCamp' : 'Create Event / CodeCamp'}</h3>
                  {editingId && <p className="editing-event">Editing: {form.title || 'Untitled event'}</p>}
                  <p className="text-muted">The folder path is generated automatically from the event name.</p>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeForm} disabled={isSubmitting} aria-label="Close modal">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="event-form-grid" aria-describedby={formError ? 'event-form-error' : undefined}>
              <div className="event-form-section section-details">
                <div className="event-form-section-header">
                  <span className="event-section-icon"><CalendarDays size={15} /></span>
                  <h4>Event Details</h4>
                </div>
                <div className="event-form-fields">
                  <div className="form-group">
                    <label htmlFor="event-name">Event Name</label>
                    <input id="event-name" className="border-input" type="text" value={form.title} onChange={(e) => { setFormError(''); setForm({ ...form, title: e.target.value }); }} disabled={isSubmitting} aria-invalid={formError === 'Enter an event name.'} required />
                  </div>
                  <div className="form-group">
                    <label htmlFor="event-type">Type</label>
                    <select id="event-type" className="border-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} disabled={isSubmitting}>
                      <option>Cycle Program</option>
                      <option>CodeCamp</option>
                      <option>Workshop</option>
                      <option>Community Event</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="event-chapter">Chapter</label>
                    <input id="event-chapter" className="border-input" type="text" value={form.chapter} onChange={(e) => { setFormError(''); setForm({ ...form, chapter: e.target.value }); }} disabled={isSubmitting} aria-invalid={formError === 'Enter a chapter or location.'} required />
                  </div>
                  <div className="form-group">
                    <label htmlFor="event-coordinator">Coordinator</label>
                    <input id="event-coordinator" className="border-input" type="text" value={form.coordinator} onChange={(e) => { setFormError(''); setForm({ ...form, coordinator: e.target.value }); }} disabled={isSubmitting} aria-invalid={formError === 'Enter a coordinator.'} required />
                  </div>
                </div>
              </div>
              <div className="event-form-section section-schedule">
                <div className="event-form-section-header">
                  <span className="event-section-icon"><CalendarDays size={15} /></span>
                  <h4>Schedule &amp; Status</h4>
                </div>
                <div className="event-form-fields">
                  <div className="form-group">
                    <label htmlFor="event-date">Event Date <span className="optional-label">Optional</span></label>
                    <input id="event-date" type="date" className="border-input" value={form.event_date} onChange={(e) => { setFormError(''); setForm({ ...form, event_date: e.target.value }); }} disabled={isSubmitting} aria-invalid={formError === 'Enter a valid event date.'} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="event-status">Status</label>
                    <select id="event-status" className="border-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} disabled={isSubmitting}>
                      <option>Scheduled</option>
                      <option>Ongoing</option>
                      <option>Completed</option>
                      <option>Draft</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="event-form-section section-content">
                <div className="event-form-section-header">
                  <span className="event-section-icon"><ImageIcon size={15} /></span>
                  <h4>Content</h4>
                </div>
                <div className="event-form-fields">
                  <div className="form-group form-group-wide">
                    <label htmlFor="event-image-url">Image URL <span className="optional-label">Optional</span></label>
                    <input id="event-image-url" className="border-input" type="url" placeholder="https://example.com/event-image.jpg" value={form.image_url} onChange={(e) => { setFormError(''); setImagePreviewFailed(false); setForm({ ...form, image_url: e.target.value }); }} disabled={isSubmitting} aria-describedby="event-image-help" aria-invalid={formError === 'Image URL must start with http:// or https://.'} />
                    <small id="event-image-help">Use a direct http:// or https:// image link.</small>
                  </div>
                  <div className="event-image-preview" aria-live="polite">
                    {form.image_url.trim() && isValidHttpUrl(form.image_url.trim()) && !imagePreviewFailed ? (
                      <img src={form.image_url.trim()} alt="Event image preview" onError={() => setImagePreviewFailed(true)} />
                    ) : (
                      <div className="event-image-preview-placeholder">
                        <ImageIcon size={24} />
                        <span>{imagePreviewFailed ? 'Image preview unavailable' : 'Image preview'}</span>
                      </div>
                    )}
                  </div>
                  <div className="form-group form-group-wide">
                    <label htmlFor="event-description">Description / Caption <span className="optional-label">Optional</span></label>
                    <textarea id="event-description" className="border-input" rows="4" placeholder="Briefly describe the event, its purpose, and target participants." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={isSubmitting} aria-describedby="event-description-help event-description-count" />
                    <small id="event-description-help">Briefly describe the event, its purpose, and target participants.</small>
                    <span id="event-description-count" className="character-count">{form.description.length} characters</span>
                  </div>
                </div>
              </div>
              <div className="event-form-section section-folders">
                <div className="event-section-heading">
                  <div className="event-form-section-header">
                    <span className="event-section-icon"><FolderKanban size={15} /></span>
                    <h4>Google Drive Preview</h4>
                  </div>
                  <span>Generated automatically</span>
                </div>
                <div className="folder-preview">
                  <div>
                    <span>Google folder</span>
                    <strong>{buildFolderPreview(form.title).folderPath}</strong>
                  </div>
                  <div>
                    <span>Assets folder</span>
                    <strong>{buildFolderPreview(form.title).assetsPath}</strong>
                  </div>
                </div>
              </div>
              <div className="event-form-actions">
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  <Check size={16} />
                  {isSubmitting ? 'Saving...' : editingId ? 'Update Event' : 'Save Event'}
                </button>
                <button type="button" className="btn-secondary" onClick={closeForm} disabled={isSubmitting}>Cancel</button>
              </div>
              {formError && <p id="event-form-error" className="event-feedback error form-error" role="alert">{formError}</p>}
            </form>
          </div>
        </div>
      )}

      {/* Post-Event Report collection modal */}
      {isSuperadmin && showReportForm && (
        <div className="event-modal-overlay" onClick={closeReportForm} />
      )}
      {isSuperadmin && showReportForm && (
        <div className="event-modal-container">
          <div className="event-modal card">
            <div className="event-form-header">
              <div className="event-modal-header-content">
                <div className="event-modal-header-icon">
                  <ClipboardList size={18} />
                </div>
                <div>
                  <h3>Post-Event Report</h3>
                  <p className="text-muted">Record the event's outcomes, finances, and impact.</p>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeReportForm} aria-label="Close modal">✕</button>
            </div>

            <form onSubmit={handleReportSubmit} noValidate className="report-form" aria-describedby={reportError ? 'report-form-error' : undefined}>
              <div className="report-form-grid">
                <section className="report-form-section">
                  <div className="event-form-section-header">
                    <span className="event-section-icon"><CalendarDays size={15} /></span>
                    <h4>General Event Information</h4>
                  </div>
                  <div className="report-form-fields">
                    <div className="report-form-group">
                      <label htmlFor="report-event">Event <span aria-hidden="true">*</span></label>
                      <input id="report-event" className="border-input" type="text" placeholder="e.g. Hour of AI" value={reportForm.event} onChange={(e) => updateReportField('event', e.target.value)} aria-invalid={reportError === 'Enter the event name.'} required />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-chapter">Chapter <span aria-hidden="true">*</span></label>
                      <input id="report-chapter" className="border-input" type="text" placeholder="e.g. Manila" value={reportForm.chapter} onChange={(e) => updateReportField('chapter', e.target.value)} aria-invalid={reportError === 'Enter the chapter.'} required />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-event-date">Event date <span aria-hidden="true">*</span></label>
                      <input id="report-event-date" className="border-input" type="date" value={reportForm.eventDate} onChange={(e) => updateReportField('eventDate', e.target.value)} aria-invalid={reportError === 'Select the event date.'} required />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-venue">Venue</label>
                      <input id="report-venue" className="border-input" type="text" placeholder="e.g. Community hall or online" value={reportForm.venue} onChange={(e) => updateReportField('venue', e.target.value)} />
                    </div>
                    <div className="report-form-group report-form-group-wide">
                      <label htmlFor="report-summary">Event summary</label>
                      <textarea id="report-summary" className="border-input" rows="3" placeholder="Briefly describe what the event was about and its overall flow." value={reportForm.summary} onChange={(e) => updateReportField('summary', e.target.value)} />
                    </div>
                  </div>
                </section>

                <section className="report-form-section">
                  <div className="event-form-section-header">
                    <span className="event-section-icon"><Users size={15} /></span>
                    <h4>Attendance</h4>
                  </div>
                  <div className="report-form-fields">
                    <div className="report-form-group">
                      <label htmlFor="report-registered">Registered participants</label>
                      <input id="report-registered" className="border-input" type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={reportForm.registeredParticipants} onChange={(e) => updateReportField('registeredParticipants', e.target.value)} />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-attended">Attended participants</label>
                      <input id="report-attended" className="border-input" type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={reportForm.attendedParticipants} onChange={(e) => updateReportField('attendedParticipants', e.target.value)} />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-volunteers">Volunteers</label>
                      <input id="report-volunteers" className="border-input" type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={reportForm.volunteers} onChange={(e) => updateReportField('volunteers', e.target.value)} />
                    </div>
                    <div className="report-form-group report-form-group-wide">
                      <label htmlFor="report-attendance-notes">Attendance notes</label>
                      <textarea id="report-attendance-notes" className="border-input" rows="3" placeholder="e.g. Walk-ins, no-shows, or scheduling notes." value={reportForm.attendanceNotes} onChange={(e) => updateReportField('attendanceNotes', e.target.value)} />
                    </div>
                  </div>
                </section>

                <section className="report-form-section">
                  <div className="event-form-section-header">
                    <span className="event-section-icon"><Wallet size={15} /></span>
                    <h4>Finance & Receipts</h4>
                  </div>
                  <div className="report-form-fields">
                    <div className="report-form-group">
                      <label htmlFor="report-budget">Budget (PHP)</label>
                      <input id="report-budget" className="border-input" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={reportForm.budget} onChange={(e) => updateReportField('budget', e.target.value)} />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-expenses">Expenses (PHP)</label>
                      <input id="report-expenses" className="border-input" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={reportForm.expenses} onChange={(e) => updateReportField('expenses', e.target.value)} />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-receipts">Receipts (count)</label>
                      <input id="report-receipts" className="border-input" type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={reportForm.receipts} onChange={(e) => updateReportField('receipts', e.target.value)} />
                    </div>
                    <div className="report-form-group report-form-group-wide">
                      <label htmlFor="report-receipt-details">Receipt details</label>
                      <textarea id="report-receipt-details" className="border-input" rows="3" placeholder="e.g. Supplier, item, and amount for each receipt." value={reportForm.receiptDetails} onChange={(e) => updateReportField('receiptDetails', e.target.value)} />
                    </div>
                  </div>
                </section>

                <section className="report-form-section">
                  <div className="event-form-section-header">
                    <span className="event-section-icon"><TrendingUp size={15} /></span>
                    <h4>Impact & Evaluation</h4>
                  </div>
                  <div className="report-form-fields">
                    <div className="report-form-group">
                      <label htmlFor="report-learnings">Key learnings</label>
                      <textarea id="report-learnings" className="border-input" rows="3" placeholder="What did participants or the team take away?" value={reportForm.keyLearnings} onChange={(e) => updateReportField('keyLearnings', e.target.value)} />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-challenges">Challenges</label>
                      <textarea id="report-challenges" className="border-input" rows="3" placeholder="Problems encountered during the event." value={reportForm.challenges} onChange={(e) => updateReportField('challenges', e.target.value)} />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-impact">Community impact</label>
                      <textarea id="report-impact" className="border-input" rows="3" placeholder="How the event benefited the community." value={reportForm.communityImpact} onChange={(e) => updateReportField('communityImpact', e.target.value)} />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-recommendations">Recommendations</label>
                      <textarea id="report-recommendations" className="border-input" rows="3" placeholder="Suggested improvements for future runs." value={reportForm.recommendations} onChange={(e) => updateReportField('recommendations', e.target.value)} />
                    </div>
                    <div className="report-form-group">
                      <label htmlFor="report-satisfaction">Satisfaction / evaluation</label>
                      <select id="report-satisfaction" className="border-input" value={reportForm.satisfaction} onChange={(e) => updateReportField('satisfaction', e.target.value)}>
                        <option value="">Select rating (1–5)</option>
                        <option value="1">1 – Very dissatisfied</option>
                        <option value="2">2 – Dissatisfied</option>
                        <option value="3">3 – Neutral</option>
                        <option value="4">4 – Satisfied</option>
                        <option value="5">5 – Very satisfied</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="report-form-section">
                  <div className="event-form-section-header">
                    <span className="event-section-icon"><ClipboardCheck size={15} /></span>
                    <h4>Review & Submit</h4>
                  </div>
                  <p className="text-muted report-review-intro">Review the information below before submitting the report.</p>
                  <dl className="report-review-list">
                    {reportReviewItems.map((item) => (
                      <div key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>{item.value ? item.value : <span className="report-review-empty">Not provided</span>}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="event-form-actions report-form-actions">
                    <button type="button" className="btn-secondary" onClick={closeReportForm}>Cancel</button>
                    <button type="submit" className="btn-primary"><Check size={16} /> Submit Report</button>
                  </div>
                </section>
              </div>

              {reportError && <p id="report-form-error" className="event-feedback error form-error" role="alert">{reportError}</p>}
            </form>
          </div>
        </div>
      )}

      <div className="module-header">
        <div className="module-title">
          <div className="module-icon" style={{ background: 'var(--gradient-purple)', color: 'white' }}>
            <CalendarDays size={24} />
          </div>
          <div>
            <h2>Events & CodeCamps</h2>
            <p className="text-muted">Coordinate cycle programs, including Hour of AI, and generate Google Drive folder blueprints for each event.</p>
          </div>
        </div>
        {isSuperadmin && (
          <button className="btn-primary" onClick={openCreateForm} type="button">
            <Plus size={20} />
            Create Event
          </button>
        )}
      </div>

      {featuredEvent && (
        <div className="card featured-event-card animate-fade-in">
          <div className="featured-event-copy">
            <div className="featured-pill">Main Course Solution</div>
            <h3>Hour of AI is the flagship cycle program for kids</h3>
            <p>
              Coordinators can create, track, and package every Hour of AI run here, with its own image holder,
              captions, and Google Drive folder structure for admin and coordinator visibility.
            </p>
            <div className="featured-meta">
              <span><FolderOpen size={14} /> {featuredEvent.google_folder_name || 'Hour of AI'}</span>
              <span><FolderKanban size={14} /> {featuredEvent.google_folder_status || 'Ready for Google Drive sync'}</span>
            </div>
          </div>
          <div className="featured-event-image">
            {featuredEvent.image_url ? (
              <img src={featuredEvent.image_url} alt={featuredEvent.title} />
            ) : (
              <div className="featured-placeholder">
                <ImageIcon size={42} />
                <span>Event image holder</span>
              </div>
            )}
          </div>
        </div>
      )}

      {eventsList && eventsList.length > 0 && (
        <section className="card event-report-shell">
          <div className="event-report-header">
            <div className="module-title report-title">
              <div className="module-icon" style={{ background: 'var(--gradient-purple)', color: 'white' }}>
                <CalendarDays size={20} />
              </div>
              <div>
                <h3>Post-Event Reporting</h3>
                <p className="text-muted">Quick review summary for event outcomes and follow-up actions.</p>
              </div>
            </div>

            <div className="report-select-wrap">
              <label htmlFor="report-event-select">Selected event</label>
              <div className="report-event-select-wrapper">
                <CalendarDays size={16} className="report-event-icon" aria-hidden="true" />
                <select
                  id="report-event-select"
                  className="report-event-select"
                  value={selectedReportEventId ?? ''}
                  onChange={(e) => setSelectedReportEventId(e.target.value)}
                >
                  {eventsList.map((event) => (
                    <option key={event.id} value={event.id}>{event.title}</option>
                  ))}
                </select>
              </div>
            </div>
            {isSuperadmin && (
              <button type="button" className="btn-primary" onClick={openReportForm}>
                <Plus size={18} />
                New Report
              </button>
            )}
          </div>

          <div className="report-summary-grid">
            <div className="report-summary-card">
              <span className="report-label">Event name</span>
              <strong>{selectedReport.eventName}</strong>
            </div>
            <div className="report-summary-card">
              <span className="report-label">Chapter</span>
              <strong>{selectedReport.chapter}</strong>
            </div>
            <div className="report-summary-card">
              <span className="report-label">Date</span>
              <strong>{selectedReport.date || 'Date pending'}</strong>
            </div>
            <div className="report-summary-card">
              <span className="report-label">Attendance</span>
              <strong>{selectedReport.attendance}</strong>
            </div>
            <div className="report-summary-card">
              <span className="report-label">Expected / Registered</span>
              <strong>{selectedReport.expectedParticipants} / {selectedReport.registeredParticipants}</strong>
            </div>
            <div className="report-summary-card">
              <span className="report-label">Attendance rate</span>
              <strong>{selectedReport.attendanceRate}%</strong>
            </div>
          </div>

          <div className="report-detail-grid">
            <div className="report-panel">
              <h4>Outcomes / Impact</h4>
              <p>{selectedReport.outcomes}</p>
            </div>
            <div className="report-panel">
              <h4>Volunteer involvement</h4>
              <p>{selectedReport.volunteerInvolvement}</p>
            </div>
            <div className="report-panel">
              <h4>Issues / challenges</h4>
              <p>{selectedReport.issues}</p>
            </div>
            <div className="report-panel">
              <h4>Follow-up actions</h4>
              <ul>
                {selectedReport.followUpActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="report-status-row">
            <div className="report-status-card">
              <span className="report-label">Completion</span>
              <strong>{selectedReport.completion}%</strong>
            </div>
            <div className="report-status-card status-card">
              <span className="report-label">Report status</span>
              <strong className={`report-status-badge report-status-${selectedReport.status.toLowerCase()}`}>{selectedReport.status}</strong>
            </div>
          </div>
        </section>
      )}

      {formSuccess && <div className="event-feedback success" role="status">{formSuccess}</div>}
      {deleteSuccess && <div className="event-feedback success" role="status">{deleteSuccess}</div>}
      {deleteError && <div className="event-feedback error" role="alert">{deleteError}</div>}
      {reportSuccess && <div className="event-feedback success" role="status">{reportSuccess}</div>}

      <div className="card list-container">
        <div className="list-toolbar event-toolbar">
          <div className="event-search-group">
            <label className="sr-only" htmlFor="event-search">Search events</label>
            <div className="search-bar border-input">
            <FolderKanban size={18} className="search-icon" />
            <input
              id="event-search"
              type="text"
              placeholder="Search events, coordinators, or folders..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
            </div>
            {searchTerm && <button type="button" className="clear-search-button" onClick={() => { setSearchTerm(''); setCurrentPage(1); }}>Clear Search</button>}
          </div>
          <p className="event-result-count" aria-live="polite">{searchTerm ? `${filteredEvents.length} of ${eventsList?.length || 0} events` : `${eventsList?.length || 0} events`}</p>
        </div>

        <div className="events-grid">
          {paginatedEvents.map((event) => (
            <article className="event-card" key={event.id}>
              <div className="event-card-image">
                {event.image_url ? (
                  <img src={event.image_url} alt={event.title} />
                ) : (
                  <div className="event-placeholder">
                    <ImageIcon size={34} color="#9ca3af" />
                    <span>Image holder</span>
                  </div>
                )}
                <span className={`event-status-pill status-${(event.status || 'Draft').toLowerCase()}`}>{event.status || 'Draft'}</span>
              </div>

              <div className="event-card-body">
                <div className="event-card-headline">
                  <div>
                    <p className="event-type">{event.type}</p>
                    <h3>{event.title}</h3>
                  </div>
                  {(event.title || '').toLowerCase().includes('hour of ai') && (
                    <span className="hour-of-ai-chip">Highlighted</span>
                  )}
                </div>

                <p className="event-description">{event.description}</p>

                <div className="event-meta-list">
                  <span><CalendarDays size={14} /> {event.event_date || 'Date pending'}</span>
                  <span><FolderOpen size={14} /> {event.google_folder_name || event.title}</span>
                  <span><FolderKanban size={14} /> {event.chapter}</span>
                  <span><PencilLine size={14} /> {event.coordinator}</span>
                </div>

                <div className="folder-preview compact">
                  <div>
                    <span>Folder</span>
                    <strong>{event.google_folder_path}</strong>
                  </div>
                  <div>
                    <span>Assets</span>
                    <strong>{event.google_assets_path}</strong>
                  </div>
                </div>

                {isSuperadmin && (
                  <div className="event-actions">
                    <button type="button" className="btn-secondary small-action" onClick={() => openEditForm(event)} disabled={deletingId === event.id}>
                      <PencilLine size={16} />
                      Edit
                    </button>
                    <button type="button" className="btn-secondary small-action danger" onClick={() => handleDelete(event)} disabled={deletingId === event.id}>
                      <Trash2 size={16} />
                      {deletingId === event.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}

          {filteredEvents.length === 0 && (
            <div className="empty-state card" style={{ gridColumn: '1 / -1' }}>
              <CalendarDays size={48} color="#9ca3af" style={{ margin: '0 auto 1rem' }} />
              <h3>{searchTerm ? 'No events match your search.' : 'No events have been created yet.'}</h3>
              <p className="text-muted">{searchTerm ? 'Try another keyword or clear your search.' : 'Create Hour of AI or another codecamp to generate its folder blueprint.'}</p>
              {searchTerm && <button type="button" className="btn-secondary" onClick={() => setSearchTerm('')}>Clear Search</button>}
            </div>
          )}
        </div>
        {filteredEvents.length > 0 && (
          <nav className="event-pagination" aria-label="Event pagination">
            <button type="button" className="event-pagination-button" onClick={() => setCurrentPage(activePage - 1)} disabled={activePage === 1}>Previous</button>
            <div className="event-pagination-pages">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button key={page} type="button" className={`event-pagination-page ${page === activePage ? 'active' : ''}`} onClick={() => setCurrentPage(page)} aria-current={page === activePage ? 'page' : undefined}>{page}</button>
              ))}
            </div>
            <button type="button" className="event-pagination-button" onClick={() => setCurrentPage(activePage + 1)} disabled={activePage === totalPages}>Next</button>
          </nav>
        )}
      </div>
    </div>
  );
}
