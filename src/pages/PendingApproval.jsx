import { Clock3, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppState';
import './Login.css';

export default function PendingApproval() {
  const navigate = useNavigate();
  const { user, logout } = useApp();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="login-container">
      <section className="login-card card" aria-labelledby="pending-title">
        <div className="login-header">
          <div className="logo-icon" aria-hidden="true"><Clock3 size={24} /></div>
          <h1 id="pending-title">Account awaiting approval</h1>
          <p>
            Thanks for signing in{user?.name ? `, ${user.name}` : ''}. An authorized
            DEVCON Kids coordinator or administrator must approve your account before
            the workspace becomes available.
          </p>
        </div>
        <button type="button" className="btn-secondary login-btn" onClick={handleLogout}>
          <LogOut size={18} aria-hidden="true" /> Sign out
        </button>
      </section>
    </main>
  );
}
