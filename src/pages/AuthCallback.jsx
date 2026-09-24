import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AUTH_CALLBACK_PATH, completeOAuthCallback, getPostAuthRoute, withTimeout } from '../auth/authFlow';
import { useApp } from '../context/AppState';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { acceptSession } = useApp();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const finish = async () => {
      try {
        const session = await withTimeout(completeOAuthCallback(supabase.auth, window.location.href));

        // Remove the one-time code and provider parameters without logging or
        // retaining them in browser history.
        window.history.replaceState({}, document.title, AUTH_CALLBACK_PATH);
        const profile = await acceptSession(session);
        navigate(getPostAuthRoute(profile), { replace: true });
      } catch {
        setError('Google sign-in could not be completed. Please return to login and try again.');
      }
    };

    void finish();
  }, [acceptSession, navigate]);

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center', background: 'var(--surface-canvas, var(--bg-main))' }}>
      <div className="card" style={{ maxWidth: 440, width: '100%', padding: '2.5rem 2rem', borderRadius: 'var(--radius-lg, 16px)' }}>
        {error ? (
          <>
            <AlertCircle size={44} color="var(--state-danger, #d62035)" aria-hidden="true" style={{ margin: '0 auto' }} />
            <h2 style={{ margin: '1rem 0 0.5rem', color: 'var(--text-main)', fontSize: '1.4rem' }}>Sign-in needs another try</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>{error}</p>
            <button className="btn-primary" type="button" onClick={() => navigate('/login', { replace: true })} style={{ width: '100%', minHeight: 44, justifyContent: 'center' }}>
              <RotateCcw size={17} /> Return to login
            </button>
          </>
        ) : (
          <>
            <Loader2 className="spin" size={44} color="var(--brand-purple)" aria-hidden="true" style={{ margin: '0 auto' }} />
            <h2 style={{ margin: '1rem 0 0.5rem', color: 'var(--text-main)', fontSize: '1.4rem' }}>Completing Google sign-in…</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>Please keep this page open while your secure session is initialized.</p>
          </>
        )}
      </div>
    </div>
  );
}
