import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppState';
import { CalendarDays, FolderKanban, Image as ImageIcon, PencilLine, Plus, Trash2, FolderOpen } from 'lucide-react';
import './Events.css';

const emptyForm = {
  title: 'Hour of AI',
  type: 'Cycle Program',
  chapter: 'Manila',
  coordinator: 'Program Coordinators',
  event_date: '',
  description: '',
  image_url: '',
  status: 'Scheduled'
};

const buildFolderPreview = (title) => {
  const folderName = (title || 'New Event').trim() || 'New Event';
  return {
    folderPath: `Google Drive/DEVCON Kids/Events/${folderName}`,
    assetsPath: `Google Drive/DEVCON Kids/Events/${folderName}/Assets`
  };
};

export default function Events() {
  const { eventsList, addEvent, updateEvent, deleteEvent, isSuperadmin } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState(emptyForm);

  const featuredEvent = useMemo(
    () => eventsList?.find((event) => (event.title || '').toLowerCase().includes('hour of ai')) || eventsList?.[0],
    [eventsList]
  );

  const filteredEvents = eventsList?.filter((event) => {
    const searchBlob = `${event.title} ${event.type} ${event.chapter} ${event.coordinator} ${event.description}`.toLowerCase();
    return searchBlob.includes(searchTerm.toLowerCase());
  }) || [];

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (event) => {
    setEditingId(event.id);
    setForm({
      title: event.title || '',
      type: event.type || 'Cycle Program',
      chapter: event.chapter || 'Manila',
      coordinator: event.coordinator || 'Program Coordinators',
      event_date: event.event_date || '',
      description: event.description || '',
      image_url: event.image_url || '',
      status: event.status || 'Scheduled'
    });
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const folderPreview = buildFolderPreview(form.title);
    const payload = {
      ...form,
      google_folder_name: form.title.trim(),
      google_folder_path: folderPreview.folderPath,
      google_assets_path: folderPreview.assetsPath,
      google_folder_status: 'Ready for Google Drive sync'
    };

    if (editingId) {
      updateEvent(editingId, payload);
    } else {
      addEvent(payload);
    }

    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <div className="module-page events-page">
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
          <button className="btn-primary" onClick={openCreateForm}>
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

      {isSuperadmin && showForm && (
        <div className="card animate-fade-in event-form-card">
          <div className="event-form-header">
            <div>
              <h3>{editingId ? 'Edit Event / CodeCamp' : 'Create Event / CodeCamp'}</h3>
              <p className="text-muted">The folder path is generated automatically from the event name.</p>
            </div>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Close</button>
          </div>

          <form onSubmit={handleSubmit} className="event-form-grid">
            <div className="form-group">
              <label>Event Name</label>
              <input className="border-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select className="border-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option>Cycle Program</option>
                <option>CodeCamp</option>
                <option>Workshop</option>
                <option>Community Event</option>
              </select>
            </div>
            <div className="form-group">
              <label>Chapter</label>
              <input className="border-input" value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Coordinator</label>
              <input className="border-input" value={form.coordinator} onChange={(e) => setForm({ ...form, coordinator: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Event Date</label>
              <input type="date" className="border-input" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="border-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Scheduled</option>
                <option>Ongoing</option>
                <option>Completed</option>
                <option>Draft</option>
              </select>
            </div>
            <div className="form-group full-width">
              <label>Image URL</label>
              <input className="border-input" placeholder="https://example.com/event-image.jpg" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            </div>
            <div className="form-group full-width">
              <label>Description / Caption</label>
              <textarea className="border-input" rows="4" placeholder="Summarize the event for admin, coordinators, and social publishing." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="folder-preview full-width">
              <div>
                <span>Google folder</span>
                <strong>{buildFolderPreview(form.title).folderPath}</strong>
              </div>
              <div>
                <span>Assets folder</span>
                <strong>{buildFolderPreview(form.title).assetsPath}</strong>
              </div>
            </div>
            <button type="submit" className="btn-primary full-width-submit">
              {editingId ? 'Update Event' : 'Save Event'}
            </button>
          </form>
        </div>
      )}

      <div className="card list-container">
        <div className="list-toolbar event-toolbar">
          <div className="search-bar border-input">
            <FolderKanban size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search events, coordinators, or folders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="events-grid">
          {filteredEvents.map((event) => (
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
                <span className="event-status-pill">{event.status || 'Draft'}</span>
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
                    <button className="btn-secondary small-action" onClick={() => openEditForm(event)}>
                      <PencilLine size={16} />
                      Edit
                    </button>
                    <button className="btn-secondary small-action danger" onClick={() => deleteEvent(event.id)}>
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}

          {filteredEvents.length === 0 && (
            <div className="empty-state card" style={{ gridColumn: '1 / -1' }}>
              <CalendarDays size={48} color="#9ca3af" style={{ margin: '0 auto 1rem' }} />
              <h3>No events found</h3>
              <p className="text-muted">Create Hour of AI or another codecamp to generate its folder blueprint.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}