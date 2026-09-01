import { useEffect, useState } from 'react';
import { useApp } from '../context/AppState';
import { Package, AlertCircle, CheckCircle, Search, Plus, Trash2, Image as ImageIcon, PencilLine } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import './Inventory.css';

const INVENTORY_PER_PAGE = 8;

export default function Inventory() {
  const { inventoryList, addInventoryItem, updateInventoryItem, deleteInventoryItem, isSuperadmin } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Robotics');
  const [stock, setStock] = useState(1);
  const [imageUrl, setImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!deleteSuccess) return undefined;
    const timer = window.setTimeout(() => setDeleteSuccess(''), 3000);
    return () => window.clearTimeout(timer);
  }, [deleteSuccess]);

  const resetForm = () => {
    setName(''); setCategory('Robotics'); setStock(1); setImageUrl(''); setEditingId(null); setImagePreviewFailed(false);
  };

  const isValidHttpUrl = (value) => {
    try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; }
  };

  const openCreateForm = () => {
    resetForm();
    setFormError(''); setFormSuccess('');
    setShowForm(true);
  };

  const openEditForm = (item) => {
    setEditingId(item.id);
    setName(item.name || '');
    setCategory(item.category || 'Robotics');
    setStock(item.stock ?? 1);
    setImageUrl(item.image_url || '');
    setFormError(''); setFormSuccess(''); setImagePreviewFailed(false);
    setShowForm(true);
  };

  const closeForm = () => { if (!isSubmitting) { resetForm(); setFormError(''); setShowForm(false); } };

  const handleAdd = async (e) => {
    e.preventDefault();
    const stockValue = Number(stock);
    if (!name.trim()) { setFormError('Enter an inventory item name.'); return; }
    if (String(stock).trim() === '' || !Number.isInteger(stockValue) || stockValue < 0) { setFormError('Stock must be a whole number of 0 or more.'); return; }
    if (imageUrl.trim() && !isValidHttpUrl(imageUrl.trim())) { setFormError('Enter a valid image URL beginning with http:// or https://.'); return; }
    setFormError(''); setFormSuccess(''); setIsSubmitting(true);
    const status = stockValue > 10 ? 'In Stock' : stockValue > 0 ? 'Low Stock' : 'Out of Stock';
    const payload = { name: name.trim(), category, stock: stockValue, status, image_url: imageUrl.trim() };

    try {
      if (editingId) { await updateInventoryItem(editingId, payload); setFormSuccess('Inventory item updated successfully.'); }
      else { await addInventoryItem(payload); setFormSuccess('Inventory item created successfully.'); }
      resetForm(); setShowForm(false);
    } catch (error) {
      console.error('Failed to save inventory item', error);
      setFormError('Unable to save the inventory item. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (item) => {
    setDeleteSuccess('');
    setFormSuccess('');
    setPendingDelete(item);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try { await deleteInventoryItem(pendingDelete.id); setDeleteSuccess('Inventory item deleted successfully.'); } catch (error) { console.error('Failed to delete inventory item', error); } finally { setDeletingId(null); setPendingDelete(null); }
  };

  const filtered = inventoryList?.filter((item) => item.name.toLowerCase().includes(searchTerm.toLowerCase())) || [];
  const totalPages = Math.max(1, Math.ceil(filtered.length / INVENTORY_PER_PAGE));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedItems = filtered.slice((activePage - 1) * INVENTORY_PER_PAGE, activePage * INVENTORY_PER_PAGE);

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
          <button className="btn-primary" onClick={openCreateForm} type="button">
            <Plus size={20} />
            Add Item
          </button>
        )}
      </div>

      {formSuccess && <div className="inventory-form-feedback success" role="status">{formSuccess}</div>}
      {deleteSuccess && <div className="inventory-form-feedback success" role="status">{deleteSuccess}</div>}
      {pendingDelete && (
        <ConfirmationModal
          title="Delete inventory item?"
          message={`Delete "${pendingDelete.name}"? This action cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          isBusy={deletingId === pendingDelete.id}
        />
      )}
      {isSuperadmin && showForm && (
        <>
          <div className="inventory-modal-overlay" onClick={closeForm} />
          <div className="inventory-modal-container">
        <div className="card animate-fade-in inventory-form-card" role="dialog" aria-modal="true" aria-labelledby="inventory-form-title">
          <h3 id="inventory-form-title">{editingId ? 'Edit Inventory Item' : 'Add New Inventory Item'}</h3>
          {editingId && <p className="inventory-editing">Editing: {name || 'Untitled item'}</p>}
          <form onSubmit={handleAdd} className="inventory-form-grid" aria-describedby={formError ? 'inventory-form-error' : undefined}>
            <div className="inventory-form-section"><h4>Item Details</h4><div className="inventory-form-fields">
            <div className="inventory-form-group"><label htmlFor="inventory-item-name">Item Name</label><input id="inventory-item-name" className="border-input" type="text" placeholder="Item name" value={name} onChange={(e) => { setFormError(''); setName(e.target.value); }} disabled={isSubmitting} aria-invalid={formError === 'Enter an inventory item name.'} required /></div>
            <div className="inventory-form-group"><label htmlFor="inventory-category">Category</label><select id="inventory-category" className="border-input" value={category} onChange={(e) => setCategory(e.target.value)} disabled={isSubmitting}>
              <option>Robotics</option>
              <option>Microcontrollers</option>
              <option>Computers</option>
              <option>Electronics</option>
              <option>Swag</option>
            </select></div></div></div>
            <div className="inventory-form-section"><h4>Stock</h4><div className="inventory-form-group"><label htmlFor="inventory-stock">Stock Quantity</label><input id="inventory-stock" type="number" min="0" step="1" className="border-input" placeholder="0" value={stock} onChange={(e) => { setFormError(''); setStock(e.target.value); }} disabled={isSubmitting} aria-invalid={formError === 'Stock must be a whole number of 0 or more.'} required /></div></div>
            <div className="inventory-form-section inventory-media-section"><h4>Media</h4><div className="inventory-form-group"><label htmlFor="inventory-image-url">Image URL <span>Optional</span></label><input id="inventory-image-url" type="url" className="border-input" placeholder="https://example.com/image.jpg" value={imageUrl} onChange={(e) => { setFormError(''); setImagePreviewFailed(false); setImageUrl(e.target.value); }} disabled={isSubmitting} aria-invalid={formError === 'Enter a valid image URL beginning with http:// or https://.'} /></div><div className="inventory-image-preview">{imageUrl.trim() && isValidHttpUrl(imageUrl.trim()) && !imagePreviewFailed ? <img src={imageUrl.trim()} alt={name || 'Inventory item preview'} onError={() => setImagePreviewFailed(true)} /> : <div><ImageIcon size={22} /><span>{imagePreviewFailed ? 'Image preview unavailable' : 'Image preview'}</span></div>}</div></div>
            <div className="inventory-form-actions"><button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : editingId ? 'Update Item' : 'Save Item'}</button><button type="button" className="btn-secondary" onClick={closeForm} disabled={isSubmitting}>Cancel</button></div>
            {formError && <p id="inventory-form-error" className="inventory-form-feedback error" role="alert">{formError}</p>}
          </form>
        </div>
          </div>
        </>
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
          <div className="inventory-search-group">
          <label className="inventory-sr-only" htmlFor="inventory-search">Search inventory</label>
          <div className="search-bar border-input">
            <Search size={18} className="search-icon" />
            <input 
              id="inventory-search"
              type="text" 
              placeholder="Search inventory..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          {searchTerm && <button type="button" className="inventory-clear-search" onClick={() => { setSearchTerm(''); setCurrentPage(1); }}>Clear Search</button>}
          </div>
          <p className="inventory-result-count">{searchTerm ? `${filtered.length} of ${inventoryList?.length || 0} items` : `${inventoryList?.length || 0} inventory items`}</p>
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
              {paginatedItems.map((item) => (
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
                        <button type="button" className="icon-btn action-btn" onClick={() => openEditForm(item)} title="Edit" disabled={deletingId === item.id}>
                          <PencilLine size={18} color="#8B5CF6" />
                        </button>
                        <button type="button" className="icon-btn action-btn" onClick={() => handleDelete(item)} title="Delete" disabled={deletingId === item.id}>
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
        {filtered.length > 0 && (
          <nav className="inventory-pagination" aria-label="Inventory pagination">
            <button type="button" className="inventory-pagination-button" onClick={() => setCurrentPage(activePage - 1)} disabled={activePage === 1}>Previous</button>
            <div className="inventory-pagination-pages">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button key={page} type="button" className={`inventory-pagination-page ${page === activePage ? 'active' : ''}`} onClick={() => setCurrentPage(page)} aria-current={page === activePage ? 'page' : undefined}>{page}</button>
              ))}
            </div>
            <button type="button" className="inventory-pagination-button" onClick={() => setCurrentPage(activePage + 1)} disabled={activePage === totalPages}>Next</button>
          </nav>
        )}
      </div>
    </div>
  );
}
