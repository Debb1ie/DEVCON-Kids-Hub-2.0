import React, { useEffect, useState } from 'react';
import { Settings, Save, RotateCcw, Sparkles, ShieldCheck, Bot, BrainCircuit, Database, GraduationCap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './AISettings.css';

const defaultSettings = {
  aiName: 'DEVCON Kids Assistant',
  aiPersonality: 'Professional, warm, and encouraging. Patient with newcomers.',
  enableVolunteerOnboarding: true,
  enableEventPlanning: true,
  enableFAQ: true,
  enableAnalytics: true,
  maxContextChunks: 5,
  temperatureLevel: 0.7,
  rateLimit: 100
};

const loadSettings = () => {
  if (typeof window === 'undefined') return defaultSettings;

  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem('aiSettings') || '{}') };
  } catch {
    return defaultSettings;
  }
};

export default function AISettings() {
  const [settings, setSettings] = useState(loadSettings);
  const [saved, setSaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettingsFromSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from('ai_settings')
          .select('*')
          .single();

        if (error && error.code !== 'PGRST116') {
          // PGRST116 means no rows returned, which is fine
          console.warn('Error loading AI settings from Supabase:', error);
        }

        if (data) {
          setSettings((current) => ({ ...current, ...data }));
        } else {
          // If no settings in Supabase, try loading from localStorage
          const raw = localStorage.getItem('aiSettings');
          if (raw) {
            setSettings((current) => ({ ...current, ...JSON.parse(raw) }));
          }
        }
      } catch (err) {
        console.warn('Failed to load settings from Supabase, falling back to localStorage:', err);
        try {
          const raw = localStorage.getItem('aiSettings');
          if (raw) {
            setSettings((current) => ({ ...current, ...JSON.parse(raw) }));
          }
        } catch {
          // ignore malformed storage
        }
      } finally {
        setLoading(false);
      }
    };

    loadSettingsFromSupabase();
  }, []);

  const handleChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      // Save to localStorage for fallback
      localStorage.setItem('aiSettings', JSON.stringify(settings));

      // Save to Supabase
      const { data, error } = await supabase
        .from('ai_settings')
        .upsert([{ id: 1, ...settings }], { onConflict: 'id' })
        .select();

      if (error) {
        console.error('Error saving to Supabase:', error);
        alert('Warning: Settings saved locally but failed to sync to Supabase. Please check your connection.');
      }

      setLastSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to save settings. See console for details.');
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = async () => {
    if (window.confirm('Reset all AI settings to defaults?')) {
      try {
        setSettings(defaultSettings);
        setSaved(false);
        setLastSavedAt(null);
        localStorage.removeItem('aiSettings');

        // Delete from Supabase
        const { error } = await supabase
          .from('ai_settings')
          .delete()
          .eq('id', 1);

        if (error) {
          console.warn('Error resetting in Supabase:', error);
          // Still consider it a success since we reset locally
        }
      } catch (err) {
        console.error('Reset error:', err);
        // Still reset locally even if Supabase fails
      }
    }
  };

  const enabledFeatures = [
    settings.enableVolunteerOnboarding,
    settings.enableEventPlanning,
    settings.enableFAQ,
    settings.enableAnalytics
  ].filter(Boolean).length;

  return (
    <div className="ai-settings-page">
      <div className="settings-hero card">
        <div className="settings-hero-copy">
          <div className="eyebrow">
            <Settings size={14} /> AI control center
          </div>
          <h1>AI Settings & Configuration</h1>
          <p>Manage chatbot behavior, knowledge retrieval, and guardrails from one place.</p>
        </div>

        <div className="settings-hero-stats">
          <div className="stat-pill">
            <Sparkles size={16} />
            <span>{enabledFeatures} features active</span>
          </div>
          <div className="stat-pill">
            <ShieldCheck size={16} />
            <span>{settings.rateLimit} req/hr cap</span>
          </div>
          <div className="stat-pill">
            <Bot size={16} />
            <span>{settings.temperatureLevel.toFixed(1)} creativity</span>
          </div>
        </div>
      </div>

      {saved && (
        <div className="alert alert-success">
          Settings saved successfully{lastSavedAt ? ` at ${lastSavedAt}` : ''}.
        </div>
      )}

      <div className="settings-container">
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
            <small>This system prompt guides the AI&apos;s responses and tone.</small>
          </div>
        </div>

        <div className="settings-card">
          <h2>AI Features</h2>
          <div className="feature-summary">{enabledFeatures} of 4 features are enabled.</div>

          <div className="toggle-group">
            <label className="toggle-item">
              <input
                type="checkbox"
                checked={settings.enableVolunteerOnboarding}
                onChange={(e) => handleChange('enableVolunteerOnboarding', e.target.checked)}
              />
              <span>Volunteer Onboarding Assistant</span>
            </label>
            <small>Help new volunteers understand roles and expectations.</small>
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
            <small>Guide coordinators through event setup process.</small>
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
            <small>Answer questions based on uploaded documents.</small>
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
            <small>Automatically generate insights and summaries.</small>
          </div>
        </div>

        <div className="settings-card settings-grid-card">
          <div className="settings-column">
            <h2>Knowledge Retrieval</h2>

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
              <small>Number of knowledge base chunks used for RAG context.</small>
            </div>
          </div>

          <div className="settings-column">
            <h2>Response Tuning</h2>

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
              <small>Lower values stay precise. Higher values generate more creative replies.</small>
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
              <small>Prevent abuse by limiting requests per user per hour.</small>
            </div>
          </div>
        </div>

        <div className="settings-card">
          <h2>Integration Status</h2>

          <div className="status-item">
            <div className="status-indicator success"></div>
            <div>
              <strong>Supabase</strong>
              <p>Connected - knowledge base storage ready.</p>
            </div>
          </div>

          <div className="status-item">
            <div className="status-indicator warning"></div>
            <div>
              <strong>Google Gemini API</strong>
              <p>Configure API key in .env (VITE_GEMINI_API_KEY).</p>
            </div>
          </div>

          <div className="status-item">
            <div className="status-indicator success"></div>
            <div>
              <strong>Vector Embeddings</strong>
              <p>Configured with Google Gemini embedding model.</p>
            </div>
          </div>
        </div>

        <div className="settings-card prompt-preview-card">
          <h2>Prompt Preview</h2>
          <div className="prompt-preview">
            <div className="prompt-preview-badge">
              <BrainCircuit size={16} />
              Active system prompt
            </div>
            <p>{settings.aiPersonality}</p>
            <div className="prompt-preview-meta">
              <span><GraduationCap size={14} /> {settings.aiName}</span>
              <span><Database size={14} /> {settings.maxContextChunks} chunk context</span>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <button onClick={handleSave} className="btn-primary save-btn" type="button">
            <Save size={18} />
            Save Settings
          </button>
          <button onClick={handleReset} className="btn-secondary reset-btn" type="button">
            <RotateCcw size={18} />
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}