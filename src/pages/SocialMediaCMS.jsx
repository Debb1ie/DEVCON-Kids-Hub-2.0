import React, { useState } from 'react';
import { useApp } from '../context/AppState';
import { Share2, Plus, Trash2, Image as ImageIcon, CheckCircle, Clock, PencilLine } from 'lucide-react';
import './SocialMediaCMS.css';

export default function SocialMediaCMS() {
  const { socialPosts, addSocialPost, updateSocialPost, deleteSocialPost } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [platform, setPlatform] = useState('Facebook');
  const [status, setStatus] = useState('Draft');

  const openCreateForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setImageUrl('');
    setPlatform('Facebook');
    setStatus('Draft');
    setShowForm(true);
  };

  const openEditForm = (post) => {
    setEditingId(post.id);
    setTitle(post.title || '');
    setDescription(post.description || '');
    setImageUrl(post.image_url || '');
    setPlatform(post.platform || 'Facebook');
    setStatus(post.status || 'Draft');
    setShowForm(true);
  };

  const handleAdd = (e) => {
    e.preventDefault();
    const payload = { title, description, image_url: imageUrl, platform, status };

    if (editingId) {
      updateSocialPost(editingId, payload);
    } else {
      addSocialPost(payload);
    }

    setTitle('');
    setDescription('');
    setImageUrl('');
    setPlatform('Facebook');
    setStatus('Draft');
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <div className="module-page">
      <div className="module-header">
        <div className="module-title">
          <div className="module-icon" style={{ background: '#3B82F6', color: 'white' }}>
            <Share2 size={24} />
          </div>
          <div>
            <h2>Social Media Marketing CMS</h2>
            <p className="text-muted">Manage captions, descriptions, and images for marketing campaigns.</p>
          </div>
        </div>
        <button className="btn-primary" onClick={openCreateForm}>
          <Plus size={20} />
          Create New Post
        </button>
      </div>

      {showForm && (
        <div className="card animate-fade-in" style={{ marginBottom: '1rem' }}>
          <h3>{editingId ? 'Edit Marketing Post' : 'Draft New Post'}</h3>
          <form onSubmit={handleAdd} className="cms-form">
            <div className="form-group">
              <label>Campaign Title</label>
              <input 
                className="border-input" 
                placeholder="e.g. Hour of AI Launch" 
                value={title} onChange={(e) => setTitle(e.target.value)} required 
              />
            </div>
            <div className="form-group">
              <label>Platform</label>
              <select className="border-input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option>Facebook</option>
                <option>Instagram</option>
                <option>LinkedIn</option>
                <option>Twitter</option>
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select className="border-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option>Draft</option>
                <option>Published</option>
              </select>
            </div>
            <div className="form-group full-width">
              <label>Image URL</label>
              <input 
                className="border-input" 
                placeholder="https://example.com/image.png" 
                value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} required
              />
            </div>
            <div className="form-group full-width">
              <label>Caption / Description</label>
              <textarea 
                className="border-input" 
                rows="4"
                placeholder="Write your engaging caption here..." 
                value={description} onChange={(e) => setDescription(e.target.value)} required 
              />
            </div>
            <button type="submit" className="btn-primary">{editingId ? 'Update Post' : 'Save Draft'}</button>
          </form>
        </div>
      )}

      <div className="posts-grid">
        {socialPosts?.map((post) => (
          <div className="card post-card" key={post.id}>
            <div className="post-image-container">
              {post.image_url ? (
                <img src={post.image_url} alt={post.title} className="post-image" />
              ) : (
                <div className="post-image-placeholder">
                  <ImageIcon size={48} color="#9ca3af" />
                </div>
              )}
              <span className={`post-platform ${post.platform.toLowerCase()}`}>{post.platform}</span>
            </div>
            <div className="post-content">
              <h3>{post.title}</h3>
              <p className="post-caption">{post.description}</p>
              <div className="post-footer">
                <span className={`post-status ${post.status.toLowerCase()}`}>
                  {post.status === 'Draft' ? <Clock size={14} /> : <CheckCircle size={14} />}
                  {post.status}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }} onClick={() => updateSocialPost(post.id, { ...post, status: 'Published' })}>
                    Publish
                  </button>
                  <button className="btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }} onClick={() => openEditForm(post)}>
                    <PencilLine size={14} />
                    Edit
                  </button>
                  <button className="btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', borderColor: '#DC2626', color: '#DC2626' }} onClick={() => deleteSocialPost(post.id)}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {(!socialPosts || socialPosts.length === 0) && (
          <div className="empty-state card" style={{ gridColumn: '1 / -1' }}>
            <Share2 size={48} color="#9ca3af" style={{ margin: '0 auto 1rem' }} />
            <h3>No marketing posts found</h3>
            <p className="text-muted">Create a new post to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
