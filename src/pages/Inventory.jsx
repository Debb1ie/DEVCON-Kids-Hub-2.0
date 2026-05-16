import React, { useState } from 'react';
import { useApp } from '../context/AppState';
import { Package, AlertCircle, CheckCircle, Search, Plus, Trash2, Image as ImageIcon, PencilLine } from 'lucide-react';
import './Inventory.css';

export default function Inventory() {
  const { inventoryList, addInventoryItem, updateInventoryItem, deleteInventoryItem, isSuperadmin } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Robotics');
  const [stock, setStock] = useState(1);
  const [imageUrl, setImageUrl] = useState('');

  const openCreateForm = () => {
    setEditingId(null);
    setName('');
    setCategory('Robotics');
    setStock(1);
    setImageUrl('');
    setShowForm(true);
  };

  const openEditForm = (item) => {
    setEditingId(item.id);
    setName(item.name || '');
    setCategory(item.category || 'Robotics');
    setStock(item.stock ?? 1);
    setImageUrl(item.image_url || '');
    setShowForm(true);
  };

  const handleAdd = (e) => {
    e.preventDefault();
    const status = stock > 10 ? 'In Stock' : stock > 0 ? 'Low Stock' : 'Out of Stock';
    const payload = { name, category, stock: parseInt(stock), status, image_url: imageUrl };

    if (editingId) {
      updateInventoryItem(editingId, payload);
    } else {
      addInventoryItem(payload);
    }

    setName('');
    setImageUrl('');
    setStock(1);
    setCategory('Robotics');
    setEditingId(null);
    setShowForm(false);
  };

  const filtered = inventoryList?.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase())) || [];

  return (
    <div className="module-page">
      <div className="module-header">
        <div className="module-title">
          <div className="module-icon" style={{ background: 'var(--accent-green)', color: 'white' }}>
            <Package size={24} />
          </div>
          <div>
            <h2>Inventory Management</h2>
            <p className="text-muted">Track and request hardware and materials for workshops.</p>
          </div>
        </div>
        {isSuperadmin && (
          <button className="btn-primary" onClick={openCreateForm}>
            <Plus size={20} />
            Add Item
          </button>
        )}
      </div>

      {isSuperadmin && showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '1rem' }}>
          <h3>{editingId ? 'Edit Inventory Item' : 'Add New Inventory Item'}</h3>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <input 
              className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px', flex: 1 }}
              placeholder="Item Name" value={name} onChange={(e) => setName(e.target.value)} required 
            />
            <select className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px' }} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>Robotics</option>
              <option>Microcontrollers</option>
              <option>Computers</option>
              <option>Electronics</option>
              <option>Swag</option>
            </select>
            <input 
              type="number" className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px', width: '100px' }}
              placeholder="Stock" value={stock} onChange={(e) => setStock(e.target.value)} required min="0"
            />
            <input 
              className="border-input" style={{ padding: '0.5rem 1rem', borderRadius: '8px', flex: 1 }}
              placeholder="Image URL (optional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
            />
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px dashed rgba(0,0,0,0.12)', borderRadius: '12px' }}>
              {imageUrl ? (
                <img src={imageUrl} alt={name || 'Inventory preview'} style={{ width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ImageIcon size={22} color="#9ca3af" />
                </div>
              )}
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Image holder preview for admin and coordinators.</span>
            </div>
            <button type="submit" className="btn-primary">{editingId ? 'Update Item' : 'Save Item'}</button>
          </form>
        </div>
      )}

      <div className="inventory-stats">
        <div className="card stat-card">
          <h4>Total Items</h4>
          <h2>{inventoryList?.reduce((acc, curr) => acc + curr.stock, 0) || 0}</h2>
        </div>
        <div className="card stat-card warning">
          <h4>Low Stock Types</h4>
          <h2>{inventoryList?.filter((item) => item.status === 'Low Stock').length || 0}</h2>
        </div>
        <div className="card stat-card danger">
          <h4>Out of Stock Types</h4>
          <h2>{inventoryList?.filter((item) => item.status === 'Out of Stock').length || 0}</h2>
        </div>
      </div>

      <div className="card list-container">
        <div className="list-toolbar">
          <div className="search-bar border-input">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search inventory..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Stock Level</th>
                <th>Status</th>
                {isSuperadmin && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIcon size={20} color="#9ca3af" />
                      </div>
                    )}
                  </td>
                  <td className="font-medium">{item.name}</td>
                  <td>{item.category}</td>
                  <td>{item.stock} units</td>
                  <td>
                    <div className={`inventory-status ${(item.status || 'in-stock').replace(/\s+/g, '-').toLowerCase()}`}>
                      {item.status === 'In Stock' && <CheckCircle size={14} />}
                      {item.status !== 'In Stock' && <AlertCircle size={14} />}
                      {item.status}
                    </div>
                  </td>
                  {isSuperadmin && (
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="icon-btn action-btn" onClick={() => openEditForm(item)} title="Edit">
                          <PencilLine size={18} color="#8B5CF6" />
                        </button>
                        <button className="icon-btn action-btn" onClick={() => deleteInventoryItem(item.id)} title="Delete">
                          <Trash2 size={18} color="#DC2626" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isSuperadmin ? "6" : "5"} className="empty-state">No inventory items found. Make sure to add one!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
