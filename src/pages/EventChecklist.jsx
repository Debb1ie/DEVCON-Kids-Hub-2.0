/**
 * Persistent Event Prep Checklist (A12)
 * - Select an existing event from the database
 * - Generate tasks via ai-generate Edge Function (with template fallback)
 * - Persist tasks in event_tasks table
 * - Manage task status (todo/in_progress/done)
 */
import { useEffect, useState } from 'react';
import { ClipboardList, Sparkles, Loader, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppState';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import './EventChecklist.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function EventChecklist() {
  const { eventsList } = useApp();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [tasks, setTasks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [error, setError] = useState(null);

  // Load tasks when event changes
  useEffect(() => {
    if (!selectedEventId) return;
    let active = true;

    async function fetchTasks(eventId) {
      setLoading(true);
      // Real DB events (UUID): load from Supabase
      if (typeof eventId === 'string' && eventId.length > 10) {
        const { data, error: fetchErr } = await supabase
          .from('event_tasks')
          .select('*')
          .eq('event_id', eventId)
          .order('sort_order', { ascending: true });
        if (active) {
          if (!fetchErr) {
            setTasks(data || []);
          } else {
            setTasks([]);
          }
          setLoading(false);
        }
        return;
      }
      // Fallback events: load from localStorage
      try {
        const saved = localStorage.getItem(`event_tasks_${eventId}`);
        if (active && saved) {
          setTasks(JSON.parse(saved));
          setLoading(false);
          return;
        }
      } catch { /* ignore */ }
      if (active) {
        setTasks([]);
        setLoading(false);
      }
    }

    void fetchTasks(selectedEventId);

    return () => {
      active = false;
    };
  }, [selectedEventId]);

  // Save fallback event tasks to localStorage when they change
  useEffect(() => {
    if (!selectedEventId || !tasks.length) return;
    const isRealEvent = typeof selectedEventId === 'string' && selectedEventId.length > 10;
    if (!isRealEvent && tasks.some(t => t._local)) {
      try { localStorage.setItem(`event_tasks_${selectedEventId}`, JSON.stringify(tasks)); } catch { /* full */ }
    }
  }, [tasks, selectedEventId]);

  async function handleGenerate() {
    if (!selectedEventId) return;
    const event = eventsList.find(e => String(e.id) === String(selectedEventId));
    if (!event) return;

    setGenerating(true);
    setError(null);

    try {
      // Get session for Edge Function auth
      const { data: { session } } = await supabase.auth.getSession();
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': session?.access_token ? `Bearer ${session.access_token}` : `Bearer ${anonKey}`,
        'apikey': anonKey,
      };

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

      // Try to persist to database (only works for real UUID events)
      const isRealEvent = typeof selectedEventId === 'string' && selectedEventId.length > 10;

      if (isRealEvent) {
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

        if (!insertErr && inserted) {
          setTasks(prev => [...prev, ...inserted]);
          return;
        }
      }

      // Fallback: store in local state only (for fallback events or DB errors)
      const localTasks = generated.map((item, idx) => ({
        id: `local-${Date.now()}-${idx}`,
        event_id: selectedEventId,
        task: item.task,
        phase: item.phase || 'General',
        status: 'todo',
        sort_order: tasks.length + idx,
        generated_by: source === 'ai' ? 'ai' : 'template',
        _local: true,
      }));
      setTasks(prev => [...prev, ...localTasks]);
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

    if (!task._local) {
      const { error } = await supabase
        .from('event_tasks')
        .update({ status: next, completed_at: completedAt })
        .eq('id', task.id);
      if (error) return;
    }

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next, completed_at: completedAt } : t));
  }

  async function addManualTask() {
    if (!newTask.trim() || !selectedEventId) return;
    const isRealEvent = typeof selectedEventId === 'string' && selectedEventId.length > 10;

    if (isRealEvent) {
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
        return;
      }
    }

    // Local-only fallback
    setTasks(prev => [...prev, {
      id: `local-${Date.now()}`,
      event_id: selectedEventId,
      task: newTask.trim(),
      phase: 'General',
      status: 'todo',
      sort_order: tasks.length,
      generated_by: 'manual',
      _local: true,
    }]);
    setNewTask('');
  }

  async function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task && !task._local) {
      const { error } = await supabase.from('event_tasks').delete().eq('id', taskId);
      if (error) return;
    }
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  const selectedEvent = eventsList.find(e => String(e.id) === String(selectedEventId));
  const completedCount = tasks.filter(t => t.status === 'done').length;

  // Group tasks by phase
  const grouped = tasks.reduce((acc, t) => {
    const phase = t.phase || 'General';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(t);
    return acc;
  }, {});

  return (
    <div className="event-checklist-page">
      <PageHeader
        eyebrow="Operations"
        title="Event Prep Checklist"
        description="Generate and manage preparation tasks for DEVCON Kids events."
      />

      {/* Event selector */}
      <div className="checklist-selector-card">
        <h3>Select Event</h3>
        <select
          className="checklist-select"
          value={selectedEventId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedEventId(id);
            if (!id) setTasks([]);
          }}
        >
          <option value="">-- Choose an event --</option>
          {eventsList.map((ev) => (
            <option key={ev.id} value={String(ev.id)}>
              {ev.title} ({ev.type || 'Event'}) — {ev.event_date || 'No date'} — {ev.chapter || 'No chapter'}
            </option>
          ))}
        </select>

        {selectedEvent && !loading && (
          <button
            className="btn-primary checklist-generate-btn"
            onClick={handleGenerate}
            disabled={generating}
            type="button"
          >
            {generating ? (
              <>
                <Loader size={16} className="spinner" /> Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} /> {tasks.length > 0 ? 'Generate More Tasks' : 'Generate Checklist'}
              </>
            )}
          </button>
        )}

        {error && <p className="checklist-error">{error}</p>}
      </div>

      {/* Task list */}
      {loading && (
        <div className="checklist-tasks-card">
          <p className="text-muted">Loading tasks...</p>
        </div>
      )}

      {selectedEventId && tasks.length > 0 && (
        <div className="checklist-tasks-card">
          <div className="checklist-header-row">
            <h3>
              Tasks ({completedCount}/{tasks.length} done)
            </h3>
            {tasks.length > 0 && (
              <span className="checklist-source-badge">
                {tasks[0]?.generated_by === 'ai'
                  ? '✨ AI generated'
                  : tasks[0]?.generated_by === 'template'
                  ? '📋 Template'
                  : '✏️ Manual'}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="checklist-progress-bar">
            <div
              className="checklist-progress-fill"
              style={{
                width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%`,
              }}
            />
          </div>

          {Object.entries(grouped).map(([phase, items]) => (
            <div key={phase} className="checklist-phase-group">
              <h4 className="checklist-phase-title">{phase}</h4>
              {items.map((task) => (
                <div key={task.id} className="checklist-item-row">
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    onChange={() => toggleStatus(task)}
                    className="checklist-checkbox"
                    aria-label={`Mark "${task.task}" as ${
                      task.status === 'done' ? 'incomplete' : 'complete'
                    }`}
                  />
                  <span
                    className={`checklist-task-label ${
                      task.status === 'done' ? 'done' : ''
                    }`}
                  >
                    {task.task}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTask(task.id)}
                    className="checklist-item-delete"
                    title="Delete task"
                    aria-label={`Delete task: ${task.task}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ))}

          {/* Add manual task */}
          <div className="checklist-manual-add">
            <input
              className="checklist-manual-input"
              placeholder="Add a task manually..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addManualTask()}
              aria-label="New task text"
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={addManualTask}
              disabled={!newTask.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={15} /> Add
            </button>
          </div>
        </div>
      )}

      {selectedEventId && tasks.length === 0 && !loading && !generating && (
        <EmptyState
          icon={Sparkles}
          title="No checklist tasks yet"
          description="Click 'Generate Checklist' above to auto-generate tasks, or add tasks manually below."
          actions={
            <div
              className="checklist-manual-add"
              style={{ maxWidth: '480px', margin: '0 auto', width: '100%' }}
            >
              <input
                className="checklist-manual-input"
                placeholder="Or add a task manually..."
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualTask()}
                aria-label="New task text"
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={addManualTask}
                disabled={!newTask.trim()}
              >
                <Plus size={15} /> Add
              </button>
            </div>
          }
        />
      )}

      {!selectedEventId && (
        <EmptyState
          icon={ClipboardList}
          title="No event selected"
          description="Choose an event from the dropdown above to manage its preparation checklist."
        />
      )}
    </div>
  );
}
