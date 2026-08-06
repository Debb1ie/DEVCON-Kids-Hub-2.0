/**
 * Persistent Event Prep Checklist (A12)
 * - Select an existing event from the database
 * - Generate tasks via ai-generate Edge Function (with template fallback)
 * - Persist tasks in event_tasks table
 * - Manage task status (todo/in_progress/done)
 */
import { useEffect, useState } from 'react';
import { ClipboardList, Sparkles, Loader, Check, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './Events.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function EventChecklist() {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [tasks, setTasks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [error, setError] = useState(null);

  // Load events on mount
  useEffect(() => {
    loadEvents();
  }, []);

  // Load tasks when event changes
  useEffect(() => {
    if (selectedEventId) loadTasks(selectedEventId);
    else setTasks([]);
  }, [selectedEventId]);

  async function loadEvents() {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, type, chapter, event_date, status')
      .order('event_date', { ascending: false });
    if (!error && data) setEvents(data);
  }

  async function loadTasks(eventId) {
    setLoading(true);
    const { data, error } = await supabase
      .from('event_tasks')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true });
    if (!error) setTasks(data || []);
    setLoading(false);
  }

  async function handleGenerate() {
    if (!selectedEventId) return;
    const event = events.find(e => e.id === selectedEventId);
    if (!event) return;

    setGenerating(true);
    setError(null);

    try {
      // Get session for Edge Function auth
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'checklist',
          eventType: event.type || 'Workshop',
          chapter: event.chapter || '',
          eventDate: event.event_date || '',
        }),
      });

      if (!res.ok) throw new Error('Generation failed');

      const { tasks: generated, source } = await res.json();
      if (!generated?.length) throw new Error('No tasks generated');

      // Persist to database
      const rows = generated.map((item, idx) => ({
        event_id: selectedEventId,
        task: item.task,
        phase: item.phase || 'General',
        status: 'todo',
        sort_order: tasks.length + idx,
        generated_by: source === 'ai' ? 'ai' : 'template',
      }));

      const { data: inserted, error: insertErr } = await supabase
        .from('event_tasks')
        .insert(rows)
        .select();

      if (insertErr) throw insertErr;
      setTasks(prev => [...prev, ...(inserted || [])]);
    } catch (err) {
      console.error('[EventChecklist]', err);
      setError(err.message || 'Failed to generate checklist');
    } finally {
      setGenerating(false);
    }
  }

  async function toggleStatus(task) {
    const next = task.status === 'done' ? 'todo' : 'done';
    const completedAt = next === 'done' ? new Date().toISOString() : null;

    const { error } = await supabase
      .from('event_tasks')
      .update({ status: next, completed_at: completedAt })
      .eq('id', task.id);

    if (!error) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next, completed_at: completedAt } : t));
    }
  }

  async function addManualTask() {
    if (!newTask.trim() || !selectedEventId) return;

    const { data, error } = await supabase
      .from('event_tasks')
      .insert({
        event_id: selectedEventId,
        task: newTask.trim(),
        phase: 'General',
        status: 'todo',
        sort_order: tasks.length,
        generated_by: 'manual',
      })
      .select()
      .single();

    if (!error && data) {
      setTasks(prev => [...prev, data]);
      setNewTask('');
    }
  }

  async function deleteTask(taskId) {
    const { error } = await supabase.from('event_tasks').delete().eq('id', taskId);
    if (!error) setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const completedCount = tasks.filter(t => t.status === 'done').length;

  // Group tasks by phase
  const grouped = tasks.reduce((acc, t) => {
    const phase = t.phase || 'General';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(t);
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
            <h2>Event Prep Checklist</h2>
            <p className="text-muted">Generate and manage preparation tasks for DEVCON Kids events.</p>
          </div>
        </div>
      </div>

      {/* Event selector */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Select Event</h3>
        <select
          className="border-input"
          style={{ width: '100%', marginTop: '0.75rem' }}
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
        >
          <option value="">-- Choose an event --</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.title} ({ev.type || 'Event'}) — {ev.event_date || 'No date'} — {ev.chapter || 'No chapter'}
            </option>
          ))}
        </select>

        {selectedEvent && tasks.length === 0 && !loading && (
          <button
            className="btn-primary"
            style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? <><Loader size={16} className="spinner" /> Generating...</> : <><Sparkles size={16} /> Generate Checklist</>}
          </button>
        )}

        {error && <p style={{ color: 'var(--error)', marginTop: '0.5rem', fontSize: '0.85rem' }}>{error}</p>}
      </div>

      {/* Task list */}
      {loading && <div className="card"><p>Loading tasks...</p></div>}

      {selectedEventId && tasks.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Tasks ({completedCount}/{tasks.length} done)</h3>
            {tasks.length > 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {tasks[0]?.generated_by === 'ai' ? '✨ AI generated' : tasks[0]?.generated_by === 'template' ? '📋 Template' : '✏️ Manual'}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-subtle)', marginBottom: '1.5rem' }}>
            <div style={{ height: '100%', borderRadius: '3px', background: '#8B5CF6', width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%`, transition: 'width 0.3s' }} />
          </div>

          {Object.entries(grouped).map(([phase, items]) => (
            <div key={phase} style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{phase}</h4>
              {items.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0',
                    borderBottom: '1px solid var(--border-subtle)'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    onChange={() => toggleStatus(task)}
                    style={{ width: '18px', height: '18px', accentColor: '#8B5CF6', cursor: 'pointer' }}
                    aria-label={`Mark "${task.task}" as ${task.status === 'done' ? 'incomplete' : 'complete'}`}
                  />
                  <span style={{
                    flex: 1,
                    textDecoration: task.status === 'done' ? 'line-through' : 'none',
                    color: task.status === 'done' ? 'var(--text-muted)' : 'var(--text-main)'
                  }}>
                    {task.task}
                  </span>
                  <button
                    onClick={() => deleteTask(task.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                    title="Delete task"
                    aria-label={`Delete task: ${task.task}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}

          {/* Add manual task */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <input
              className="border-input"
              style={{ flex: 1 }}
              placeholder="Add a task manually..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addManualTask()}
              aria-label="New task text"
            />
            <button className="btn-secondary" onClick={addManualTask} disabled={!newTask.trim()} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Regenerate option */}
          <button
            className="btn-secondary"
            style={{ marginTop: '1rem', fontSize: '0.85rem' }}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating...' : '🔄 Regenerate checklist (adds new tasks)'}
          </button>
        </div>
      )}

      {selectedEventId && tasks.length === 0 && !loading && !generating && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No tasks yet. Generate a checklist or add tasks manually.</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'center' }}>
            <input
              className="border-input"
              placeholder="Or add a task manually..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addManualTask()}
              aria-label="New task text"
            />
            <button className="btn-secondary" onClick={addManualTask} disabled={!newTask.trim()}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
