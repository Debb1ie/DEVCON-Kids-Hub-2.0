import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Lock, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AUTH_CALLBACK_PATH, completeOAuthCallback, getPostAuthRoute, withTimeout } from '../auth/authFlow';
import { useApp } from '../context/AppState';
import { supabase } from '../lib/supabase';
import CelestialLoader from '../components/brand/CelestialLoader';
import HeaderAtmosphere from '../components/brand/HeaderAtmosphere';
import './AuthCallback.css';

// Labels follow real steps of the existing flow; nothing waits on a timer.
const STAGE_LABELS = ['Completing Google sign-in...', 'Verifying your account...', 'Preparing your dashboard...'];

export default function AuthCallback() {
  const navigate = useNavigate();
  const { acceptSession } = useApp();
  const started = useRef(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const finish = async () => {
      try {
        const session = await withTimeout(completeOAuthCallback(supabase.auth, window.location.href));

        // Remove the one-time code and provider parameters without logging or
        // retaining them in browser history.
        window.history.replaceState({}, document.title, AUTH_CALLBACK_PATH);
        setStage(1);
        const profile = await acceptSession(session);
        setStage(2);
        navigate(getPostAuthRoute(profile), { replace: true });
      } catch {
        setError('Google sign-in could not be completed. Please return to login and try again.');
      }
    };

    void finish();
  }, [acceptSession, navigate]);

  return (
    <main className="auth-callback">
      <HeaderAtmosphere className="auth-callback-atmosphere" />
      <div className="auth-callback-glow" aria-hidden="true" />
      <section className="auth-callback-card" aria-labelledby="auth-callback-title">
        {error ? (
          <>
            <span className="auth-callback-error-icon" aria-hidden="true"><AlertCircle size={32} /></span>
            <h1 id="auth-callback-title">Sign-in needs another try</h1>
            <p role="alert">{error}</p>
            <button className="btn-primary auth-callback-action" type="button" onClick={() => navigate('/login', { replace: true })}>
              <RotateCcw size={17} aria-hidden="true" /> Return to login
            </button>
          </>
        ) : (
          <>
            <CelestialLoader size={112} />
            <h1 id="auth-callback-title" role="status" aria-live="polite">{STAGE_LABELS[stage]}</h1>
            <p>Please keep this page open while your secure session is initialized.</p>
            <div className="auth-callback-foot">
              <span className="auth-callback-chip"><Lock size={14} aria-hidden="true" />Secure sign-in in progress</span>
              <span className="auth-callback-steps" aria-hidden="true">{STAGE_LABELS.map((label, index) => <i key={label} className={index <= stage ? 'is-done' : ''} />)}</span>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
