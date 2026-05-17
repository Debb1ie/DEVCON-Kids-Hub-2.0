import React, { useState } from 'react';
import { useApp } from '../context/AppState';
import { Users, Package, ShieldCheck, Download, LogIn, UserPlus, Boxes } from 'lucide-react';
import './Admin.css';

export default function Admin() {
  const { volunteersList, inventoryList, addVolunteer, addInventoryItem, user, loginWithGoogle } = useApp();

  const [volunteerForm, setVolunteerForm] = useState({ name: '', email: '' });
  const [inventoryForm, setInventoryForm] = useState({ name: '', quantity: 1 });

  const handleVolunteerSubmit = async (e) => {
    e.preventDefault();
    await addVolunteer({ ...volunteerForm });
    setVolunteerForm({ name: '', email: '' });
  };

  const handleInventorySubmit = async (e) => {
    e.preventDefault();
    await addInventoryItem({ ...inventoryForm });
    setInventoryForm({ name: '', quantity: 1 });
  };

  const exportToExcel = async (data, filename = 'export.xlsx') => {
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(data || []);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Failed to export to Excel', err);
      alert('Export failed. See console for details.');
    }
  };

  const totalInventoryStock = inventoryList?.reduce((acc, item) => acc + (item.stock || 0), 0) || 0;

  return (
    <div className="admin-page">
      <div className="admin-hero card">
        <div>
          <div className="eyebrow admin-eyebrow">
            <ShieldCheck size={14} /> Operations console
          </div>
          <h1>Admin Dashboard</h1>
          <p>Manage volunteers, inventory, and account access from one organized workspace.</p>
        </div>
        <div className="admin-hero-stats">
          <div className="admin-stat">
            <Users size={18} />
            <div>
              <strong>{volunteersList?.length || 0}</strong>
              <span>Volunteers</span>
            </div>
          </div>
          <div className="admin-stat">
            <Boxes size={18} />
            <div>
              <strong>{inventoryList?.length || 0}</strong>
              <span>Inventory types</span>
            </div>
          </div>
          <div className="admin-stat">
            <Package size={18} />
            <div>
              <strong>{totalInventoryStock}</strong>
              <span>Total units</span>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-grid">
        <section className="admin-section card profile-card">
          <h2>Profile</h2>
          {user ? (
            <div className="profile-details">
              <p><strong>Name</strong><span>{user.name || user.email}</span></p>
              <p><strong>Email</strong><span>{user.email}</span></p>
              <p><strong>ID</strong><span>{user.id}</span></p>
            </div>
          ) : (
            <div className="empty-profile">
              <p>Not signed in.</p>
              <button className="btn-primary" onClick={loginWithGoogle} type="button">
                <LogIn size={18} /> Sign in with Google
              </button>
            </div>
          )}
        </section>

        <section className="admin-section card">
          <div className="section-head">
            <h2>Volunteers</h2>
            <button onClick={() => exportToExcel(volunteersList, 'volunteers.xlsx')} className="btn-secondary" type="button">
              <Download size={16} /> Export
            </button>
          </div>

          <form onSubmit={handleVolunteerSubmit} className="admin-form-grid">
            <div className="field">
              <label>Name</label>
              <input
                type="text"
                placeholder="Volunteer name"
                value={volunteerForm.name}
                onChange={(e) => setVolunteerForm((v) => ({ ...v, name: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                placeholder="Volunteer email"
                value={volunteerForm.email}
                onChange={(e) => setVolunteerForm((v) => ({ ...v, email: e.target.value }))}
                required
              />
            </div>
            <div className="form-actions inline-actions">
              <button className="btn-primary" type="submit">
                <UserPlus size={18} /> Add Volunteer
              </button>
            </div>
          </form>
        </section>

        <section className="admin-section card">
          <div className="section-head">
            <h2>Inventory</h2>
            <button onClick={() => exportToExcel(inventoryList, 'inventory.xlsx')} className="btn-secondary" type="button">
              <Download size={16} /> Export
            </button>
          </div>

          <form onSubmit={handleInventorySubmit} className="admin-form-grid inventory-grid">
            <div className="field field-wide">
              <label>Item name</label>
              <input
                type="text"
                placeholder="Inventory item"
                value={inventoryForm.name}
                onChange={(e) => setInventoryForm((v) => ({ ...v, name: e.target.value }))}
                required
              />
            </div>
            <div className="field field-compact">
              <label>Quantity</label>
              <input
                type="number"
                min="1"
                placeholder="1"
                value={inventoryForm.quantity}
                onChange={(e) => setInventoryForm((v) => ({ ...v, quantity: Number(e.target.value) }))}
                required
              />
            </div>
            <div className="form-actions inline-actions">
              <button className="btn-primary" type="submit">
                <Package size={18} /> Add Item
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}