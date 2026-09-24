import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import './ConfirmationModal.css';

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export default function ConfirmationModal({
  title,
  message,
  cancelLabel = 'Cancel',
  confirmLabel = 'Delete',
  busyLabel = 'Working...',
  onCancel,
  onConfirm,
  isBusy = false,
  role = 'alertdialog',
  focusAfterConfirm
}) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmedRef = useRef(false);
  const cancelHandlerRef = useRef(onCancel);
  const busyRef = useRef(isBusy);

  useEffect(() => {
    cancelHandlerRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    busyRef.current = isBusy;
  }, [isBusy]);

  useEffect(() => {
    const root = document.getElementById('root');
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousRootInert = root?.inert ?? false;
    const previousBodyOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => cancelRef.current?.focus());

    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        cancelHandlerRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(focusableSelector) || []);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (root) root.inert = previousRootInert;
      document.body.style.overflow = previousBodyOverflow;

      window.requestAnimationFrame(() => {
        const nextFocus = confirmedRef.current && focusAfterConfirm
          ? document.querySelector(focusAfterConfirm)
          : trigger;
        if (nextFocus instanceof HTMLElement && nextFocus.isConnected) nextFocus.focus();
      });
    };
  }, [focusAfterConfirm]);

  const handleCancel = () => {
    if (isBusy) return;
    confirmedRef.current = false;
    onCancel();
  };

  const handleConfirm = () => {
    if (isBusy) return;
    confirmedRef.current = true;
    onConfirm();
  };

  return createPortal(
    <>
      <div className="confirmation-modal-overlay" aria-hidden="true" />
      <div className="confirmation-modal-container" onMouseDown={(event) => { if (event.target === event.currentTarget) event.preventDefault(); }}>
        <div ref={dialogRef} className="confirmation-modal card animate-fade-in" role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} tabIndex="-1">
          <div className="confirmation-modal-icon" aria-hidden="true"><AlertTriangle size={22} /></div>
          <div>
            <h3 id={titleId}>{title}</h3>
            <p id={messageId}>{message}</p>
          </div>
          <div className="confirmation-modal-actions">
            <button ref={cancelRef} type="button" className="btn-secondary" onClick={handleCancel} disabled={isBusy}>{cancelLabel}</button>
            <button type="button" className="confirmation-modal-confirm" onClick={handleConfirm} disabled={isBusy}>{isBusy ? busyLabel : confirmLabel}</button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
