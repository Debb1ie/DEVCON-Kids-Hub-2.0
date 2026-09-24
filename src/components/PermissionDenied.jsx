import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './StateScreen.css';

/**
 * Permission-denied screen shown when a role cannot access a route.
 * Currently the routing layer silently redirects instead; this component
 * is available for future use where an explicit "access denied" message
 * is preferred over a silent redirect.
 *
 * Props:
 *   inline  {boolean}  When true, renders inside the authenticated Layout.
 *   message {string}   Override the default description text.
 */
export default function PermissionDenied({
  inline = true,
  message = "You don't have permission to access this area. Contact your chapter administrator if you believe this is an error.",
}) {
  const navigate = useNavigate();

  return (
    <div
      className={`state-screen${inline ? ' state-screen--inline' : ''}`}
      role="main"
      aria-labelledby="denied-title"
    >
      <div className="state-screen-inner">
        <span className="state-screen-icon state-screen-icon--denied" aria-hidden="true">
          <ShieldAlert size={28} />
        </span>

        <p className="state-screen-code">Access denied</p>

        <h1 id="denied-title" className="state-screen-title">
          You don't have access
        </h1>

        <p className="state-screen-description">{message}</p>

        <div className="state-screen-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate(-1)}
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
