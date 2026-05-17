import React, { useState } from 'react';
import { useApp } from '../context/AppState';
import './Login.css';

export default function Login() {
  const { login, loginWithGoogle } = useApp();
  const [email, setEmail] = useState('pmanucom@devcon.ph');
  const [password, setPassword] = useState('devconkids101');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const result = login(email, password);
    if (!result.success) {
      setError(result.message);
    }
  };

  const handleGoogleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const redirectUrl = window.location.origin + '/auth/callback';
      console.log('🔵 [GoogleSignIn] Starting Google OAuth flow');
      console.log('🔵 [GoogleSignIn] Redirect URL:', redirectUrl);
      console.log('🔵 [GoogleSignIn] Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
      console.log('🔵 [GoogleSignIn] Client ID being used (should be 615888800431-...):', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'LOADED' : 'MISSING');
      
      const result = await loginWithGoogle();
      console.log('🔵 [GoogleSignIn] loginWithGoogle() returned:', result.success ? 'SUCCESS' : 'FAILED');
      
      if (!result.success) {
        setError('Google sign-in failed. Check your Supabase OAuth setup.');
        console.error('🔵 [GoogleSignIn] Error:', result.error);
        setLoading(false);
      }
      // If successful, Supabase redirects automatically; don't reset loading
    } catch (err) {
      setError('An error occurred during sign-in.');
      console.error('🔵 [GoogleSignIn] Exception:', err);
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card card">
        <div className="login-header">
          <div className="logo-icon">{'</>'}</div>
          <h2>DEVCON <span>Kids</span></h2>
          <p>Welcome back! Please login to your account.</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@devcon.ph"
              required 
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required 
            />
          </div>
          <button type="submit" className="btn-primary login-btn">
            Sign In
          </button>
        </form>

        <div className="divider">
          <span>OR</span>
        </div>

        <button onClick={handleGoogleSignIn} disabled={loading} className="btn-secondary google-btn">
          <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
              <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
              <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
              <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
              <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
            </g>
          </svg>
          {loading ? 'Redirecting...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}
