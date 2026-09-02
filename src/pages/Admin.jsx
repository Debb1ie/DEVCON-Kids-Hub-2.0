import { useState } from 'react';
import { useApp } from '../context/AppState';
import { Users, Package, ShieldCheck, Download, LogIn, UserPlus, Boxes } from 'lucide-react';
import './Admin.css';

export default function Admin() {
  const { volunteersList, inventoryList, addVolunteer, addInventoryItem, user, loginWithGoogle } = useApp();

  const [volunteerForm, setVolunteerForm] = useState({ name: '', email: '' });
  const [inventoryForm, setInventoryForm] = useState({ name: '', quantity: 1 });
  const [isAddingVolunteer, setIsAddingVolunteer] = useState(false);
  const [isAddingInventory, setIsAddingInventory] = useState(false);
  const [volunteerError, setVolunteerError] = useState('');
  const [inventoryError, setInventoryError] = useState('');

  const handleVolunteerSubmit = async (e) => {
    e.preventDefault();
    setVolunteerError('');
    setIsAddingVolunteer(true);

    try {
      await addVolunteer({ ...volunteerForm });
      setVolunteerForm({ name: '', email: '' });
    } catch (err) {
      console.error('Failed to add volunteer', err);
      setVolunteerError('Unable to add the volunteer. Please try again.');
    } finally {
      setIsAddingVolunteer(false);
    }
  };

  const handleInventorySubmit = async (e) => {
    e.preventDefault();
    const quantity = Number(inventoryForm.quantity);

    if (!Number.isInteger(quantity) || quantity < 1) {
      setInventoryError('Enter a whole quantity of at least 1.');
      return;
    }

    setInventoryError('');
    setIsAddingInventory(true);

    try {
      await addInventoryItem({ ...inventoryForm, quantity });
      setInventoryForm({ name: '', quantity: 1 });
    } catch (err) {
      console.error('Failed to add inventory item', err);
      setInventoryError('Unable to add the inventory item. Please try again.');
    } finally {
      setIsAddingInventory(false);
    }
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
        <section className="admin-section card">
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
              <label htmlFor="volunteer-name">Name</label>
              <input
                id="volunteer-name"
                type="text"
                placeholder="Volunteer name"
                value={volunteerForm.name}
                onChange={(e) => {
                  setVolunteerError('');
                  setVolunteerForm((v) => ({ ...v, name: e.target.value }));
                }}
                disabled={isAddingVolunteer}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="volunteer-email">Email</label>
              <input
                id="volunteer-email"
                type="email"
                placeholder="Volunteer email"
                value={volunteerForm.email}
                onChange={(e) => {
                  setVolunteerError('');
                  setVolunteerForm((v) => ({ ...v, email: e.target.value }));
                }}
                disabled={isAddingVolunteer}
                required
              />
            </div>
            <div className="form-actions inline-actions">
              <button className="btn-primary" type="submit" disabled={isAddingVolunteer}>
                <UserPlus size={18} /> {isAddingVolunteer ? 'Adding...' : 'Add Volunteer'}
              </button>
            </div>
            {volunteerError && <p className="form-feedback" role="alert">{volunteerError}</p>}
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
              <label htmlFor="inventory-name">Item name</label>
              <input
                id="inventory-name"
                type="text"
                placeholder="Inventory item"
                value={inventoryForm.name}
                onChange={(e) => {
                  setInventoryError('');
                  setInventoryForm((v) => ({ ...v, name: e.target.value }));
                }}
                disabled={isAddingInventory}
                required
              />
            </div>
            <div className="field field-compact">
              <label htmlFor="inventory-quantity">Quantity</label>
              <input
                id="inventory-quantity"
                type="number"
                min="1"
                step="1"
                placeholder="1"
                value={inventoryForm.quantity}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || Number(value) >= 1) {
                    setInventoryError('');
                    setInventoryForm((v) => ({ ...v, quantity: value }));
                  }
                }}
                disabled={isAddingInventory}
                aria-invalid={inventoryError === 'Enter a whole quantity of at least 1.'}
                aria-describedby={inventoryError === 'Enter a whole quantity of at least 1.' ? 'inventory-form-error' : undefined}
                required
              />
            </div>
            <div className="form-actions inline-actions">
              <button className="btn-primary" type="submit" disabled={isAddingInventory}>
                <Package size={18} /> {isAddingInventory ? 'Adding...' : 'Add Item'}
              </button>
            </div>
            {inventoryError && <p id="inventory-form-error" className="form-feedback" role="alert">{inventoryError}</p>}
          </form>
        </section>
      </div>
    </div>
  );
}
