import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Set a flag to indicate OAuth is in progress - this prevents redirect to login
    try { sessionStorage.setItem('oauth_in_progress', 'true'); } catch { /* ignore */ }

    const handleAuth = async () => {
      // Give Supabase a moment to process the OAuth callback
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Ensure session is ready (we don't need the result, just ensuring it's synced)
      await supabase.auth.getSession();
      
      // Redirect to dashboard
      navigate('/dashboard', { replace: true });
    };

    handleAuth().catch(() => {
      // On error, still redirect to dashboard
      navigate('/dashboard', { replace: true });
    });
  }, [navigate]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
      <div>
        <h2 style={{ marginBottom: '0.5rem' }}>Signing you in…</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Redirecting to dashboard...</p>
      </div>
    </div>
  );
}
