import { useEffect, useState } from 'react';
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

const getRateLimitError = (value) => {
  if (value === '') return 'Enter a rate limit before saving.';
  if (!/^\d+$/.test(String(value))) return 'Rate limit must be a whole number.';
  if (Number(value) < 10 || Number(value) > 1000) return 'Rate limit must be between 10 and 1000 requests per hour.';
  return '';
};

export default function AISettings() {
  const [settings, setSettings] = useState(loadSettings);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const loadSettingsFromSupabase = async () => {
      try {
        const { data, error } = await supabase.from('ai_settings').select('*').single();

        if (error && error.code !== 'PGRST116') {
          console.warn('Error loading AI settings from Supabase:', error);
        }

        if (data) {
          setSettings((current) => ({ ...current, ...data }));
        } else {
          const raw = localStorage.getItem('aiSettings');
          if (raw) setSettings((current) => ({ ...current, ...JSON.parse(raw) }));
        }
      } catch (err) {
        console.warn('Failed to load settings from Supabase, falling back to localStorage:', err);
        try {
          const raw = localStorage.getItem('aiSettings');
          if (raw) setSettings((current) => ({ ...current, ...JSON.parse(raw) }));
        } catch {
          // Ignore malformed local storage and keep the defaults.
        }
      } finally {
        setLoading(false);
      }
    };

    loadSettingsFromSupabase();
  }, []);

  const handleChange = (field, value) => {
    setSettings((previous) => ({ ...previous, [field]: value }));
    setFeedback(null);
  };

  const handleRateLimitChange = (value) => {
    // Keep an empty field empty while it is being edited; do not coerce it to zero.
    if (value === '' || /^\d+$/.test(value)) handleChange('rateLimit', value === '' ? '' : Number(value));
  };

  const handleSave = async () => {
    if (isSaving || isResetting) return;

    const rateLimitError = getRateLimitError(settings.rateLimit);
    if (rateLimitError) {
      setFeedback({ type: 'error', message: rateLimitError });
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    let localSaveFailed = false;

    try {
      try {
        localStorage.setItem('aiSettings', JSON.stringify(settings));
      } catch (err) {
        localSaveFailed = true;
        console.warn('Failed to save AI settings to localStorage:', err);
      }

      const { error } = await supabase
        .from('ai_settings')
        .upsert([{ id: 1, ...settings }], { onConflict: 'id' })
        .select();

      if (error) {
        console.error('Error saving AI settings to Supabase:', error);
        setFeedback({ type: 'warning', message: 'Settings were saved on this device but could not be synced to Supabase.' });
        return;
      }

      setLastSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      setFeedback({ type: localSaveFailed ? 'warning' : 'success', message: localSaveFailed ? 'Settings synced to Supabase, but the browser backup could not be updated.' : 'Settings saved successfully.' });
    } catch (err) {
      console.error('Save error:', err);
      setFeedback({ type: 'error', message: 'Unable to save settings. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (isSaving || isResetting || !window.confirm('Reset all AI settings to defaults?')) return;

    setIsResetting(true);
    setFeedback(null);
    let localResetFailed = false;
    setSettings(defaultSettings);
    setLastSavedAt(null);

    try {
      try {
        localStorage.removeItem('aiSettings');
      } catch (err) {
        localResetFailed = true;
        console.warn('Failed to reset AI settings in localStorage:', err);
      }

      const { error } = await supabase.from('ai_settings').delete().eq('id', 1);
      if (error) {
        console.warn('Error resetting AI settings in Supabase:', error);
        setFeedback({ type: 'warning', message: 'Defaults are active on this device but could not be reset in Supabase.' });
        return;
      }

      setFeedback({ type: localResetFailed ? 'warning' : 'success', message: localResetFailed ? 'Defaults were reset in Supabase, but the browser backup could not be cleared.' : 'Settings reset to defaults.' });
    } catch (err) {
      console.error('Reset error:', err);
      setFeedback({ type: 'warning', message: 'Defaults are active on this device, but the server reset could not be completed.' });
    } finally {
      setIsResetting(false);
    }
  };

  const enabledFeatures = [settings.enableVolunteerOnboarding, settings.enableEventPlanning, settings.enableFAQ, settings.enableAnalytics].filter(Boolean).length;
  const rateLimitError = getRateLimitError(settings.rateLimit);

  if (loading) {
    return <div className="ai-settings-page"><div className="settings-loading card" role="status" aria-live="polite"><Settings size={22} aria-hidden="true" /><div><strong>Loading AI settings...</strong><p>Retrieving your saved configuration.</p></div></div></div>;
  }

  return (
    <div className="ai-settings-page">
      <div className="settings-hero card">
        <div className="settings-hero-copy"><div className="eyebrow"><Settings size={14} /> AI control center</div><h1>AI Settings &amp; Configuration</h1><p>Manage chatbot behavior, knowledge retrieval, and guardrails from one place.</p></div>
        <div className="settings-hero-stats" aria-label="Current AI settings summary">
          <div className="stat-pill"><Sparkles size={16} /><span>{enabledFeatures} features active</span></div>
          <div className="stat-pill"><ShieldCheck size={16} /><span>{settings.rateLimit || '—'} req/hr cap</span></div>
          <div className="stat-pill"><Bot size={16} /><span>{Number(settings.temperatureLevel).toFixed(1)} creativity</span></div>
        </div>
      </div>

      {feedback && <div className={`alert alert-${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.message}{feedback.type === 'success' && lastSavedAt ? ` Saved at ${lastSavedAt}.` : ''}</div>}

      <div className="settings-container" aria-busy={isSaving || isResetting}>
        <div className="settings-card">
          <h2>General Settings</h2>
          <div className="form-group"><label htmlFor="ai-name">AI Assistant Name</label><input id="ai-name" type="text" value={settings.aiName} onChange={(event) => handleChange('aiName', event.target.value)} placeholder="Enter AI name" /></div>
          <div className="form-group"><label htmlFor="ai-personality">AI Personality &amp; Instructions</label><textarea id="ai-personality" value={settings.aiPersonality} onChange={(event) => handleChange('aiPersonality', event.target.value)} placeholder="Define how the AI should behave..." rows={4} /><small>This system prompt guides the AI&apos;s responses and tone.</small></div>
        </div>

        <div className="settings-card"><h2>AI Features</h2><div className="feature-summary" aria-live="polite">{enabledFeatures} of 4 features are enabled.</div>
          {[
            ['enableVolunteerOnboarding', 'Volunteer Onboarding Assistant', 'Help new volunteers understand roles and expectations.'],
            ['enableEventPlanning', 'Event Creation & Planning Guide', 'Guide coordinators through the event setup process.'],
            ['enableFAQ', 'FAQ & Knowledge Base Assistant', 'Answer questions based on uploaded documents.'],
            ['enableAnalytics', 'AI-Generated Analytics & Reports', 'Automatically generate insights and summaries.']
          ].map(([field, label, description]) => <div className={`toggle-group ${settings[field] ? 'is-enabled' : ''}`} key={field}><label className="toggle-item" htmlFor={field}><input id={field} type="checkbox" checked={settings[field]} onChange={(event) => handleChange(field, event.target.checked)} /><span>{label}</span><span className="toggle-state">{settings[field] ? 'Enabled' : 'Disabled'}</span></label><small>{description}</small></div>)}
        </div>

        <div className="settings-card settings-grid-card"><div className="settings-column"><h2>Knowledge Retrieval</h2><div className="form-group"><label htmlFor="max-context-chunks">Max Context Chunks Retrieved</label><div className="input-with-value"><input id="max-context-chunks" type="range" min="1" max="10" value={settings.maxContextChunks} onChange={(event) => handleChange('maxContextChunks', Number(event.target.value))} aria-valuetext={`${settings.maxContextChunks} context chunks`} /><output className="value" htmlFor="max-context-chunks">{settings.maxContextChunks}</output></div><div className="range-labels" aria-hidden="true"><span>1</span><span>10</span></div><small>Number of knowledge base chunks used for RAG context.</small></div></div>
          <div className="settings-column"><h2>Response Tuning</h2><div className="form-group"><label htmlFor="temperature-level">AI Temperature Level</label><div className="input-with-value"><input id="temperature-level" type="range" min="0" max="1" step="0.1" value={settings.temperatureLevel} onChange={(event) => handleChange('temperatureLevel', Number(event.target.value))} aria-valuetext={`${Number(settings.temperatureLevel).toFixed(1)} temperature`} /><output className="value" htmlFor="temperature-level">{Number(settings.temperatureLevel).toFixed(1)}</output></div><div className="range-labels" aria-hidden="true"><span>0.0 precise</span><span>1.0 creative</span></div><small>Lower values stay precise. Higher values generate more creative replies.</small></div><div className="form-group"><label htmlFor="rate-limit">Rate Limit (requests per hour)</label><input id="rate-limit" type="number" inputMode="numeric" value={settings.rateLimit} onChange={(event) => handleRateLimitChange(event.target.value)} min="10" max="1000" step="1" aria-describedby="rate-limit-help rate-limit-error" aria-invalid={Boolean(rateLimitError)} /><small id="rate-limit-help">Prevent abuse by limiting requests per user per hour.</small>{rateLimitError && <span className="field-error" id="rate-limit-error">{rateLimitError}</span>}</div></div>
        </div>

        <div className="settings-card"><h2>Integration Status</h2><div className="status-item"><div className="status-indicator success" aria-hidden="true" /><div><strong>Supabase</strong><p>Knowledge base storage integration is available through the existing app configuration.</p></div></div><div className="status-item"><div className="status-indicator warning" aria-hidden="true" /><div><strong>Google Gemini API</strong><p>Configure the API key securely in <code>.env</code> using <code>VITE_GEMINI_API_KEY</code>.</p></div></div><div className="status-item"><div className="status-indicator success" aria-hidden="true" /><div><strong>Vector Embeddings</strong><p>Configured with the Google Gemini embedding model.</p></div></div></div>

        <div className="settings-card prompt-preview-card"><h2>Prompt Preview</h2><div className="prompt-preview"><div className="prompt-preview-badge"><BrainCircuit size={16} /> Active system prompt</div><p>{settings.aiPersonality || 'No personality instructions have been added yet.'}</p><div className="prompt-preview-meta"><span><GraduationCap size={14} /> {settings.aiName || 'Unnamed assistant'}</span><span><Database size={14} /> {settings.maxContextChunks} chunk context</span></div></div></div>
        <div className="settings-actions"><button onClick={handleSave} className="btn-primary save-btn" type="button" disabled={isSaving || isResetting || Boolean(rateLimitError)}><Save size={18} aria-hidden="true" />{isSaving ? 'Saving...' : 'Save Settings'}</button><button onClick={handleReset} className="btn-secondary reset-btn" type="button" disabled={isSaving || isResetting}><RotateCcw size={18} aria-hidden="true" />{isResetting ? 'Resetting...' : 'Reset to Defaults'}</button></div>
      </div>
    </div>
  );
}
