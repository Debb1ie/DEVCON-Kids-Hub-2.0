import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppState';

export default function AuthCallback() {
  const { authLoading, isAuthenticated } = useApp();

  useEffect(() => {
    document.title = 'Signing you in...';
  }, []);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center' }}>
        <div>
          <h2 style={{ marginBottom: '0.5rem' }}>Signing you in...</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Please wait while we finish setting up your session.</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
}
