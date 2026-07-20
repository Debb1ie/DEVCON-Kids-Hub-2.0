/**
 * AI Event Prep Checklist Generator
 * Generates a tailored planning checklist based on event type, chapter, and date.
 * Uses Groq/Llama 3.3 to create actionable preparation steps.
 */
import React, { useState } from 'react';
import { ClipboardList, Sparkles, Loader, Check, Copy } from 'lucide-react';
import './Events.css';

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Generate a prep checklist for a given event type using AI.
 */
async function generateChecklist(eventType, chapter, eventDate, notes) {
  if (!GROQ_API_KEY) return [];

  const daysUntil = eventDate
    ? Math.max(0, Math.ceil((new Date(eventDate) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  const prompt = `Generate a detailed preparation checklist for a DEVCON Kids event.

Event type: ${eventType}
Chapter/Location: ${chapter || 'Not specified'}
${eventDate ? `Event date: ${eventDate} (${daysUntil} days from now)` : 'Event date: TBD'}
${notes ? `Additional notes: ${notes}` : ''}

Context: DEVCON Kids is a nonprofit teaching Filipino kids to code. Events include workshops, codecamps, and the "Hour of AI" program.

Generate a checklist with 8-12 items grouped by timeline:
- 2+ weeks before
- 1 week before
- Day before
- Day of event

Return ONLY a JSON array of objects with this format:
[{"phase": "2 weeks before", "task": "Task description", "done": false}]

No explanation, just the JSON array.`;

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 800 })
    });
    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[EventChecklist] Generation failed:', err);
    return [];
  }
}

export default function EventChecklist() {
  const [eventType, setEventType] = useState('Hour of AI');
  const [chapter, setChapter] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setChecklist([]);
    const items = await generateChecklist(eventType, chapter, eventDate, notes);
    setChecklist(items);
    setGenerating(false);
  };

  const toggleItem = (idx) => {
    setChecklist(prev => prev.map((item, i) => i === idx ? { ...item, done: !item.done } : item));
  };

  const handleCopy = async () => {
    const text = checklist.map(item => `${item.done ? '✅' : '⬜'} [${item.phase}] ${item.task}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const completedCount = checklist.filter(item => item.done).length;

  // Group by phase for display
  const grouped = checklist.reduce((acc, item) => {
    const phase = item.phase || 'General';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(item);
    return acc;
  }, {});

  return (
    <div className="module-page">
      <div className="module-header">
        <div className="module-title">
          <div className="module-icon" style={{ background: '#8B5CF6', color: 'white' }}>
            <ClipboardList size={24} />
          </div>
          <div>
            <h2>AI Event Prep Checklist</h2>
            <p className="text-muted">Generate a tailored preparation checklist for any DEVCON Kids event.</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Event Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div className="form-group">
            <label>Event Type</label>
            <select className="border-input" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option>Hour of AI</option>
              <option>CodeCamp</option>
              <option>Workshop</option>
              <option>Community Event</option>
              <option>Orientation</option>
            </select>
          </div>
          <div className="form-group">
            <label>Chapter / Location</label>
            <input className="border-input" placeholder="e.g. Manila, Cebu" value={chapter} onChange={(e) => setChapter(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Event Date</label>
            <input type="date" className="border-input" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Additional Notes (optional)</label>
            <input className="border-input" placeholder="e.g. 30 students, outdoor venue" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <button
          className="btn-primary"
          style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? <><Loader size={16} className="spinner" /> Generating...</> : <><Sparkles size={16} /> Generate Checklist</>}
        </button>
      </div>

      {checklist.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Preparation Checklist ({completedCount}/{checklist.length} done)</h3>
            <button
              className="btn-secondary"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={handleCopy}
            >
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>

          {Object.entries(grouped).map(([phase, items]) => (
            <div key={phase} style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{phase}</h4>
              {items.map((item) => {
                const globalIdx = checklist.indexOf(item);
                return (
                  <label
                    key={globalIdx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0',
                      borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleItem(globalIdx)}
                      style={{ width: '18px', height: '18px', accentColor: '#8B5CF6' }}
                    />
                    <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--text-muted)' : 'var(--text-main)' }}>
                      {item.task}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
