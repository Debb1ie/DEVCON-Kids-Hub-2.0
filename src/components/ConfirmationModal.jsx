import { AlertTriangle } from 'lucide-react';
import './ConfirmationModal.css';

export default function ConfirmationModal({ title, message, confirmLabel = 'Delete', onCancel, onConfirm, isBusy = false }) {
  return (
    <>
      <div className="confirmation-modal-overlay" onClick={isBusy ? undefined : onCancel} />
      <div className="confirmation-modal-container" onClick={(event) => { if (!isBusy && event.target === event.currentTarget) onCancel(); }}>
        <div className="confirmation-modal card animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title" aria-describedby="confirmation-modal-message">
          <div className="confirmation-modal-icon" aria-hidden="true"><AlertTriangle size={22} /></div>
          <div>
            <h3 id="confirmation-modal-title">{title}</h3>
            <p id="confirmation-modal-message">{message}</p>
          </div>
          <div className="confirmation-modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={isBusy}>Cancel</button>
            <button type="button" className="confirmation-modal-confirm" onClick={onConfirm} disabled={isBusy}>{isBusy ? 'Deleting...' : confirmLabel}</button>
          </div>
        </div>
      </div>
    </>
  );
}
