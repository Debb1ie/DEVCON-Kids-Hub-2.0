import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ConfirmationModal from '../../src/components/ConfirmationModal';
import '../../src/index.css';

export function Harness() {
  const [editorOpen, setEditorOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [value, setValue] = useState('Preserved event value');

  return (
    <main style={{ maxWidth: '48rem', margin: '2rem auto', padding: '1rem' }}>
      <h1>Dialog interaction harness</h1>
      {editorOpen ? (
        <section aria-label="Event editor fixture">
          <label htmlFor="fixture-name">Event name</label>
          <input id="fixture-name" value={value} onChange={(event) => setValue(event.target.value)} />
          <button id="fixture-cancel" type="button" onClick={() => setDialogOpen(true)}>Cancel</button>
          <button id="fixture-background" type="button">Background action</button>
        </section>
      ) : (
        <button id="create-event-button" type="button" onClick={() => setEditorOpen(true)}>Create event</button>
      )}
      <output id="fixture-value">{value}</output>
      {dialogOpen && (
        <ConfirmationModal
          title="Discard changes?"
          message="You have unsaved event changes."
          cancelLabel="Stay"
          confirmLabel="Discard changes"
          onCancel={() => setDialogOpen(false)}
          onConfirm={() => {
            setDialogOpen(false);
            setEditorOpen(false);
          }}
          focusAfterConfirm="#create-event-button"
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
