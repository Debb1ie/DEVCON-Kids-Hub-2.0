import './LoadingScreen.css';

/**
 * Full-viewport authentication loading state.
 * Replaces the unstyled inline divs in App.jsx.
 * No interactive controls — purely presentational.
 */
export default function LoadingScreen() {
  return (
    <div className="loading-screen" role="status" aria-label="Loading authentication">
      <div className="loading-screen-inner">
        <span className="loading-spinner" aria-hidden="true" />
        <p className="loading-screen-label">Loading…</p>
      </div>
    </div>
  );
}
