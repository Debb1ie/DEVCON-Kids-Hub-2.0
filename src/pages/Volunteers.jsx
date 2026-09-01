import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppState';
import {
  Users,
  Search,
  Plus,
  Trash2,
  PencilLine,
  UserRound,
  RotateCcw,
  Save,
  X,
  Eye,
  Check,
  CheckCircle2,
  XCircle,
  BadgeCheck,
  Clock,
  TrendingUp,
  Info,
  ClipboardCheck
} from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import './Volunteers.css';

// The approval ladder is derived entirely from each volunteer's existing
// "status" field — no new data, ladder levels, or backend fields are introduced.
const PIPELINE_STAGES = ['Pending', 'Approved', 'Active'];
const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];
const VOLUNTEERS_PER_PAGE = 8;

const normalizeStatus = (status = '') => String(status || '').trim().toLowerCase();

const getPipelineStep = (status) =>
  PIPELINE_STAGES.findIndex((stage) => stage.toLowerCase() === normalizeStatus(status));

const getJoinedDate = (volunteer = {}) =>
  volunteer.created_at || volunteer.joined_date || volunteer.joined_at || null;

const formatJoinedDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

function LadderProgress({ status }) {
  const step = getPipelineStep(status);
  const filled = step >= 0 ? step + 1 : 0;

  return (
    <div
      className="ladder-progress"
      title={step >= 0 ? `${PIPELINE_STAGES[step]} — step ${filled} of ${PIPELINE_STAGES.length}` : 'Not on the volunteer ladder'}
    >
      <div className="ladder-progress-segments" aria-hidden="true">
        {PIPELINE_STAGES.map((stage, index) => (
          <span key={stage} className={`ladder-progress-segment ${index < filled ? 'filled' : ''}`} />
        ))}
      </div>
      <span className="ladder-progress-label">{step >= 0 ? `${filled} of ${PIPELINE_STAGES.length}` : '—'}</span>
    </div>
  );
}

