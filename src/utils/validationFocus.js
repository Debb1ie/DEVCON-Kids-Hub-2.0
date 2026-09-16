const INTERACTIVE_FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[role="combobox"]:not([aria-disabled="true"])',
  '[role="listbox"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
].join(',');

const isInteractiveField = (element) => Boolean(
  element
  && typeof element.matches === 'function'
  && element.matches(INTERACTIVE_FIELD_SELECTOR)
);

export const resolveValidationControl = (fieldId, documentRef = document) => {
  const target = documentRef.getElementById(fieldId);
  if (!target) return null;
  if (isInteractiveField(target)) return target;
  return target.querySelector?.(INTERACTIVE_FIELD_SELECTOR) || null;
};

export const createValidationError = ({ key, fieldId, stage, message }) => ({
  key,
  fieldId,
  stage,
  message,
});

export const createValidationFocusRequest = (error, requestId) => ({
  requestId,
  errorKey: error.key,
  fieldId: error.fieldId,
  stage: error.stage,
});

export const scheduleValidationFocus = ({ fieldId, documentRef = document, windowRef = window, maxFrames = 4, isCurrent = () => true, onComplete }) => {
  let frameId = null;
  let cancelled = false;
  let attempts = 0;

  const tryFocus = () => {
    if (cancelled || !isCurrent()) return;
    const control = resolveValidationControl(fieldId, documentRef);
    if (control) {
      windowRef.history?.replaceState?.(windowRef.history.state, '', `#${fieldId}`);
      control.scrollIntoView?.({ block: 'center', behavior: 'auto' });
      control.focus({ preventScroll: true });
      if (isCurrent() && documentRef.activeElement === control) {
        onComplete?.(true, control);
        return;
      }
    }
    attempts += 1;
    if (attempts >= maxFrames) {
      onComplete?.(false, null);
      return;
    }
    frameId = windowRef.requestAnimationFrame(tryFocus);
  };

  frameId = windowRef.requestAnimationFrame(tryFocus);
  return () => {
    cancelled = true;
    if (frameId !== null) windowRef.cancelAnimationFrame(frameId);
  };
};
