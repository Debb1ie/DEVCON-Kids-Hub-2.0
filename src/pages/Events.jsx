import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppState';
import { canPerform } from '../auth/permissions';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ClipboardCheck, ClipboardList, FolderKanban, FolderOpen, Image as ImageIcon, PencilLine, Plus, Trash2, TrendingUp, UploadCloud, Users, Wallet, X } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import EventApplicationsPanel from '../components/EventApplicationsPanel';
import ErrorSummary from '../components/ErrorSummary';
import InlineAlert from '../components/InlineAlert';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { getEventErrorMessage, getEventValidationIssue, isUuid, isValidIsoDate, resolveCoordinatorSelection, validateEventImage } from '../services/eventService';
import { advanceEventEditor, EVENT_CREATE_SUBMIT, isIntentionalEventSubmit, shouldPreventImplicitEventSubmit } from '../utils/eventEditorSubmission';
import { createValidationError, createValidationFocusRequest, scheduleValidationFocus } from '../utils/validationFocus';
import './Events.css';

const createEmptyForm = () => ({
  title: 'Hour of AI',
  type: 'Cycle Program',
  chapter_id: '',
  chapter: '',
  coordinator_user_id: '',
  coordinator: '',
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

export default function Events() {
  const navigate = useNavigate();
  const location = useLocation();
  const { eventsList, chapters, listEligibleEventCoordinators, addEvent, updateEvent, uploadEventImage, deleteEvent, roleKey, user } = useApp();
  const permissionContext = (event) => ({ actorUserId: user?.id, actorChapterId: user?.chapterId, event, targetChapterId: event?.chapter_id });
  const canCreateEvent = canPerform(roleKey, 'event.create', { actorChapterId: user?.chapterId, targetChapterId: user?.chapterId });
  const canEditEvent = (event) => canPerform(roleKey, 'event.update', permissionContext(event));
  const canDeleteEvent = (event) => canPerform(roleKey, 'event.delete', permissionContext(event));
  const canEditReport = (event) => canPerform(roleKey, 'report.edit', permissionContext(event));
  const assignableChapters = (chapters || []).filter((chapter) => chapter.status !== 'inactive'
    && (['super_admin', 'admin'].includes(roleKey) || chapter.id === user?.chapterId));
  const scopedChapterName = (chapters || []).find((chapter) => chapter.id === user?.chapterId)?.name;
  const [showForm, setShowForm] = useState(() => Boolean(location.state?.openCreateForm && canCreateEvent));
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState(createEmptyForm);
  const [initialForm, setInitialForm] = useState(createEmptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingDiscard, setPendingDiscard] = useState(null);
  const [formError, setFormError] = useState('');
  const [eligibleCoordinators, setEligibleCoordinators] = useState([]);
  const [coordinatorChapterId, setCoordinatorChapterId] = useState('');
  const [coordinatorsLoading, setCoordinatorsLoading] = useState(false);
  const [coordinatorsError, setCoordinatorsError] = useState('');
  const [coordinatorNotice, setCoordinatorNotice] = useState('');
  const coordinatorRequestRef = useRef(0);
  const submissionLockRef = useRef(false);
  const validationFocusRequestRef = useRef(0);
  const validationFocusCancelRef = useRef(null);
  const [formSuccess, setFormSuccess] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState('');
  const [selectedReportEventId] = useState(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportForm, setReportForm] = useState(createEmptyReport);
  const [reportInitial, setReportInitial] = useState(createEmptyReport);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editorStep, setEditorStep] = useState(0);
  const [validationErrors, setValidationErrors] = useState([]);
  const [pendingValidationFocus, setPendingValidationFocus] = useState(null);
  const [imageUploadState, setImageUploadState] = useState('idle');

  useEffect(() => {
    if (!deleteSuccess) return undefined;
    const timer = window.setTimeout(() => setDeleteSuccess(''), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteSuccess]);

  const loadCoordinators = async (chapterId, selectedCoordinatorId = '') => {
    const requestId = coordinatorRequestRef.current + 1;
    coordinatorRequestRef.current = requestId;
    setEligibleCoordinators([]);
    setCoordinatorChapterId('');

    if (!chapterId) {
      setCoordinatorsError('');
      setCoordinatorsLoading(false);
      return;
    }

    setCoordinatorsLoading(true);
    setCoordinatorsError('');
    try {
      const rows = await listEligibleEventCoordinators(chapterId);
      if (coordinatorRequestRef.current !== requestId) return;
      setEligibleCoordinators(rows);
      setCoordinatorChapterId(chapterId);
      if (selectedCoordinatorId && !rows.some((row) => row.user_id === selectedCoordinatorId)) {
        setForm((current) => ({ ...current, coordinator_user_id: '', coordinator: '' }));
      }
    } catch {
      if (coordinatorRequestRef.current !== requestId) return;
      setEligibleCoordinators([]);
      setCoordinatorChapterId('');
      setCoordinatorsError('Unable to load eligible Event Coordinators for this chapter.');
    } finally {
      if (coordinatorRequestRef.current === requestId) setCoordinatorsLoading(false);
    }
  };

  const featuredEvent = useMemo(
    () => eventsList?.find((event) => (event.title || '').toLowerCase().includes('hour of ai')) || eventsList?.[0],
    [eventsList]
  );

  const effectiveReportEventId = eventsList?.some((event) => Number(event.id) === Number(selectedReportEventId))
    ? selectedReportEventId
    : featuredEvent?.id ?? eventsList?.[0]?.id ?? null;

  const filteredEvents = eventsList?.filter((event) => {
    const searchBlob = `${event.title} ${event.type} ${event.chapter} ${event.coordinator} ${event.description}`.toLowerCase();
    return searchBlob.includes(searchTerm.toLowerCase());
  }) || [];
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / EVENTS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedEvents = filteredEvents.slice((activePage - 1) * EVENTS_PER_PAGE, activePage * EVENTS_PER_PAGE);
  const selectedCoordinatorOption = resolveCoordinatorSelection({
    chapterId: form.chapter_id,
    directoryChapterId: coordinatorChapterId,
    coordinatorUserId: form.coordinator_user_id,
    coordinators: eligibleCoordinators,
  });

  const openCreateForm = () => {
    const ownChapter = assignableChapters.find((chapter) => chapter.id === user?.chapterId);
    const newForm = { ...createEmptyForm(), chapter_id: ownChapter?.id || '', chapter: ownChapter?.name || '' };
    setEditingId(null);
    setForm(newForm);
    setInitialForm(newForm);
    setFormError('');
    setFormSuccess('');
    setEditorStep(0);
    setValidationErrors([]);
    setPendingValidationFocus(null);
    setImageUploadState('idle');
    setImagePreviewFailed(false);
    if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
    setSelectedImageFile(null);
    setSelectedImagePreview('');
    setShowForm(true);
    void loadCoordinators(newForm.chapter_id);
  };

  useEffect(() => {
    if (!location.state?.openCreateForm) {
      return;
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const openEditForm = (event) => {
    setEditingId(event.id);
    const eventForm = {
      title: event.title || '',
      type: event.type || 'Cycle Program',
      chapter_id: event.chapter_id || '',
      chapter: event.chapter || 'Manila',
      coordinator_user_id: event.coordinator_user_id || '',
      coordinator: event.coordinator || '',
      event_date: event.event_date || '',
      description: event.description || '',
      image_url: event.image_fallback_url ?? event.image_url ?? '',
      status: event.status || 'Scheduled'
    };
    setForm(eventForm);
    setInitialForm(eventForm);
    setFormError('');
    setFormSuccess('');
    setEditorStep(0);
    setValidationErrors([]);
    setPendingValidationFocus(null);
    setImageUploadState('idle');
    setImagePreviewFailed(false);
    if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
    setSelectedImageFile(null);
    setSelectedImagePreview('');
    setShowForm(true);
    void loadCoordinators(eventForm.chapter_id, eventForm.coordinator_user_id);
  };

  const hasUnsavedChanges = showForm && JSON.stringify(form) !== JSON.stringify(initialForm);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  const finishCloseForm = () => {
    submissionLockRef.current = false;
    validationFocusRequestRef.current += 1;
    validationFocusCancelRef.current?.();
    validationFocusCancelRef.current = null;
    if (window.location.hash.startsWith('#event-')) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
    setEditingId(null);
    setForm(createEmptyForm());
    setInitialForm(createEmptyForm());
    setFormError('');
    setValidationErrors([]);
    setPendingValidationFocus(null);
    setEditorStep(0);
    setImageUploadState('idle');
    setImagePreviewFailed(false);
    if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
    setSelectedImageFile(null);
    setSelectedImagePreview('');
    setEligibleCoordinators([]);
    setCoordinatorChapterId('');
    setCoordinatorNotice('');
    setCoordinatorsError('');
    setShowForm(false);
  };

  const handleEventImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      validateEventImage(file);
      if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
      setSelectedImageFile(file);
      setSelectedImagePreview(URL.createObjectURL(file));
      setImageUploadState('staged');
      setImagePreviewFailed(false);
      setFormError('');
      clearValidationError('event-image-file');
    } catch (error) {
      event.target.value = '';
      setValidationErrors([createValidationError({ key: 'event-image-file-invalid', fieldId: 'event-image-file', stage: 1, message: error.message })]);
    }
  };

  const removeSelectedImage = () => {
    if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
    setSelectedImageFile(null);
    setSelectedImagePreview('');
    setImagePreviewFailed(false);
    setImageUploadState('idle');
  };

  const validationErrorFor = (fieldId) => validationErrors.find((error) => error.fieldId === fieldId)?.message || '';
  const clearValidationError = (field, isValid = true) => {
    if (!isValid) return;
    setValidationErrors((errors) => errors.filter((error) => error.fieldId !== field));
  };
  const describedBy = (...ids) => ids.filter(Boolean).join(' ') || undefined;
  const activateValidationError = (error) => {
    if (!error?.key || !error?.fieldId || !Number.isInteger(error.stage)) return;
    validationFocusCancelRef.current?.();
    const requestId = validationFocusRequestRef.current + 1;
    validationFocusRequestRef.current = requestId;
    setPendingValidationFocus(createValidationFocusRequest(error, requestId));
    setEditorStep(error.stage);
  };

  useEffect(() => {
    if (!showForm || !pendingValidationFocus || pendingValidationFocus.stage !== editorStep) return undefined;
    const requestId = pendingValidationFocus.requestId;
    const cancel = scheduleValidationFocus({
      fieldId: pendingValidationFocus.fieldId,
      isCurrent: () => validationFocusRequestRef.current === requestId,
      onComplete: (success) => {
        if (success && validationFocusRequestRef.current === requestId) setPendingValidationFocus(null);
      },
    });
    validationFocusCancelRef.current = cancel;
    return () => {
      cancel();
      if (validationFocusCancelRef.current === cancel) validationFocusCancelRef.current = null;
    };
  }, [editorStep, pendingValidationFocus, showForm]);

  const validateStage = (stage) => {
    const nextErrors = [];
    if (stage === 0) {
      if (!form.title.trim()) nextErrors.push(createValidationError({ key: 'event-name-required', fieldId: 'event-name', stage: 0, message: 'Enter an event name.' }));
      const chapter = assignableChapters.find((item) => item.id === form.chapter_id);
      if (!chapter) nextErrors.push(createValidationError({ key: 'event-chapter-required', fieldId: 'event-chapter', stage: 0, message: 'Select a valid active chapter or Volunteer Community.' }));
      if (!isValidIsoDate(form.event_date)) nextErrors.push(createValidationError({ key: 'event-date-invalid', fieldId: 'event-date', stage: 0, message: 'Enter a valid event date.' }));
    }
    if (stage === 1) {
      if (!selectedCoordinatorOption) nextErrors.push(createValidationError({ key: 'event-coordinator-required', fieldId: 'event-coordinator', stage: 1, message: 'Select an active Event Coordinator assigned to this chapter.' }));
      if (!selectedImageFile && form.image_url.trim() && !isValidHttpUrl(form.image_url.trim())) nextErrors.push(createValidationError({ key: 'event-image-url-invalid', fieldId: 'event-image-url', stage: 1, message: 'Enter a valid HTTP or HTTPS image URL.' }));
    }
    setValidationErrors(nextErrors);
    return nextErrors.length === 0;
  };

  const moveToStep = (nextStep) => {
    if (nextStep > editorStep && !validateStage(editorStep)) return;
    setValidationErrors([]);
    setEditorStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleContinue = (event) => {
    advanceEventEditor(event, editorStep + 1, moveToStep);
  };

  const handleEventEditorKeyDown = (event) => {
    if (shouldPreventImplicitEventSubmit({ editorStep, key: event.key, target: event.target })) {
      event.preventDefault();
    }
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

    if (isSubmitting || submissionLockRef.current || !isIntentionalEventSubmit({
      editorStep,
      submitter: e.nativeEvent?.submitter || e.submitter,
    })) return;

    if (!validateStage(0) || !validateStage(1)) return;

    const selectedChapter = assignableChapters.find((chapter) => chapter.id === form.chapter_id);
    if (!selectedChapter || !isUuid(form.chapter_id)) {
      setFormError('Select a valid active chapter or Volunteer Community.');
      return;
    }

    if (!selectedCoordinatorOption) {
      setEditorStep(1);
      setValidationErrors([createValidationError({ key: 'event-coordinator-required', fieldId: 'event-coordinator', stage: 1, message: 'Select an active Event Coordinator assigned to this chapter.' })]);
      setFormError('Select an active Event Coordinator assigned to this chapter.');
      return;
    }

    if (!isValidIsoDate(form.event_date)) {
      setEditorStep(0);
      setValidationErrors([createValidationError({ key: 'event-date-invalid', fieldId: 'event-date', stage: 0, message: 'Enter a valid event date.' })]);
      return;
    }

    if (!selectedImageFile && form.image_url.trim() && !isValidHttpUrl(form.image_url.trim())) {
      setFormError('Image URL must start with http:// or https://.');
      return;
    }

    setFormError('');
    setFormSuccess('');
    submissionLockRef.current = true;
    setIsSubmitting(true);
    const payload = {
      ...form,
      title: form.title.trim(),
      chapter_id: selectedChapter.id,
      chapter: selectedChapter.name,
      coordinator: selectedCoordinatorOption.full_name || selectedCoordinatorOption.email,
      description: form.description.trim(),
      image_url: form.image_url.trim()
    };

    try {
      let saved;
      if (editingId) {
        saved = await updateEvent(editingId, payload, selectedCoordinatorOption.user_id);
        setFormSuccess('Event updated successfully.');
      } else {
        saved = await addEvent(payload, selectedCoordinatorOption.user_id);
        setFormSuccess('Event created successfully.');
      }

      if (selectedImageFile) {
        try {
          setImageUploadState('uploading');
          await uploadEventImage(saved.event.id, selectedImageFile);
          setImageUploadState('uploaded');
        } catch (imageError) {
          setImageUploadState('failed');
          setEditingId(saved.event.id);
          setFormError(imageError.message);
          setFormSuccess('The event and coordinator were saved. Retry the image upload from this edit form.');
          return;
        }
      }

      setEditingId(null);
      setForm(createEmptyForm());
      setInitialForm(createEmptyForm());
      setImagePreviewFailed(false);
      if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
      setSelectedImageFile(null);
      setSelectedImagePreview('');
      setShowForm(false);
    } catch (error) {
      const message = getEventErrorMessage(error);
      const issue = getEventValidationIssue(error);
      setFormError(message);
      setValidationErrors(issue ? [createValidationError({ key: `${issue.field}-server`, fieldId: issue.field, stage: issue.stage, message: issue.message })] : []);
      if (issue) setEditorStep(issue.stage);
    } finally {
      submissionLockRef.current = false;
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
    <div className={`module-page events-page ${showForm ? 'editor-active' : ''}`}>
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
          cancelLabel="Stay"
          confirmLabel="Discard changes"
          onCancel={() => setPendingDiscard(null)}
          onConfirm={confirmDiscard}
          focusAfterConfirm={pendingDiscard === 'event' ? '#create-event-button' : '#open-legacy-report-button'}
        />
      )}
      {showForm && (editingId ? canEditEvent(eventsList.find((event) => event.id === editingId)) : canCreateEvent) && (
        <section className="event-editor" aria-label={editingId ? 'Edit event' : 'Create event'}>
          <PageHeader
            eyebrow={editingId ? 'Edit event' : 'New event'}
            title={editingId ? 'Edit Event / CodeCamp' : 'Create Event / CodeCamp'}
            description="Complete all three stages. Nothing is saved until you submit the final review."
            actions={<button type="button" className="btn-secondary" onClick={closeForm} disabled={isSubmitting}><X size={18} aria-hidden="true" /> Cancel</button>}
          />
          <nav className="event-stepper" aria-label="Event editor progress">
            {['Event details', 'Assignment and media', 'Review and save'].map((label, index) => (
              <button key={label} type="button" className={index === editorStep ? 'active' : index < editorStep ? 'complete' : ''} onClick={() => index < editorStep && moveToStep(index)} aria-current={index === editorStep ? 'step' : undefined}>
                <span>{index < editorStep ? <Check size={15} /> : index + 1}</span><strong>{label}</strong>
              </button>
            ))}
          </nav>

          <form onSubmit={handleSubmit} onKeyDown={handleEventEditorKeyDown} className="event-editor-form" aria-describedby={formError ? 'event-form-error' : undefined} noValidate>
            <ErrorSummary errors={validationErrors} onActivate={activateValidationError} />
            {editorStep === 0 && <section className="event-editor-panel" aria-labelledby="event-details-heading">
              <div className="event-editor-heading"><span>Stage 1 of 3</span><h2 id="event-details-heading">Event details</h2><p>Describe when and where the event will happen.</p></div>
              <div className="event-form-fields">
                  <div className="form-group">
                    <label htmlFor="event-name">Event name <span aria-hidden="true">*</span></label>
                    <input id="event-name" className="border-input" type="text" value={form.title} onChange={(e) => { setFormError(''); clearValidationError('event-name', Boolean(e.target.value.trim())); setForm({ ...form, title: e.target.value }); }} disabled={isSubmitting} aria-invalid={validationErrorFor('event-name') ? true : undefined} aria-describedby={validationErrorFor('event-name') ? 'event-name-error' : undefined} required />
                    {validationErrorFor('event-name') && <small id="event-name-error" className="field-error">{validationErrorFor('event-name')}</small>}
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
                    <label htmlFor="event-chapter">Chapter <span aria-hidden="true">*</span></label>
                    <select id="event-chapter" className="border-input" value={form.chapter_id} onChange={(e) => { const selected = assignableChapters.find((chapter) => chapter.id === e.target.value); const hadCoordinator = Boolean(form.coordinator_user_id); setFormError(''); setValidationErrors((errors) => errors.filter((error) => !['event-chapter', 'event-coordinator'].includes(error.fieldId))); setEligibleCoordinators([]); setCoordinatorChapterId(''); setForm((current) => ({ ...current, chapter_id: e.target.value, chapter: selected?.name || '', coordinator_user_id: '', coordinator: '' })); setCoordinatorNotice(hadCoordinator ? 'The previous coordinator was cleared because the chapter changed.' : ''); void loadCoordinators(e.target.value); }} disabled={isSubmitting || roleKey === 'chapter_coordinator'} aria-invalid={validationErrorFor('event-chapter') ? true : undefined} aria-describedby={validationErrorFor('event-chapter') ? 'event-chapter-error' : undefined} required>
                      <option value="">Select an active location</option>
                      {assignableChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}
                    </select>
                    {validationErrorFor('event-chapter') && <small id="event-chapter-error" className="field-error">{validationErrorFor('event-chapter')}</small>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="event-date">Event Date <span className="optional-label">Optional</span></label>
                    <input id="event-date" type="date" className="border-input" value={form.event_date} onChange={(e) => { setFormError(''); clearValidationError('event-date', isValidIsoDate(e.target.value)); setForm({ ...form, event_date: e.target.value }); }} disabled={isSubmitting} aria-invalid={validationErrorFor('event-date') ? true : undefined} aria-describedby={validationErrorFor('event-date') ? 'event-date-error' : undefined} />
                    {validationErrorFor('event-date') && <small id="event-date-error" className="field-error">{validationErrorFor('event-date')}</small>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="event-status">Status</label>
                    <select id="event-status" className="border-input" value={form.status} onChange={(e) => { clearValidationError('event-status'); setForm({ ...form, status: e.target.value }); }} disabled={isSubmitting} aria-invalid={validationErrorFor('event-status') ? true : undefined} aria-describedby={validationErrorFor('event-status') ? 'event-status-error' : undefined}>
                      <option>Scheduled</option>
                      <option>Cancelled</option>
                      <option>Completed</option>
                      <option>Draft</option>
                    </select>
                    {validationErrorFor('event-status') && <small id="event-status-error" className="field-error">{validationErrorFor('event-status')}</small>}
                  </div>
                  <div className="form-group form-group-wide">
                    <label htmlFor="event-description">Description / caption <span className="optional-label">Optional</span></label>
                    <textarea id="event-description" className="border-input" rows="5" placeholder="Briefly describe the event, its purpose, and target participants." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={isSubmitting} aria-describedby="event-description-help event-description-count" />
                    <small id="event-description-help">Briefly describe the event, its purpose, and target participants.</small>
                    <span id="event-description-count" className="character-count">{form.description.length} characters</span>
                  </div>
              </div>
            </section>}

            {editorStep === 1 && <section className="event-editor-panel" aria-labelledby="event-assignment-heading">
              <div className="event-editor-heading"><span>Stage 2 of 3</span><h2 id="event-assignment-heading">Assignment and media</h2><p>Assign an eligible coordinator and optionally add a private event image.</p></div>
              <div className="event-form-fields">
                <div className="form-group form-group-wide">
                  <label htmlFor="event-coordinator">Event Coordinator <span aria-hidden="true">*</span></label>
                  <select id="event-coordinator" className="border-input" value={form.coordinator_user_id} onChange={(e) => { const selected = eligibleCoordinators.find((coordinator) => coordinator.user_id === e.target.value); setFormError(''); clearValidationError('event-coordinator', Boolean(selected)); setCoordinatorNotice(''); setForm({ ...form, coordinator_user_id: e.target.value, coordinator: selected?.full_name || selected?.email || '' }); }} disabled={isSubmitting || coordinatorsLoading || !form.chapter_id || roleKey === 'event_coordinator'} required aria-invalid={validationErrorFor('event-coordinator') ? true : undefined} aria-describedby={describedBy('coordinator-state', validationErrorFor('event-coordinator') && 'event-coordinator-error')}>
                    <option value="">{!form.chapter_id ? 'Select a chapter first' : coordinatorsLoading ? 'Loading coordinators…' : 'Select an Event Coordinator'}</option>
                    {eligibleCoordinators.map((coordinator) => <option key={coordinator.user_id} value={coordinator.user_id}>{coordinator.full_name || 'Unnamed user'} — {coordinator.email}</option>)}
                  </select>
                  {validationErrorFor('event-coordinator') && <small id="event-coordinator-error" className="field-error">{validationErrorFor('event-coordinator')}</small>}
                  <div id="coordinator-state" aria-live="polite">
                    {coordinatorsLoading && <small>Loading active coordinators for {form.chapter}…</small>}
                    {coordinatorNotice && <small>{coordinatorNotice}</small>}
                    {coordinatorsError && <small className="field-error">{coordinatorsError}</small>}
                    {!coordinatorsLoading && form.chapter_id && !coordinatorsError && eligibleCoordinators.length === 0 && <small>No active Event Coordinators are assigned to this chapter.</small>}
                    {form.coordinator_user_id && <small>Selected: {form.coordinator}</small>}
                  </div>
                </div>
                  <div className="form-group form-group-wide">
                    <label htmlFor="event-image-file">Event image <span className="optional-label">Optional</span></label>
                    <div className="event-upload-control"><UploadCloud size={24} aria-hidden="true" /><div><strong>{selectedImageFile ? selectedImageFile.name : 'Choose an event image'}</strong><span>PNG, JPG, JPEG, or WebP · maximum 10 MB · stored privately</span></div><label className="btn-secondary" htmlFor="event-image-file">{selectedImageFile ? 'Replace image' : 'Choose file'}</label></div>
                    <input id="event-image-file" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleEventImageSelect} disabled={isSubmitting} aria-invalid={validationErrorFor('event-image-file') ? true : undefined} aria-describedby={describedBy('event-image-file-help', validationErrorFor('event-image-file') && 'event-image-file-error')} />
                    <small id="event-image-file-help">Choose one supported image up to 10 MB.</small>
                    {validationErrorFor('event-image-file') && <small id="event-image-file-error" className="field-error">{validationErrorFor('event-image-file')}</small>}
                  </div>
                  <div className="form-group form-group-wide">
                    <label htmlFor="event-image-url">Image URL fallback <span className="optional-label">Optional</span></label>
                    <input id="event-image-url" className="border-input" type="url" placeholder="https://example.com/event-image.jpg" value={form.image_url} onChange={(e) => { setFormError(''); clearValidationError('event-image-url', !e.target.value.trim() || isValidHttpUrl(e.target.value.trim())); setImagePreviewFailed(false); setForm({ ...form, image_url: e.target.value }); }} disabled={isSubmitting} aria-describedby={describedBy('event-image-help', validationErrorFor('event-image-url') && 'event-image-url-error')} aria-invalid={validationErrorFor('event-image-url') ? true : undefined} />
                    <small id="event-image-help">Used only when no uploaded image is selected.</small>
                    {validationErrorFor('event-image-url') && <small id="event-image-url-error" className="field-error">{validationErrorFor('event-image-url')}</small>}
                  </div>
                  <div className="event-image-preview event-image-preview-16-9" aria-live="polite">
                    {(selectedImagePreview || (form.image_url.trim() && isValidHttpUrl(form.image_url.trim()))) && !imagePreviewFailed ? (
                      <img src={selectedImagePreview || form.image_url.trim()} alt="Event image preview" onError={() => setImagePreviewFailed(true)} />
                    ) : (
                      <div className="event-image-preview-placeholder">
                        <ImageIcon size={24} />
                        <span>{imagePreviewFailed ? 'Image preview unavailable' : 'Image preview'}</span>
                      </div>
                    )}
                  </div>
                  {selectedImageFile && <div className="event-file-meta"><span>{selectedImageFile.type}</span><span>{(selectedImageFile.size / 1024 / 1024).toFixed(2)} MB</span><span>{imageUploadState === 'staged' ? 'Staged locally' : imageUploadState}</span><button type="button" className="btn-tertiary" onClick={removeSelectedImage} disabled={isSubmitting}>Remove</button></div>}
                  {imageUploadState === 'uploading' && <div className="upload-progress" role="progressbar" aria-label="Uploading event image" aria-valuetext="Uploading privately"><span /></div>}
              </div>
              <InlineAlert>Saving this event does not create a Google Drive folder. The event folder is created after the first valid Post Event Report is submitted.</InlineAlert>
            </section>}

            {editorStep === 2 && <section className="event-editor-panel" aria-labelledby="event-review-heading">
              <div className="event-editor-heading"><span>Stage 3 of 3</span><h2 id="event-review-heading">Review and save</h2><p>Confirm the operational details before saving.</p></div>
              <div className="event-review-sections">
                <section className="event-review-section" aria-labelledby="review-event-heading">
                  <h3 id="review-event-heading">Event information</h3>
                  <dl>
                    <div><dt>Event</dt><dd>{form.title || 'Not provided'}</dd></div>
                    <div><dt>Type</dt><dd>{form.type}</dd></div>
                    <div><dt>Date</dt><dd>{form.event_date || 'Not scheduled'}</dd></div>
                    <div><dt>Status</dt><dd><StatusBadge status={form.status} /></dd></div>
                  </dl>
                </section>
                <section className="event-review-section" aria-labelledby="review-assignment-heading">
                  <h3 id="review-assignment-heading">Chapter and assignment</h3>
                  <dl>
                    <div><dt>Chapter</dt><dd>{form.chapter || 'Not selected'}</dd></div>
                    <div><dt>Coordinator</dt><dd>{selectedCoordinatorOption ? `${selectedCoordinatorOption.full_name || 'Unnamed user'} — ${selectedCoordinatorOption.email}` : 'Not selected'}</dd></div>
                  </dl>
                </section>
                <section className="event-review-section" aria-labelledby="review-content-heading">
                  <h3 id="review-content-heading">Content and media</h3>
                  <dl>
                    <div><dt>Image</dt><dd>{selectedImageFile ? `${selectedImageFile.name} (staged)` : form.image_url || 'No image'}</dd></div>
                    <div><dt>Description</dt><dd>{form.description || 'No description provided'}</dd></div>
                  </dl>
                </section>
              </div>
              {(selectedImagePreview || (form.image_url.trim() && isValidHttpUrl(form.image_url.trim()))) && <div className="event-image-preview event-image-preview-16-9"><img src={selectedImagePreview || form.image_url.trim()} alt="Review of selected event" /></div>}
              <InlineAlert>Saving creates or updates the event and its coordinator assignment atomically. It does not queue Google Workspace automation.</InlineAlert>
            </section>}

            <footer className="event-editor-actions">
              <button type="button" className="btn-secondary" onClick={() => editorStep === 0 ? closeForm() : moveToStep(editorStep - 1)} disabled={isSubmitting}><ArrowLeft size={18} /> {editorStep === 0 ? 'Cancel' : 'Back'}</button>
              <span>Stage {editorStep + 1} of 3</span>
              {editorStep < 2 ? (
                <button key={`event-editor-continue-${editorStep}`} type="button" className="btn-primary" onClick={handleContinue}>Continue <ArrowRight size={18} /></button>
              ) : (
                <button key="event-editor-create-submit" id={EVENT_CREATE_SUBMIT.id} name={EVENT_CREATE_SUBMIT.name} value={EVENT_CREATE_SUBMIT.value} type="submit" className="btn-primary" disabled={isSubmitting}><Check size={18} /> {isSubmitting ? 'Saving…' : editingId ? 'Save changes' : 'Create event'}</button>
              )}
            </footer>
            {formError && <InlineAlert id="event-form-error" tone="error">{formError}</InlineAlert>}
          </form>
        </section>
      )}

      {/* Post-Event Report collection modal */}
      {showReportForm && canEditReport(eventsList.find((event) => Number(event.id) === Number(effectiveReportEventId))) && (
        <div className="event-modal-overlay" onClick={closeReportForm} />
      )}
      {showReportForm && canEditReport(eventsList.find((event) => Number(event.id) === Number(effectiveReportEventId))) && (
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

      <PageHeader
        eyebrow="Programs"
        title="Events & CodeCamps"
        description="Plan events, assign eligible coordinators, and track delivery within your authorized scope."
        scope={['super_admin', 'admin'].includes(roleKey) ? 'National scope' : scopedChapterName ? `${scopedChapterName} chapter` : 'Assigned events'}
        actions={canCreateEvent && <button id="create-event-button" className="btn-primary" onClick={openCreateForm} type="button"><Plus size={18} /> Create event</button>}
      />

      <EventApplicationsPanel events={eventsList || []} />

      {eventsList?.length > 0 && <section className="event-report-link" aria-labelledby="event-report-link-title">
        <div><h2 id="event-report-link-title">Post Event Reports</h2><p>Submit and review verified attendance, finance, impact, and documentation in the dedicated reporting workflow.</p></div>
        <div className="event-report-link-actions"><button type="button" className="btn-secondary" onClick={() => navigate('/dashboard/post-event-report')}>Open reports <ArrowRight size={18} /></button>{canEditReport(eventsList.find((event) => Number(event.id) === Number(effectiveReportEventId))) && <button id="open-legacy-report-button" type="button" className="btn-tertiary" onClick={openReportForm}>Open legacy quick report</button>}</div>
      </section>}

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
                <StatusBadge status={event.status || 'Draft'} />
              </div>

              <div className="event-card-body">
                <div className="event-card-headline">
                  <div>
                    <p className="event-type">{event.type}</p>
                    <h3>{event.title}</h3>
                  </div>
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

                {(canEditEvent(event) || canDeleteEvent(event)) && (
                  <div className="event-actions">
                    {canEditEvent(event) && <button type="button" className="btn-secondary small-action" onClick={() => openEditForm(event)} disabled={deletingId === event.id}>
                      <PencilLine size={16} />
                      Edit
                    </button>}
                    {canDeleteEvent(event) && <button type="button" className="btn-secondary small-action danger" onClick={() => handleDelete(event)} disabled={deletingId === event.id}>
                      <Trash2 size={16} />
                      {deletingId === event.id ? 'Deleting...' : 'Delete'}
                    </button>}
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
