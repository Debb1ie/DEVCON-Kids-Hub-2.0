import React, { useState } from 'react';
import { useApp } from '../context/AppState';
import './Dashboard.css';

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

  return (
    <div className="page admin-page">
      <h1>Admin Dashboard</h1>

      <section className="admin-section">
        <h2>Profile</h2>
        {user ? (
          <div>
            <p><strong>Name:</strong> {user.name || user.email}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>ID:</strong> {user.id}</p>
          </div>
        ) : (
          <div>
            <p>Not signed in.</p>
            <button className="btn-primary" onClick={loginWithGoogle}>Sign in with Google</button>
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2>Volunteers</h2>
        <form onSubmit={handleVolunteerSubmit} className="simple-form">
          <input placeholder="Name" value={volunteerForm.name} onChange={e => setVolunteerForm(v => ({ ...v, name: e.target.value }))} required />
          <input placeholder="Email" value={volunteerForm.email} onChange={e => setVolunteerForm(v => ({ ...v, email: e.target.value }))} required />
          <button className="btn-primary" type="submit">Add Volunteer</button>
        </form>
        <button onClick={() => exportToExcel(volunteersList, 'volunteers.xlsx')} className="btn-secondary">Export Volunteers to Excel</button>
      </section>

      <section className="admin-section">
        <h2>Inventory</h2>
        <form onSubmit={handleInventorySubmit} className="simple-form">
          <input placeholder="Item name" value={inventoryForm.name} onChange={e => setInventoryForm(v => ({ ...v, name: e.target.value }))} required />
          <input type="number" min="1" placeholder="Quantity" value={inventoryForm.quantity} onChange={e => setInventoryForm(v => ({ ...v, quantity: Number(e.target.value) }))} required />
          <button className="btn-primary" type="submit">Add Item</button>
        </form>
        <button onClick={() => exportToExcel(inventoryList, 'inventory.xlsx')} className="btn-secondary">Export Inventory to Excel</button>
      </section>
    </div>
  );
}
