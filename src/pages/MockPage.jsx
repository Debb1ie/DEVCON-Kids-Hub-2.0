import React from 'react';
import { useLocation } from 'react-router-dom';

export default function MockPage() {
  const location = useLocation();
  const pageName = location.pathname.substring(1).charAt(0).toUpperCase() + location.pathname.substring(2);

  return (
    <div className="card" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--gradient-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '2rem' }}>🚀</span>
      </div>
      <h2>{pageName || 'Page'} Section</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '1rem auto' }}>
        This is a functional prototype. The {pageName || 'page'} module would contain specific operational data and workflows for DEVCON Kids.
      </p>
      <button className="btn-secondary" style={{ marginTop: '1rem' }}>
        Explore {pageName || 'Features'}
      </button>
    </div>
  );
}
