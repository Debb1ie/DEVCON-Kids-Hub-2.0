import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppState';
import { BrandLockup } from '../components/brand/SparkHub';
import { NovaHost } from '../components/brand/Nova';
import CosmicBackground from '../components/brand/CosmicBackground';
import './Login.css';

// Email and password sign-in is presented for the approved design, but this app only
// authenticates with Google OAuth today. Keep this false until Supabase email auth and
// account provisioning are configured; the form then needs to be wired to AppState.
const EMAIL_PASSWORD_ENABLED = false;

// Decorative constellation for the brand panel (abstract, not chapter data).
const NETWORK_NODES = [[118, 92, 5], [182, 168, 9], [196, 182, 5.5], [292, 204, 5], [398, 300, 6], [262, 330, 5.5], [284, 334, 5], [344, 344, 9], [392, 416, 5], [456, 472, 7], [430, 512, 5], [248, 480, 5], [66, 360, 4.5]];
const NETWORK_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [5, 6], [6, 7], [7, 4], [7, 8], [8, 9], [9, 10], [8, 11], [1, 12]];

function BrandNetwork() {
  return (
    <svg className="login-network" viewBox="0 0 520 560" aria-hidden="true" focusable="false">
      {NETWORK_LINKS.map(([a, b], index) => (
        <path key={`l${index}`} d={`M${NETWORK_NODES[a][0]} ${NETWORK_NODES[a][1]}L${NETWORK_NODES[b][0]} ${NETWORK_NODES[b][1]}`} className="login-network-link" />
      ))}
      {NETWORK_LINKS.filter((_, index) => index % 3 === 0).map(([a, b], index) => (
        <circle key={`t${index}`} r="2.4" className={`login-network-traveler ${index % 2 ? 'is-cyan' : ''}`} style={{ '--from-x': `${NETWORK_NODES[a][0]}px`, '--from-y': `${NETWORK_NODES[a][1]}px`, '--to-x': `${NETWORK_NODES[b][0]}px`, '--to-y': `${NETWORK_NODES[b][1]}px`, animationDelay: `${index * 1.3}s` }} />
      ))}
      {NETWORK_NODES.map(([x, y, r], index) => (
        <g key={`n${index}`}>
          <circle cx={x} cy={y} r={r + 6} className="login-network-halo" />
          <circle cx={x} cy={y} r={r} className={index === 7 ? 'login-network-node is-spark' : 'login-network-node'} />
          {index % 4 === 1 && <circle cx={x} cy={y} r={r} className="login-network-pulse" style={{ animationDelay: `${index * 0.6}s` }} />}
        </g>
      ))}
    </svg>
  );
}

export default function Login() {
  const { loginWithGoogle } = useApp();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [notice, setNotice] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const handleGoogleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const result = await loginWithGoogle();
      if (!result.success) {
        setError(result.error?.message || 'Google sign-in failed. Please try again.');
        setLoading(false);
      }
      // If successful, Supabase redirects automatically; don't reset loading
    } catch (err) {
      setError('An error occurred during sign-in.');
      console.error('🔵 [GoogleSignIn] Exception:', err);
      setLoading(false);
    }
  };

  const handleEmailSignIn = (e) => {
    e.preventDefault();
    setError('');
    if (!EMAIL_PASSWORD_ENABLED) {
      setNotice('Email sign-in is not available yet. Please use Continue with Google.');
    }
  };

  const handleForgotPassword = () => {
    setNotice('Password reset is not available yet. Please use Continue with Google.');
  };

  return (
    <div className="login-container">
      <section className="login-brand" aria-label="DEVCON Kids Hub">
        <CosmicBackground mode="container" tone="dark" intensity={1.6} seed={5} />
        <BrandLockup layout="horizontal" tone="onDark" size={44} className="login-brand-lockup" />
        <BrandNetwork />
        <div className="login-brand-copy">
          <p className="login-brand-line">Learn.<br />{' '}Build.<br />{' '}<span>Belong.</span></p>
          <p className="login-brand-sub">The workspace for the people who run DEVCON Kids Hub.</p>
        </div>
      </section>

      <main className="login-auth">
        <div className="login-card">
          <NovaHost state={passwordFocused ? 'happy' : 'neutral'} size={112} />
          <div className="login-header">
            <h1>Welcome back</h1>
            <p>Sign in to plan events, review reports and support your chapter.</p>
          </div>

          {error && <div className="error-message" role="alert">{error}</div>}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="btn-secondary google-btn"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
              </g>
            </svg>
            {loading ? 'Redirecting...' : 'Continue with Google'}
          </button>

          <div className="login-divider" role="separator"><span>or sign in with email</span></div>

          <form className="login-form" onSubmit={handleEmailSignIn} noValidate>
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <div className="login-input">
                <Mail size={18} aria-hidden="true" />
                <input id="login-email" type="email" autoComplete="email" placeholder="you@devcon.ph" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="login-field">
              <div className="login-field-row">
                <label htmlFor="login-password">Password</label>
                <button type="button" className="login-link" onClick={handleForgotPassword}>Forgot password?</button>
              </div>
              <div className="login-input">
                <Lock size={18} aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <button type="button" className="login-reveal" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            {notice && <p className="login-notice" role="status">{notice}</p>}
            <button type="submit" className="btn-primary login-submit">Sign in</button>
          </form>

          <p className="login-trust"><ShieldCheck size={18} aria-hidden="true" />Access is role-based and approved by your chapter lead.</p>

          <div className="login-footer">
            <span>New volunteer?</span>
            <button type="button" className="login-link" onClick={handleGoogleSignIn} disabled={loading}>Request access</button>
            <span aria-hidden="true">·</span>
            <button type="button" className="login-link" onClick={() => setShowHelp((value) => !value)} aria-expanded={showHelp} aria-controls="login-help">Get help</button>
          </div>
          {showHelp && (
            <p id="login-help" className="login-help">
              Sign in with the Google account you use for DEVCON. New accounts start as pending volunteers until a chapter lead approves them.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
