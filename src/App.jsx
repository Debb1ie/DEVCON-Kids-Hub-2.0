import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppState';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MockPage from './pages/MockPage';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import LandingPage from './pages/LandingPage';
import Volunteers from './pages/Volunteers';
import Chapters from './pages/Chapters';
import Inventory from './pages/Inventory';
import Events from './pages/Events';
import Admin from './pages/Admin';
import KnowledgeBase from './pages/KnowledgeBase';
import AISettings from './pages/AISettings';
import './index.css';

function ProtectedRoute({ children }) {
  const { isAuthenticated, authLoading } = useApp();
  if (authLoading) return <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh'}}>Loading authentication…</div>;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function SuperadminRoute({ children }) {
  const { isSuperadmin, authLoading, isAuthenticated } = useApp();
  if (authLoading) return <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh'}}>Loading authentication…</div>;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!isSuperadmin) {
    return (
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center'}}>
        <div>
          <h2 style={{marginBottom: '0.5rem'}}>Access restricted</h2>
          <p style={{margin: 0, color: 'var(--text-muted)'}}>This section is for Superadmin users only.</p>
        </div>
      </div>
    );
  }
  return children;
}

function AppRoutes() {
  const { isAuthenticated, authLoading } = useApp();

  if (authLoading) return <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh'}}>Loading authentication…</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="chapters" element={<Chapters />} />
          <Route path="volunteers" element={<Volunteers />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="events" element={<Events />} />
          <Route path="admin" element={<SuperadminRoute><Admin /></SuperadminRoute>} />
          <Route path="knowledge-base" element={<KnowledgeBase />} />
          <Route path="ai-settings" element={<SuperadminRoute><AISettings /></SuperadminRoute>} />
          <Route path="settings" element={<SuperadminRoute><MockPage /></SuperadminRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}

export default App;
