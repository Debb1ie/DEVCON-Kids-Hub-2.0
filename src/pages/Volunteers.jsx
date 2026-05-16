import React, { useState } from 'react';
import { useApp } from '../context/AppState';
import { Users, Search, Plus, Trash2, PencilLine } from 'lucide-react';
import './Volunteers.css';

export default function Volunteers() {
  const { volunteersList, addVolunteer, updateVolunteer, deleteVolunteer, isSuperadmin } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    role: 'Lead Instructor',
    chapter: 'Manila',
    status: 'Active'
  });

  const openCreateForm = () => {
    setEditingId(null);
    setForm({ name: '', role: 'Lead Instructor', chapter: 'Manila', status: 'Active' });
    setShowForm(true);
  };

  const openEditForm = (volunteer) => {
    setEditingId(volunteer.id);
    setForm({
      name: volunteer.name || '',
      role: volunteer.role || 'Lead Instructor',
      chapter: volunteer.chapter || 'Manila',
      status: volunteer.status || 'Active'
    });
    setShowForm(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      updateVolunteer(editingId, form);
    } else {
      addVolunteer(form);
    }

    setEditingId(null);
    setForm({ name: '', role: 'Lead Instructor', chapter: 'Manila', status: 'Active' });
    setShowForm(false);
  };

  const filtered = volunteersList?.filter((volunteer) => volunteer.name.toLowerCase().includes(searchTerm.toLowerCase())) || [];

  return (
    <div className="module-page">
      <div className="module-header">
        <div className="module-title">
          <div className="module-icon" style={{ background: 'var(--gradient-purple)', color: 'white' }}>
            <Users size={24} />
          </div>
          <div>
            <h2>Volunteer Directory</h2>
            <p className="text-muted">Manage your nationwide community of tech educators.</p>
          </div>
        </div>
        {isSuperadmin && (
          <button className="btn-primary" onClick={openCreateForm}>
            <Plus size={20} />
            Add Volunteer
          </button>
        )}
      </div>

      {isSuperadmin && showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '1rem' }}>
          <h3>{editingId ? 'Edit Volunteer' : 'Add New Volunteer'}</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <input 
              className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px' }}
              placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required 
            />
            <select className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px' }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option>Lead Instructor</option>
              <option>Assistant</option>
              <option>Event Coordinator</option>
            </select>
            <select className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px' }} value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value })}>
              <option>Manila</option>
              <option>Cebu</option>
              <option>Davao</option>
            </select>
            <select className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px' }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            <button type="submit" className="btn-primary">{editingId ? 'Update Volunteer' : 'Save Volunteer'}</button>
          </form>
        </div>
      )}

      <div className="card list-container">
        <div className="list-toolbar">
          <div className="search-bar border-input">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search volunteers by name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Chapter</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((volunteer) => (
                <tr key={volunteer.id}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar small-avatar">{volunteer.name.charAt(0)}</div>
                      <span className="font-medium">{volunteer.name}</span>
                    </div>
                  </td>
                  <td>{volunteer.role}</td>
                  <td>
                    <span className="chapter-badge">{volunteer.chapter}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${(volunteer.status || 'active').toLowerCase()}`}>{volunteer.status}</span>
                  </td>
                  <td>
                    {isSuperadmin && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="icon-btn action-btn" onClick={() => openEditForm(volunteer)} title="Edit">
                          <PencilLine size={18} color="#8B5CF6" />
                        </button>
                        <button className="icon-btn action-btn" onClick={() => deleteVolunteer(volunteer.id)} title="Delete">
                          <Trash2 size={18} color="#DC2626" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-state">No volunteers found. Make sure to add one!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
