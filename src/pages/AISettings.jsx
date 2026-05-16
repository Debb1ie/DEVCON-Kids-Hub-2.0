import React, { useState } from 'react';
import { Settings, Save, RotateCcw } from 'lucide-react';
import './AISettings.css';

export default function AISettings() {
  const [settings, setSettings] = useState({
    aiName: 'DEVCON Kids Assistant',
    aiPersonality: 'Professional, warm, and encouraging. Patient with newcomers.',
    enableVolunteerOnboarding: true,
    enableEventPlanning: true,
    enableFAQ: true,
    enableAnalytics: true,
    maxContextChunks: 5,
    temperatureLevel: 0.7,
    rateLimit: 100
  });

  const [saved, setSaved] = useState(false);

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem('aiSettings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    if (confirm('Reset all AI settings to defaults?')) {
      setSettings({
        aiName: 'DEVCON Kids Assistant',
        aiPersonality: 'Professional, warm, and encouraging. Patient with newcomers.',
        enableVolunteerOnboarding: true,
        enableEventPlanning: true,
        enableFAQ: true,
        enableAnalytics: true,
        maxContextChunks: 5,
        temperatureLevel: 0.7,
        rateLimit: 100
      });
      localStorage.removeItem('aiSettings');
    }
  };

  return (
    <div className="ai-settings-page">
      <div className="settings-header">
        <h1>AI Settings & Configuration</h1>
        <p>Manage AI chatbot behavior, features, and system prompts</p>
      </div>

      {saved && <div className="alert alert-success">✓ Settings saved successfully</div>}

      <div className="settings-container">
        {/* General Settings */}
        <div className="settings-card">
          <h2>General Settings</h2>
          
          <div className="form-group">
            <label>AI Assistant Name</label>
            <input
              type="text"
              value={settings.aiName}
              onChange={(e) => handleChange('aiName', e.target.value)}
              placeholder="Enter AI name"
            />
          </div>

          <div className="form-group">
            <label>AI Personality & Instructions</label>
            <textarea
              value={settings.aiPersonality}
              onChange={(e) => handleChange('aiPersonality', e.target.value)}
              placeholder="Define how the AI should behave..."
              rows={4}
            />
            <small>This system prompt guides the AI's responses and tone</small>
          </div>
        </div>

        {/* Feature Toggle */}
        <div className="settings-card">
          <h2>AI Features</h2>
          
          <div className="toggle-group">
            <label className="toggle-item">
              <input
                type="checkbox"
                checked={settings.enableVolunteerOnboarding}
                onChange={(e) => handleChange('enableVolunteerOnboarding', e.target.checked)}
              />
              <span>Volunteer Onboarding Assistant</span>
            </label>
            <small>Help new volunteers understand roles and expectations</small>
          </div>

          <div className="toggle-group">
            <label className="toggle-item">
              <input
                type="checkbox"
                checked={settings.enableEventPlanning}
                onChange={(e) => handleChange('enableEventPlanning', e.target.checked)}
              />
              <span>Event Creation & Planning Guide</span>
            </label>
            <small>Guide coordinators through event setup process</small>
          </div>

          <div className="toggle-group">
            <label className="toggle-item">
              <input
                type="checkbox"
                checked={settings.enableFAQ}
                onChange={(e) => handleChange('enableFAQ', e.target.checked)}
              />
              <span>FAQ & Knowledge Base Assistant</span>
            </label>
            <small>Answer questions based on uploaded documents</small>
          </div>

          <div className="toggle-group">
            <label className="toggle-item">
              <input
                type="checkbox"
                checked={settings.enableAnalytics}
                onChange={(e) => handleChange('enableAnalytics', e.target.checked)}
              />
              <span>AI-Generated Analytics & Reports</span>
            </label>
            <small>Automatically generate insights and summaries</small>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="settings-card">
          <h2>Advanced Settings</h2>

          <div className="form-group">
            <label>Max Context Chunks Retrieved</label>
            <div className="input-with-value">
              <input
                type="range"
                min="1"
                max="10"
                value={settings.maxContextChunks}
                onChange={(e) => handleChange('maxContextChunks', Number(e.target.value))}
              />
              <span className="value">{settings.maxContextChunks}</span>
            </div>
            <small>Number of knowledge base chunks used for RAG context (1-10)</small>
          </div>

          <div className="form-group">
            <label>AI Temperature Level</label>
            <div className="input-with-value">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.temperatureLevel}
                onChange={(e) => handleChange('temperatureLevel', Number(e.target.value))}
              />
              <span className="value">{settings.temperatureLevel.toFixed(1)}</span>
            </div>
            <small>
              Lower (0.0) = More deterministic, Higher (1.0) = More creative
            </small>
          </div>

          <div className="form-group">
            <label>Rate Limit (requests per hour)</label>
            <input
              type="number"
              value={settings.rateLimit}
              onChange={(e) => handleChange('rateLimit', Number(e.target.value))}
              min="10"
              max="1000"
            />
            <small>Prevent abuse by limiting requests per user per hour</small>
          </div>
        </div>

        {/* Integration Status */}
        <div className="settings-card">
          <h2>Integration Status</h2>

          <div className="status-item">
            <div className="status-indicator success"></div>
            <div>
              <strong>Supabase</strong>
              <p>Connected - Knowledge base storage ready</p>
            </div>
          </div>

          <div className="status-item">
            <div className="status-indicator" id="gemini-status"></div>
            <div>
              <strong>Google Gemini API</strong>
              <p id="gemini-msg">Configure API key in .env (VITE_GEMINI_API_KEY)</p>
            </div>
          </div>

          <div className="status-item">
            <div className="status-indicator success"></div>
            <div>
              <strong>Vector Embeddings</strong>
              <p>Configured with Google Gemini embedding model</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="settings-actions">
          <button onClick={handleSave} className="btn-primary save-btn">
            <Save size={18} />
            Save Settings
          </button>
          <button onClick={handleReset} className="btn-secondary reset-btn">
            <RotateCcw size={18} />
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
