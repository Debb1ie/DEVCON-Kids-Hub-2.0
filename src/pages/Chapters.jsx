import { useEffect, useState } from 'react';
import { useApp } from '../context/AppState';
import { MapPin, ArrowRight, Plus, PencilLine, Trash2 } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import './Chapters.css';

const createEmptyForm = () => ({
  name: '',
  learners: 0,
  workshops: 0,
  completion: 0,
  color: '#8B5CF6'
});

const isWholeNumberInRange = (value, minimum, maximum) => {
  const number = Number(value);
  return String(value).trim() !== ''
    && Number.isInteger(number)
    && number >= minimum
    && number <= maximum;
};

const CHAPTERS_PER_PAGE = 6;

export default function Chapters() {
  const { chapters, addChapter, updateChapter, deleteChapter, isSuperadmin } = useApp();
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
  const paginatedChapters = chapters.slice((activePage - 1) * CHAPTERS_PER_PAGE, activePage * CHAPTERS_PER_PAGE);

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
      color: chapter.color || '#8B5CF6'
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
      completion: Number(form.completion)
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

  return (
    <div className="module-page">
      <div className="module-header">
        <div className="module-title">
          <div className="module-icon" style={{ background: 'var(--accent-yellow)', color: 'white' }}>
            <MapPin size={24} />
          </div>
          <div>
            <h2>Active Chapters</h2>
            <p className="text-muted">Nationwide locations bringing tech to the youth.</p>
          </div>
        </div>
        {isSuperadmin && (
          <button className="btn-primary" onClick={openCreateForm} type="button">
            <Plus size={20} />
            Add Chapter
          </button>
        )}
      </div>

      {formSuccess && <div className="chapter-form-feedback success" role="status">{formSuccess}</div>}
      {deleteSuccess && <div className="chapter-form-feedback success" role="status">{deleteSuccess}</div>}

      {pendingDeleteId != null && (
        <ConfirmationModal
          title="Delete chapter?"
          message="This action cannot be undone."
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={confirmDelete}
        />
      )}

      {isSuperadmin && showForm && (
        <>
          <div className="chapter-modal-overlay" onClick={closeForm} />
          <div className="chapter-modal-container">
        <div className="card animate-fade-in chapter-form-card" role="dialog" aria-modal="true" aria-labelledby="chapter-form-title">
          <h3 id="chapter-form-title">{editingId ? 'Edit Chapter' : 'Add New Chapter'}</h3>
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
              <label htmlFor="chapter-completion">Completion Rate</label>
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
              <input
                id="chapter-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div className="chapter-form-actions">
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingId ? 'Update Chapter' : 'Save Chapter'}
              </button>
              <button type="button" className="btn-secondary" onClick={closeForm} disabled={isSubmitting}>
                Cancel
              </button>
            </div>
            {formError && <p className="chapter-form-feedback error" role="alert">{formError}</p>}
          </form>
        </div>
          </div>
        </>
      )}

      {selectedChapter && (
        <div className="card animate-fade-in" style={{ marginBottom: '1rem', padding: '2rem', borderLeft: `4px solid ${selectedChapter.color}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>{selectedChapter.name} - Chapter Details</h2>
            <button type="button" className="chapter-details-close" onClick={() => setSelectedChapter(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 0.5rem 0' }}>Total Learners</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: selectedChapter.color }}>{selectedChapter.learners.toLocaleString()}</p>
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 0.5rem 0' }}>Workshops Conducted</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: selectedChapter.color }}>{selectedChapter.workshops}</p>
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 0.5rem 0' }}>Completion Rate</p>
              <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0', color: selectedChapter.color }}>{selectedChapter.completion}%</p>
            </div>
          </div>
          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: `${selectedChapter.color}10`, borderRadius: '8px' }}>
            <p style={{ margin: 0, color: 'var(--text-main)' }}>
              <strong>Status:</strong> This chapter is {selectedChapter.completion >= 80 ? 'thriving' : selectedChapter.completion >= 50 ? 'growing' : 'in early stages'} with {selectedChapter.completion}% completion rate.
            </p>
          </div>
        </div>
      )}

      <div className="chapters-grid">
        {chapters.length === 0 ? (
          <div className="card empty-state">
            <MapPin size={48} color="var(--text-muted)" aria-hidden="true" />
            <p>No chapters found</p>
            <small>Add a chapter to start tracking local program activity.</small>
          </div>
        ) : paginatedChapters.map((chapter) => (
          <div className="card chapter-grid-card" key={chapter.id}>
            <div className="chapter-card-header">
              <div className="chapter-name-wrapper">
                <MapPin size={20} color={chapter.color} />
                <h3>{chapter.name}</h3>
              </div>
              <span className="completion-badge" style={{ color: chapter.color, backgroundColor: `${chapter.color}20` }}>
                {chapter.completion}% Active
              </span>
            </div>
            
            <div className="chapter-metrics">
              <div className="metric">
                <span className="metric-value">{chapter.learners.toLocaleString()}</span>
                <span className="metric-label">Learners</span>
              </div>
              <div className="metric">
                <span className="metric-value">{chapter.workshops}</span>
                <span className="metric-label">Workshops</span>
              </div>
            </div>

            <button type="button" className="btn-secondary full-width chapter-action" onClick={() => setSelectedChapter(chapter)}>
              View Chapter Details <ArrowRight size={16} />
            </button>

            {isSuperadmin && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn-secondary full-width chapter-action" onClick={() => openEditForm(chapter)}>
                  <PencilLine size={16} /> Edit
                </button>
                <button type="button" className="btn-secondary full-width chapter-action" onClick={() => handleDelete(chapter.id)} style={{ borderColor: '#DC2626', color: '#DC2626' }}>
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {chapters.length > 0 && (
        <nav className="chapter-pagination" aria-label="Chapter pagination">
          <button type="button" className="chapter-pagination-button" onClick={() => setCurrentPage(activePage - 1)} disabled={activePage === 1}>Previous</button>
          <div className="chapter-pagination-pages">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" className={`chapter-pagination-page ${page === activePage ? 'active' : ''}`} onClick={() => setCurrentPage(page)} aria-current={page === activePage ? 'page' : undefined}>{page}</button>
            ))}
          </div>
          <button type="button" className="chapter-pagination-button" onClick={() => setCurrentPage(activePage + 1)} disabled={activePage === totalPages}>Next</button>
        </nav>
      )}
    </div>
  );
}
