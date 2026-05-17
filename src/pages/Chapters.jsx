import React, { useState } from 'react';
import { useApp } from '../context/AppState';
import { MapPin, ArrowRight, Plus, PencilLine, Trash2 } from 'lucide-react';
import './Chapters.css';

export default function Chapters() {
  const { chapters, addChapter, updateChapter, deleteChapter, isSuperadmin } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [form, setForm] = useState({
    name: '',
    learners: 0,
    workshops: 0,
    completion: 0,
    color: '#8B5CF6'
  });

  const openCreateForm = () => {
    setEditingId(null);
    setForm({ name: '', learners: 0, workshops: 0, completion: 0, color: '#8B5CF6' });
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
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      learners: Number(form.learners),
      workshops: Number(form.workshops),
      completion: Number(form.completion)
    };

    if (editingId) {
      updateChapter(editingId, payload);
    } else {
      addChapter(payload);
    }

    setEditingId(null);
    setForm({ name: '', learners: 0, workshops: 0, completion: 0, color: '#8B5CF6' });
    setShowForm(false);
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
          <button className="btn-primary" onClick={openCreateForm}>
            <Plus size={20} />
            Add Chapter
          </button>
        )}
      </div>

      {isSuperadmin && showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '1rem' }}>
          <h3>{editingId ? 'Edit Chapter' : 'Add New Chapter'}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <input className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px' }} placeholder="Chapter Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px', width: '120px' }} type="number" placeholder="Learners" value={form.learners} onChange={(e) => setForm({ ...form, learners: e.target.value })} min="0" />
            <input className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px', width: '120px' }} type="number" placeholder="Workshops" value={form.workshops} onChange={(e) => setForm({ ...form, workshops: e.target.value })} min="0" />
            <input className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px', width: '120px' }} type="number" placeholder="Completion" value={form.completion} onChange={(e) => setForm({ ...form, completion: e.target.value })} min="0" max="100" />
            <input className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px', width: '150px' }} type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            <button type="submit" className="btn-primary">{editingId ? 'Update Chapter' : 'Save Chapter'}</button>
          </form>
        </div>
      )}

      {selectedChapter && (
        <div className="card animate-fade-in" style={{ marginBottom: '1rem', padding: '2rem', borderLeft: `4px solid ${selectedChapter.color}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>{selectedChapter.name} - Chapter Details</h2>
            <button onClick={() => setSelectedChapter(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
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
        {chapters.map((chapter) => (
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

            <button className="btn-secondary full-width chapter-action" onClick={() => setSelectedChapter(chapter)}>
              View Chapter Details <ArrowRight size={16} />
            </button>

            {isSuperadmin && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-secondary full-width chapter-action" onClick={() => openEditForm(chapter)}>
                  <PencilLine size={16} /> Edit
                </button>
                <button className="btn-secondary full-width chapter-action" onClick={() => deleteChapter(chapter.id)} style={{ borderColor: '#DC2626', color: '#DC2626' }}>
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
