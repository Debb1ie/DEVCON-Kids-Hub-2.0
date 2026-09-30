import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppState';
import { NovaHost } from '../components/brand/Nova';
import HeaderAtmosphere from '../components/brand/HeaderAtmosphere';
import './Login.css';

export default function PendingApproval() {
  const navigate = useNavigate();
  const { user, logout } = useApp();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="login-container is-single">
      <HeaderAtmosphere />
      <section className="login-card card pending-card" aria-labelledby="pending-title">
        <NovaHost state="sleeping" size={96} />
        <div className="login-header">
          <h1 id="pending-title">Account awaiting approval</h1>
          <p>
            Thanks for signing in{user?.name ? `, ${user.name}` : ''}. An authorized
            DEVCON Kids coordinator or administrator must approve your account before
            the workspace becomes available.
          </p>
        </div>
        <button type="button" className="btn-secondary login-submit" onClick={handleLogout}>
          <LogOut size={18} aria-hidden="true" /> Sign out
        </button>
      </section>
    </main>
  );
}
