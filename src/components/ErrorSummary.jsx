import { useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

export default function ErrorSummary({ errors = [], onActivate }) {
  const ref = useRef(null);
  const errorSignature = errors.map((error) => error.key).join('|');
  useEffect(() => { if (errors.length) ref.current?.focus(); }, [errorSignature, errors.length]);
  const focusField = (event, error) => {
    event.preventDefault();
    if (onActivate) {
      onActivate(error);
      return;
    }
    const field = document.getElementById(error.fieldId);
    if (!field) return;
    window.history.replaceState(window.history.state, '', `#${error.fieldId}`);
    field.scrollIntoView({ block: 'center' });
    field.focus({ preventScroll: true });
  };
  if (!errors.length) return null;
  return (
    <div ref={ref} className="error-summary" role="alert" tabIndex="-1">
      <div><AlertCircle size={20} aria-hidden="true" /><strong>Review the following information</strong></div>
      <ul>{errors.filter((error) => error.fieldId).map((error) => <li key={error.key}><a href={`#${error.fieldId}`} onClick={(event) => focusField(event, error)}>{error.message}</a></li>)}</ul>
    </div>
  );
}
