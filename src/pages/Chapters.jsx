import { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context/AppState';
import { MapPin, ArrowRight, Plus, PencilLine, Trash2, X } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { canPerform } from '../auth/permissions';
import './Chapters.css';

const createEmptyForm = () => ({
  name: '',
  learners: 0,
  workshops: 0,
  completion: 0,
  color: '#7f08ff',
});

const isWholeNumberInRange = (value, minimum, maximum) => {
  const number = Number(value);
  return (
    String(value).trim() !== '' &&
    Number.isInteger(number) &&
    number >= minimum &&
    number <= maximum
  );
};

const CHAPTERS_PER_PAGE = 6;

export default function Chapters() {
  const { chapters, addChapter, updateChapter, deleteChapter, roleKey, user } = useApp();
  const canCreateChapter = canPerform(roleKey, 'chapter.create');
  const canEditChapter = (chapter) =>
    canPerform(roleKey, 'chapter.update', {
      actorChapterId: user?.chapterId,
      targetChapterId: chapter?.id,
    });
  const canDeleteChapter = (chapter) =>
    canPerform(roleKey, 'chapter.delete', {
      actorChapterId: user?.chapterId,
      targetChapterId: chapter?.id,
    });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [form, setForm] = useState(createEmptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(chapters.length / CHAPTERS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedChapters = chapters.slice(
    (activePage - 1) * CHAPTERS_PER_PAGE,
    activePage * CHAPTERS_PER_PAGE
  );

  useEffect(() => {
    if (!deleteSuccess) return undefined;
    const timer = window.setTimeout(() => setDeleteSuccess(''), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteSuccess]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(createEmptyForm());
    setFormError('');
    setFormSuccess('');
    setShowForm(true);
  };

  const openEditForm = (chapter) => {
    setEditingId(chapter.id);
    setForm({
      name: chapter.name || '',
      learners: chapter.learners ?? 0,
      workshops: chapter.workshops ?? 0,
      completion: chapter.completion ?? 0,
      color: chapter.color || '#7f08ff',
    });
    setFormError('');
    setFormSuccess('');
    setShowForm(true);
  };

  const closeForm = (force = false) => {
    if (isSubmitting && !force) return;

    setEditingId(null);
    setForm(createEmptyForm());
    setFormError('');
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setFormError('Enter a chapter name.');
      return;
    }

    if (!isWholeNumberInRange(form.learners, 0, Number.MAX_SAFE_INTEGER)) {
      setFormError('Learners must be a whole number of 0 or more.');
      return;
    }

    if (!isWholeNumberInRange(form.workshops, 0, Number.MAX_SAFE_INTEGER)) {
      setFormError('Workshops must be a whole number of 0 or more.');
      return;
    }

    if (!isWholeNumberInRange(form.completion, 0, 100)) {
      setFormError('Completion rate must be a whole number from 0 to 100.');
      return;
    }

    setFormError('');
    setFormSuccess('');
    setIsSubmitting(true);

    const payload = {
      ...form,
      name: form.name.trim(),
      learners: Number(form.learners),
      workshops: Number(form.workshops),
      completion: Number(form.completion),
    };

    try {
      if (editingId) {
        await updateChapter(editingId, payload);
        setFormSuccess('Chapter updated successfully.');
      } else {
        await addChapter(payload);
        setFormSuccess('Chapter created successfully.');
      }

      closeForm(true);
    } catch (error) {
      console.error('Failed to save chapter', error);
      setFormError('Unable to save the chapter. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id) => {
    setDeleteSuccess('');
    setFormSuccess('');
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    try {
      await deleteChapter(pendingDeleteId);
      setDeleteSuccess('Chapter deleted successfully.');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const scopeLabel = useMemo(() => {
    if (['super_admin', 'admin'].includes(roleKey)) return 'National scope';
    if (user?.chapterId) {
      const chapter = chapters.find((c) => c.id === user.chapterId);
      return chapter?.name ? `${chapter.name} chapter` : 'Assigned chapter';
    }
    return 'Operations scope';
  }, [chapters, roleKey, user]);

  return (
    <div className="module-page chapters-page">
      <PageHeader
        eyebrow="Network"
        title="Active Chapters"
        description="Nationwide locations bringing tech and AI education to the youth."
        scope={scopeLabel}
        actions={
          canCreateChapter && (
            <button className="btn-primary" onClick={openCreateForm} type="button">
              <Plus size={18} />
              Add Chapter
            </button>
          )
        }
      />

      {formSuccess && (
        <div className="chapter-form-feedback success inline-alert alert-success" role="status">
          {formSuccess}
        </div>
      )}
      {deleteSuccess && (
        <div className="chapter-form-feedback success inline-alert alert-success" role="status">
          {deleteSuccess}
        </div>
      )}

      {pendingDeleteId != null && (
        <ConfirmationModal
          title="Delete chapter?"
          message="This action cannot be undone."
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={confirmDelete}
        />
      )}

      {showForm &&
        (editingId
          ? canEditChapter(chapters.find((chapter) => chapter.id === editingId))
          : canCreateChapter) && (
          <>
            <div className="chapter-modal-overlay" onClick={closeForm} />
            <div className="chapter-modal-container">
              <div
                className="card animate-fade-in chapter-form-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="chapter-form-title"
              >
                <div className="chapter-form-head">
                  <h3 id="chapter-form-title">{editingId ? 'Edit Chapter' : 'Add New Chapter'}</h3>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => closeForm()}
                    aria-label="Close form"
                  >
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="chapter-form-grid">
                  <div className="chapter-form-group chapter-name-field">
                    <label htmlFor="chapter-name">Chapter Name</label>
                    <input
                      id="chapter-name"
                      type="text"
                      placeholder="e.g. DEVCON Kids Manila"
                      value={form.name}
                      onChange={(e) => {
                        setFormError('');
                        setForm({ ...form, name: e.target.value });
                      }}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="chapter-form-group chapter-number-field">
                    <label htmlFor="chapter-learners">Learners</label>
                    <input
                      id="chapter-learners"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={form.learners}
                      onChange={(e) => {
                        setFormError('');
                        setForm({ ...form, learners: e.target.value });
                      }}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="chapter-form-group chapter-number-field">
                    <label htmlFor="chapter-workshops">Workshops</label>
                    <input
                      id="chapter-workshops"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={form.workshops}
                      onChange={(e) => {
                        setFormError('');
                        setForm({ ...form, workshops: e.target.value });
                      }}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="chapter-form-group chapter-number-field">
                    <label htmlFor="chapter-completion">Completion Rate (%)</label>
                    <input
                      id="chapter-completion"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="0"
                      value={form.completion}
                      onChange={(e) => {
                        setFormError('');
                        setForm({ ...form, completion: e.target.value });
                      }}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="chapter-form-group chapter-color-field">
                    <label htmlFor="chapter-color">Display Color</label>
                    <div className="color-picker-wrapper">
                      <input
                        id="chapter-color"
                        type="color"
                        value={form.color}
                        onChange={(e) => setForm({ ...form, color: e.target.value })}
                        disabled={isSubmitting}
                      />
                      <span className="color-value-label">{form.color}</span>
                    </div>
                  </div>
                  <div className="chapter-form-actions">
                    <button type="submit" className="btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : editingId ? 'Update Chapter' : 'Save Chapter'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => closeForm()}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                  </div>
                  {formError && (
                    <p className="chapter-form-feedback error inline-alert alert-error" role="alert">
                      {formError}
                    </p>
                  )}
                </form>
              </div>
            </div>
          </>
        )}

      {selectedChapter && (
        <article
          className="card animate-fade-in chapter-details-card"
          style={{ borderLeftColor: selectedChapter.color || 'var(--brand-purple)' }}
        >
          <div className="chapter-details-header">
            <div>
              <p className="page-eyebrow">Chapter Spotlight</p>
              <h2>{selectedChapter.name}</h2>
            </div>
            <button
              type="button"
              className="chapter-details-close"
              onClick={() => setSelectedChapter(null)}
              aria-label="Close details"
            >
              <X size={18} />
            </button>
          </div>
          <div className="chapter-details-metrics">
            <div className="chapter-details-metric">
              <span className="metric-label">Total Learners</span>
              <span
                className="metric-value"
                style={{ color: selectedChapter.color || 'var(--brand-purple)' }}
              >
                {(selectedChapter.learners || 0).toLocaleString()}
              </span>
            </div>
            <div className="chapter-details-metric">
              <span className="metric-label">Workshops Conducted</span>
              <span
                className="metric-value"
                style={{ color: selectedChapter.color || 'var(--brand-purple)' }}
              >
                {selectedChapter.workshops || 0}
              </span>
            </div>
            <div className="chapter-details-metric">
              <span className="metric-label">Completion Rate</span>
              <span
                className="metric-value"
                style={{ color: selectedChapter.color || 'var(--brand-purple)' }}
              >
                {selectedChapter.completion || 0}%
              </span>
            </div>
          </div>
          <div className="chapter-details-status">
            <p>
              <strong>Status:</strong> This chapter is{' '}
              {(selectedChapter.completion || 0) >= 80
                ? 'thriving'
                : (selectedChapter.completion || 0) >= 50
                ? 'growing'
                : 'in early stages'}{' '}
              with {selectedChapter.completion || 0}% completion rate.
            </p>
          </div>
        </article>
      )}

      {chapters.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No chapters found"
          description="Add a chapter to start tracking local program activity across the nation."
          actions={
            canCreateChapter && (
              <button className="btn-primary" onClick={openCreateForm} type="button">
                <Plus size={18} /> Add Chapter
              </button>
            )
          }
        />
      ) : (
        <div className="chapters-grid">
          {paginatedChapters.map((chapter) => (
            <article className="card chapter-grid-card" key={chapter.id}>
              <div className="chapter-card-header">
                <div className="chapter-name-wrapper">
                  <div
                    className="chapter-indicator-dot"
                    style={{ backgroundColor: chapter.color || 'var(--brand-purple)' }}
                  />
                  <h3>{chapter.name}</h3>
                </div>
                <span
                  className="completion-badge"
                  style={{
                    color: chapter.color || 'var(--brand-purple)',
                    backgroundColor: `${chapter.color || '#7f08ff'}1a`,
                    borderColor: `${chapter.color || '#7f08ff'}40`,
                  }}
                >
                  {chapter.completion}% Active
                </span>
              </div>

              <div className="chapter-metrics">
                <div className="metric">
                  <span className="metric-value">{(chapter.learners || 0).toLocaleString()}</span>
                  <span className="metric-label">Learners</span>
                </div>
                <div className="metric">
                  <span className="metric-value">{chapter.workshops || 0}</span>
                  <span className="metric-label">Workshops</span>
                </div>
              </div>

              <button
                type="button"
                className="btn-secondary full-width chapter-action"
                onClick={() => setSelectedChapter(chapter)}
              >
                View Details <ArrowRight size={16} />
              </button>

              {(canEditChapter(chapter) || canDeleteChapter(chapter)) && (
                <div className="chapter-card-actions">
                  {canEditChapter(chapter) && (
                    <button
                      type="button"
                      className="btn-secondary chapter-edit-btn"
                      onClick={() => openEditForm(chapter)}
                    >
                      <PencilLine size={16} /> Edit
                    </button>
                  )}
                  {canDeleteChapter(chapter) && (
                    <button
                      type="button"
                      className="btn-danger-outline chapter-delete-btn"
                      onClick={() => handleDelete(chapter.id)}
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {chapters.length > 0 && (
        <nav className="chapter-pagination" aria-label="Chapter pagination">
          <button
            type="button"
            className="chapter-pagination-button"
            onClick={() => setCurrentPage(activePage - 1)}
            disabled={activePage === 1}
          >
            Previous
          </button>
          <div className="chapter-pagination-pages">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button
                key={page}
                type="button"
                className={`chapter-pagination-page ${page === activePage ? 'active' : ''}`}
                onClick={() => setCurrentPage(page)}
                aria-current={page === activePage ? 'page' : undefined}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="chapter-pagination-button"
            onClick={() => setCurrentPage(activePage + 1)}
            disabled={activePage === totalPages}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
