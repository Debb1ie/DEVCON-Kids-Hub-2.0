import React, { useState } from 'react';
import { useApp } from '../context/AppState';
import { Share2, Plus, Trash2, Image as ImageIcon, CheckCircle, Clock, PencilLine, Sparkles, Loader } from 'lucide-react';
import './SocialMediaCMS.css';

// Groq API for caption generation (same key as chatService)
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Generate 3 platform-specific captions using AI.
 * Takes a campaign title, optional description context, and target platform.
 */
async function generateCaptions(title, context, platform) {
  if (!GROQ_API_KEY || !title.trim()) return [];

  const platformGuide = {
    Facebook: 'Conversational, medium-length (2-3 sentences), use emojis sparingly, include a call-to-action.',
    Instagram: 'Engaging, use emojis and hashtags generously, casual tone, end with relevant hashtags (5-8).',
    LinkedIn: 'Professional, informative, 2-3 short paragraphs, no excessive emojis, include a call-to-action.',
    Twitter: 'Short and punchy (under 280 chars), witty, 1-2 hashtags max, create urgency.'
  };

  const prompt = `Generate exactly 3 social media caption options for ${platform}.

Campaign/Event: "${title}"
${context ? `Additional context: "${context}"` : ''}
Organization: DEVCON Kids — a nonprofit teaching Filipino kids to code through workshops and events.

Platform style guide: ${platformGuide[platform] || platformGuide.Facebook}

Return ONLY a JSON array of 3 strings. No explanation, no markdown, just the JSON array.
Example format: ["Caption 1 here", "Caption 2 here", "Caption 3 here"]`;

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.8, max_tokens: 500 })
    });
    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    // Parse JSON array from response (handle markdown code blocks if present)
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[SocialMediaCMS] Caption generation failed:', err);
    return [];
  }
}

export default function SocialMediaCMS() {
  const { socialPosts, addSocialPost, updateSocialPost, deleteSocialPost } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [platform, setPlatform] = useState('Facebook');
  const [status, setStatus] = useState('Draft');
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  const [captionOptions, setCaptionOptions] = useState([]);

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
              {/* AI Caption Generator */}
              <button
                type="button"
                className="btn-secondary ai-caption-btn"
                disabled={!title.trim() || generatingCaptions}
                onClick={async () => {
                  setGeneratingCaptions(true);
                  setCaptionOptions([]);
                  const captions = await generateCaptions(title, description, platform);
                  setCaptionOptions(captions);
                  setGeneratingCaptions(false);
                }}
              >
                {generatingCaptions ? (
                  <><Loader size={14} className="spinner" /> Generating...</>
                ) : (
                  <><Sparkles size={14} /> AI Generate Captions</>
                )}
              </button>
              {!title.trim() && <small className="text-muted">Enter a campaign title first to generate captions.</small>}
              {/* Caption options */}
              {captionOptions.length > 0 && (
                <div className="caption-options">
                  <small className="text-muted">Click a caption to use it:</small>
                  {captionOptions.map((caption, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="caption-option"
                      onClick={() => { setDescription(caption); setCaptionOptions([]); }}
                    >
                      <span className="caption-option-num">{idx + 1}</span>
                      <span className="caption-option-text">{caption}</span>
                    </button>
                  ))}
                </div>
              )}
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
