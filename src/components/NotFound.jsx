import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import './StateScreen.css';

/**
 * 404 Not Found screen.
 *
 * Props:
 *   inline  {boolean}  When true, renders inside the authenticated Layout
 *                      (transparent background, shorter min-height).
 *                      When false (default), renders full-viewport standalone.
 *   homeHref {string}  Override the "Go home" destination. Default: "/".
 */
export default function NotFound({ inline = false, homeHref = '/' }) {
  return (
    <div
      className={`state-screen${inline ? ' state-screen--inline' : ''}`}
      role="main"
      aria-labelledby="not-found-title"
    >
      <div className="state-screen-inner">
        <span className="state-screen-icon state-screen-icon--notfound" aria-hidden="true">
          <FileQuestion size={28} />
        </span>

        <p className="state-screen-code">404</p>

        <h1 id="not-found-title" className="state-screen-title">
          Page not found
        </h1>

        <p className="state-screen-description">
          The page you're looking for doesn't exist or has been moved.
          Check the URL or head back to a familiar place.
        </p>

        <div className="state-screen-actions">
          <Link to={homeHref} className="btn-primary">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