export default function Volunteers() {
  const { volunteersList, addVolunteer, updateVolunteer, deleteVolunteer, isSuperadmin } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', role: 'Lead Instructor', chapter: 'Manila', status: 'Pending' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingVolunteer, setViewingVolunteer] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const emptyForm = { name: '', role: 'Lead Instructor', chapter: 'Manila', status: 'Pending' };

  // Auto-dismiss volunteer action feedback.
  useEffect(() => {
    if (!actionNotice) return undefined;
    const timer = window.setTimeout(() => setActionNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  // Counts are computed from the existing volunteer data only.
  const counts = useMemo(() => {
    const list = volunteersList || [];
    const countBy = (status) => list.filter((volunteer) => normalizeStatus(volunteer.status) === status).length;
    return {
      all: list.length,
      pending: countBy('pending'),
      approved: countBy('approved'),
      rejected: countBy('rejected'),
      active: countBy('active')
    };
  }, [volunteersList]);

  const approvedReached = counts.approved > 0 || counts.active > 0;
  const activeReached = counts.active > 0;
  const pendingReached = counts.pending > 0;
  // Newest applications first when a joined date exists; otherwise keep source order.
  const sortedVolunteers = useMemo(() => {
    const list = volunteersList || [];
    return [...list].sort((a, b) => {
      const dateA = getJoinedDate(a);
      const dateB = getJoinedDate(b);
      if (dateA && dateB) return new Date(dateB) - new Date(dateA);
      if (dateA) return -1;
      if (dateB) return 1;
      return 0;
    });
  }, [volunteersList]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedVolunteers.filter((volunteer) => {
      const matchesSearch = !term || (volunteer.name || '').toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'All' || normalizeStatus(volunteer.status) === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [searchTerm, sortedVolunteers, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / VOLUNTEERS_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedVolunteers = filtered.slice((activePage - 1) * VOLUNTEERS_PER_PAGE, activePage * VOLUNTEERS_PER_PAGE);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError('');
  };

  const closeForm = () => {
    if (isSubmitting) return;
    resetForm();
    setShowForm(false);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (volunteer) => {
    setEditingId(volunteer.id);
    setForm({
      name: volunteer.name || '',
      role: volunteer.role || 'Lead Instructor',
      chapter: volunteer.chapter || 'Manila',
      status: volunteer.status || 'Pending'
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Enter volunteer name.');
      setActionNotice({ type: 'error', message: 'Enter volunteer name.' });
      return;
    }

    setFormError('');
    setIsSubmitting(true);
    const payload = { ...form, name: form.name.trim() };

    if (!editingId) {
      payload.joined_date = new Date().toISOString();
    }

    const isEditing = Boolean(editingId);
    try {
      const result = isEditing
        ? await updateVolunteer(editingId, payload)
        : await addVolunteer(payload);
      setActionNotice(
        result?.persisted
          ? { type: 'success', message: isEditing ? 'Volunteer updated successfully.' : 'Volunteer added successfully.' }
          : { type: 'warning', message: isEditing ? 'Volunteer updated locally.' : 'Volunteer added locally.' }
      );
      resetForm();
      setShowForm(false);
    } catch (error) {
      console.error('Failed to save volunteer', error);
      setFormError(isEditing ? 'Unable to update volunteer.' : 'Unable to add volunteer.');
      setActionNotice({ type: 'error', message: isEditing ? 'Unable to update volunteer.' : 'Unable to add volunteer.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Approve / reject only changes the existing "status" field via updateVolunteer.
  const handleStatusChange = async (volunteer, nextStatus) => {
    try {
      const result = await updateVolunteer(volunteer.id, { ...volunteer, status: nextStatus });
      const action = normalizeStatus(nextStatus) === 'approved' ? 'approved' : 'rejected';
      setActionNotice(
        result?.persisted
          ? { type: 'success', message: `Volunteer ${action}.` }
          : { type: 'warning', message: `Volunteer ${action} locally.` }
      );
      if (viewingVolunteer?.id === volunteer.id) {
        setViewingVolunteer((current) => (current ? { ...current, status: nextStatus } : current));
      }
    } catch (error) {
      console.error('Failed to update volunteer status', error);
      setActionNotice({
        type: 'error',
        message: `Unable to ${normalizeStatus(nextStatus) === 'approved' ? 'approve' : 'reject'} volunteer.`
      });
    }
  };

  const handleDelete = async (volunteer) => {
    try {
      const result = await deleteVolunteer(volunteer.id);
      setActionNotice(
        result?.persisted
          ? { type: 'success', message: 'Volunteer deleted successfully.' }
          : { type: 'warning', message: 'Volunteer deleted locally.' }
      );
    } catch (error) {
      console.error('Failed to delete volunteer', error);
      setActionNotice({ type: 'error', message: 'Unable to delete volunteer.' });
    }
  };

  const requestDelete = (volunteer) => {
    setActionNotice(null);
    setPendingDelete(volunteer);
  };

  return (
    <div className="module-page">
      <div className="module-header">
        <div className="module-title">
          <div className="module-icon" style={{ background: 'var(--gradient-purple)', color: 'white' }}>
            <Users size={24} />
          </div>
          <div>
            <h2>Volunteer Directory</h2>
            <p className="text-muted">Review applications, approve volunteers, and track your nationwide community of tech educators.</p>
          </div>
        </div>
        {isSuperadmin && (
          <button type="button" className="btn-primary" onClick={openCreateForm}>
            <Plus size={20} />
            Add Volunteer
          </button>
        )}
      </div>

      {actionNotice && (
        <div className={`action-notice ${actionNotice.type} animate-fade-in`} role={actionNotice.type === 'error' ? 'alert' : 'status'} aria-live={actionNotice.type === 'error' ? 'assertive' : 'polite'}>
          {actionNotice.type === 'success' ? <CheckCircle2 size={16} /> : actionNotice.type === 'warning' ? <Clock size={16} /> : <XCircle size={16} />}
          <span>{actionNotice.message}</span>
          <button type="button" className="notice-dismiss" onClick={() => setActionNotice(null)} aria-label="Dismiss notification">✕</button>
        </div>
      )}

      {pendingDelete && (
        <ConfirmationModal
          title="Delete volunteer?"
          message={`Delete "${pendingDelete.name || 'this volunteer'}"? This action cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { handleDelete(pendingDelete); setPendingDelete(null); }}
        />
      )}

      {/* ---- Volunteer Approval Queue ---- */}
      <section className="card approval-queue-card">
        <div className="volunteer-section-head">
          <div className="module-title">
            <div className="module-icon queue-module-icon">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <h3>Volunteer Approval Queue</h3>
              <p className="text-muted">Every volunteer grouped by their current status.</p>
            </div>
          </div>
        </div>
        <div className="approval-summary-grid">
          <div className="approval-summary-card summary-pending">
            <div className="approval-summary-icon"><Clock size={20} /></div>
            <div className="approval-summary-meta">
              <strong>{counts.pending}</strong>
              <span>Pending</span>
            </div>
          </div>
          <div className="approval-summary-card summary-approved">
            <div className="approval-summary-icon"><BadgeCheck size={20} /></div>
            <div className="approval-summary-meta">
              <strong>{counts.approved}</strong>
              <span>Approved</span>
            </div>
          </div>
          <div className="approval-summary-card summary-rejected">
            <div className="approval-summary-icon"><XCircle size={20} /></div>
            <div className="approval-summary-meta">
              <strong>{counts.rejected}</strong>
              <span>Rejected</span>
            </div>
          </div>
          <div className="approval-summary-card summary-active">
            <div className="approval-summary-icon"><CheckCircle2 size={20} /></div>
            <div className="approval-summary-meta">
              <strong>{counts.active}</strong>
              <span>Active</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Volunteer Ladder ---- */}
      <section className="card volunteer-ladder-card">
        <div className="volunteer-section-head">
          <div className="module-title">
            <div className="module-icon ladder-module-icon">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3>Volunteer Ladder</h3>
              <p className="text-muted">Volunteers climb from Pending → Approved → Active as they are onboarded.</p>
            </div>
          </div>
        </div>

        <div className="volunteer-ladder">
          <div className="ladder-track">
            <div className={`ladder-step ladder-step-active ${activeReached ? 'is-reached' : ''}`}>
              <div className="ladder-step-icon"><CheckCircle2 size={22} /></div>
              <div className="ladder-step-meta">
                <strong>Active</strong>
                <span>{counts.active} volunteer{counts.active === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div className={`ladder-connector ${activeReached ? 'is-active-path' : ''}`} aria-hidden="true">
              <span className="ladder-rung" />
              <span className="ladder-rung" />
              <span className="ladder-rung" />
            </div>
            <div className={`ladder-step ladder-step-approved ${approvedReached ? 'is-reached' : ''}`}>
              <div className="ladder-step-icon"><BadgeCheck size={22} /></div>
              <div className="ladder-step-meta">
                <strong>Approved</strong>
                <span>{counts.approved} volunteer{counts.approved === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div className={`ladder-connector ${approvedReached ? 'is-approved-path' : ''}`} aria-hidden="true">
              <span className="ladder-rung" />
              <span className="ladder-rung" />
              <span className="ladder-rung" />
            </div>
            <div className={`ladder-step ladder-step-pending ${pendingReached ? 'is-reached' : ''}`}>
              <div className="ladder-step-icon"><Clock size={22} /></div>
              <div className="ladder-step-meta">
                <strong>Pending</strong>
                <span>{counts.pending} volunteer{counts.pending === 1 ? '' : 's'}</span>
              </div>
            </div>
          </div>

          <aside className="ladder-side">
            <div className="ladder-rejected">
              <XCircle size={16} />
              <span><strong>{counts.rejected}</strong> rejected</span>
            </div>
            {counts.all === 0 && (
              <p className="ladder-empty">No volunteers yet — add volunteers or new applications to populate the ladder.</p>
            )}
          </aside>
        </div>

        <p className="ladder-note">
          <Info size={14} />
          <span>Ladder positions and progress are derived from each volunteer’s existing status. No extra data or percentages are stored.</span>
        </p>
      </section>

      {/* ---- Add / Edit volunteer form ---- */}
      {isSuperadmin && showForm && (
        <>
          <div className="volunteer-form-modal-overlay" onClick={closeForm} />
          <div className="volunteer-form-modal-container">
        <div className="volunteer-form-shell animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="volunteer-form-title">
          <section className="card volunteer-form-card">
            <div className="volunteer-form-header">
              <div className="volunteer-form-icon"><UserRound size={22} /></div>
              <div>
                <h3 id="volunteer-form-title">{editingId ? 'Edit Volunteer' : 'Add New Volunteer'}</h3>
                <p>{editingId ? `Updating ${form.name || 'volunteer'}’s directory record.` : 'Fill in the details below to add a new volunteer to the directory.'}</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="volunteer-form-grid" aria-describedby={formError ? 'volunteer-form-error' : undefined}>
              <div className="volunteer-field volunteer-name-field">
                <label htmlFor="volunteer-name">Full Name <span aria-hidden="true">*</span></label>
                <div className="field-with-icon">
                  <UserRound size={18} aria-hidden="true" />
                  <input id="volunteer-name" className="border-input" type="text" placeholder="e.g. Juan Dela Cruz" value={form.name} onChange={(e) => { setFormError(''); setForm({ ...form, name: e.target.value }); }} disabled={isSubmitting} aria-invalid={Boolean(formError)} required />
                </div>
                <small>Enter the volunteer’s full name.</small>
              </div>
              <div className="volunteer-field">
                <label htmlFor="volunteer-role">Role <span aria-hidden="true">*</span></label>
                <select id="volunteer-role" className="border-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={isSubmitting}>
                  <option>Lead Instructor</option>
                  <option>Assistant</option>
                  <option>Event Coordinator</option>
                </select>
                <small>Choose the volunteer’s primary role.</small>
              </div>
              <div className="volunteer-field">
                <label htmlFor="volunteer-chapter">Chapter <span aria-hidden="true">*</span></label>
                <select id="volunteer-chapter" className="border-input" value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value })} disabled={isSubmitting}>
                  <option>Manila</option>
                  <option>Cebu</option>
                  <option>Davao</option>
                </select>
                <small>Select the chapter the volunteer belongs to.</small>
              </div>
              <div className="volunteer-field">
                <label htmlFor="volunteer-status">Status <span aria-hidden="true">*</span></label>
                <select id="volunteer-status" className="border-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} disabled={isSubmitting}>
                  <option>Pending</option>
                  <option>Approved</option>
                  <option>Rejected</option>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
                <small>Pending volunteers appear in the approval queue.</small>
              </div>
              <div className="volunteer-form-actions">
                <button type="button" className="btn-secondary" onClick={resetForm} disabled={isSubmitting}><RotateCcw size={16} /> Reset</button>
                <div>
                  <button type="button" className="btn-secondary" onClick={closeForm} disabled={isSubmitting}><X size={16} /> Cancel</button>
                  <button type="submit" className="btn-primary" disabled={isSubmitting}><Save size={16} /> {isSubmitting ? 'Saving...' : editingId ? 'Update Volunteer' : 'Save Volunteer'}</button>
                </div>
              </div>
              {formError && <p id="volunteer-form-error" className="volunteer-form-error" role="alert">{formError}</p>}
            </form>
          </section>
          <aside className="volunteer-form-tips">
            <h4>TIPS</h4>
            <p>Adding complete information helps the team collaborate better.</p>
            <ul>
              <li>Ensure the name is spelled correctly.</li>
              <li>Select the correct chapter.</li>
              <li>Pending volunteers can be approved or rejected from the queue.</li>
            </ul>
            <div><strong>Privacy &amp; Access</strong><span>Volunteer information is visible to authorized admins and moderators.</span></div>
          </aside>
        </div>
          </div>
        </>
      )}

      {/* ---- Volunteer directory table ---- */}
      <div className="card list-container">
        <div className="list-toolbar">
          <div className="volunteer-toolbar-row">
            <div className="search-bar border-input">
              <Search size={18} className="search-icon" />
              <label className="sr-only" htmlFor="volunteer-search">Search volunteers</label>
              <input id="volunteer-search" type="text" placeholder="Search volunteers by name..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
            </div>
            <div className="status-filter-tabs" role="group" aria-label="Filter volunteers by status">
              {STATUS_FILTERS.map((filter) => (
                <button key={filter} type="button" className={`filter-tab ${statusFilter === filter ? 'active' : ''}`} onClick={() => { setStatusFilter(filter); setCurrentPage(1); }} aria-pressed={statusFilter === filter}>
                  {filter}
                  <span className="filter-count">{counts[filter.toLowerCase()]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table volunteer-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Chapter</th>
                <th>Role</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Joined Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedVolunteers.map((volunteer) => {
                const statusKey = normalizeStatus(volunteer.status) || 'inactive';
                const isPending = statusKey === 'pending';
                const joined = formatJoinedDate(getJoinedDate(volunteer));
                return (
                  <tr key={volunteer.id}>
                    <td>
                      <div className="user-cell">
                        <div className="avatar small-avatar">{(volunteer.name || '?').charAt(0)}</div>
                        <span className="font-medium">{volunteer.name}</span>
                      </div>
                    </td>
                    <td><span className="chapter-badge">{volunteer.chapter || '—'}</span></td>
                    <td>{volunteer.role || '—'}</td>
                    <td><LadderProgress status={volunteer.status} /></td>
                    <td><span className={`status-badge ${statusKey}`}>{volunteer.status || '—'}</span></td>
                    <td className="joined-date">{joined || '—'}</td>
                    <td>
                      <div className="volunteer-actions">
                        <button type="button" className="icon-btn action-btn" onClick={() => setViewingVolunteer(volunteer)} title={`View ${volunteer.name || 'volunteer'}`}>
                          <Eye size={18} color="#6B7280" />
                        </button>
                        {isPending && isSuperadmin && (
                          <>
                            <button type="button" className="action-pill approve-pill" onClick={() => handleStatusChange(volunteer, 'Approved')} title={`Approve ${volunteer.name || 'volunteer'}`}>
                              <Check size={14} /> Approve
                            </button>
                            <button type="button" className="action-pill reject-pill" onClick={() => handleStatusChange(volunteer, 'Rejected')} title={`Reject ${volunteer.name || 'volunteer'}`}>
                              <X size={14} /> Reject
                            </button>
                          </>
                        )}
                        {isSuperadmin && (
                          <>
                            <button type="button" className="icon-btn action-btn" onClick={() => openEditForm(volunteer)} title="Edit">
                              <PencilLine size={18} color="#8B5CF6" />
                            </button>
                            <button type="button" className="icon-btn action-btn" onClick={() => requestDelete(volunteer)} title="Delete">
                              <Trash2 size={18} color="#DC2626" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-state">
                    {(volunteersList || []).length === 0
                      ? 'No volunteers found. Make sure to add one!'
                      : `No volunteers ${statusFilter === 'All' ? '' : `with ${statusFilter.toLowerCase()} status `}match this filter.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <nav className="volunteer-pagination" aria-label="Volunteer pagination">
            <button type="button" className="volunteer-pagination-button" onClick={() => setCurrentPage(activePage - 1)} disabled={activePage === 1}>Previous</button>
            <div className="volunteer-pagination-pages">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button key={page} type="button" className={`volunteer-pagination-page ${page === activePage ? 'active' : ''}`} onClick={() => setCurrentPage(page)} aria-current={page === activePage ? 'page' : undefined}>{page}</button>
              ))}
            </div>
            <button type="button" className="volunteer-pagination-button" onClick={() => setCurrentPage(activePage + 1)} disabled={activePage === totalPages}>Next</button>
          </nav>
        )}
      </div>

      {/* ---- Volunteer details modal ---- */}
      {viewingVolunteer && (
        <>
          <div className="volunteer-modal-overlay" onClick={() => setViewingVolunteer(null)} />
          <div className="volunteer-modal-container">
            <div className="volunteer-modal card" role="dialog" aria-modal="true" aria-labelledby="volunteer-detail-title">
              <div className="volunteer-modal-header">
                <div className="volunteer-modal-avatar">{(viewingVolunteer.name || '?').charAt(0)}</div>
                <div className="volunteer-modal-title">
                  <h3 id="volunteer-detail-title">{viewingVolunteer.name || 'Volunteer'}</h3>
                  <p className="text-muted">
                    {viewingVolunteer.role || 'Volunteer'}
                    {viewingVolunteer.chapter ? ` • ${viewingVolunteer.chapter}` : ''}
                  </p>
                </div>
                <span className={`status-badge ${normalizeStatus(viewingVolunteer.status) || 'inactive'}`}>{viewingVolunteer.status || '—'}</span>
                <button type="button" className="modal-close-btn" onClick={() => setViewingVolunteer(null)} aria-label="Close details">✕</button>
              </div>

              <div className="volunteer-modal-body">
                <div className="volunteer-detail-grid">
                  <div className="volunteer-detail-item"><span>Role</span><strong>{viewingVolunteer.role || '—'}</strong></div>
                  <div className="volunteer-detail-item"><span>Chapter</span><strong>{viewingVolunteer.chapter || '—'}</strong></div>
                  <div className="volunteer-detail-item"><span>Status</span><strong>{viewingVolunteer.status || '—'}</strong></div>
                  <div className="volunteer-detail-item"><span>Joined date</span><strong>{formatJoinedDate(getJoinedDate(viewingVolunteer)) || '—'}</strong></div>
                  {viewingVolunteer.email && (
                    <div className="volunteer-detail-item"><span>Email</span><strong>{viewingVolunteer.email}</strong></div>
                  )}
                </div>

                <div className="volunteer-modal-progress">
                  <span className="volunteer-modal-progress-label">Ladder progress</span>
                  <LadderProgress status={viewingVolunteer.status} />
                </div>
              </div>

              <div className="volunteer-modal-actions">
                {normalizeStatus(viewingVolunteer.status) === 'pending' && isSuperadmin && (
                  <>
                    <button type="button" className="btn-primary approve-cta" onClick={() => handleStatusChange(viewingVolunteer, 'Approved')}>
                      <Check size={16} /> Approve
                    </button>
                    <button type="button" className="btn-secondary reject-cta" onClick={() => handleStatusChange(viewingVolunteer, 'Rejected')}>
                      <X size={16} /> Reject
                    </button>
                  </>
                )}
                <button type="button" className="btn-secondary" onClick={() => setViewingVolunteer(null)}>Close</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
