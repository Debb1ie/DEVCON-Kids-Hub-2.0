import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppState';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
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
import Settings from './pages/Settings';
// Kenneth's AI automation pages
import SocialMediaCMS from './pages/SocialMediaCMS';
import EventChecklist from './pages/EventChecklist';
import FAQSuggestions from './pages/FAQSuggestions';
import PendingApproval from './pages/PendingApproval';
import PostEventReport from './pages/PostEventReport';
import './index.css';

function ProtectedRoute({ children, roles = null }) {
  const { isAuthenticated, authLoading, isPendingVolunteer, roleKey } = useApp();

  if (authLoading)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        Loading authentication…
      </div>
    );

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isPendingVolunteer) return <Navigate to="/pending-approval" replace />;

  if (roles && !roles.includes(roleKey)) return <Navigate to="/dashboard" replace />;

  return children;
}

function SuperadminRoute({ children }) {
  const { isSuperadmin, authLoading, isAuthenticated, isPendingVolunteer } = useApp();

  if (authLoading)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        Loading authentication…
      </div>
    );

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isPendingVolunteer) return <Navigate to="/pending-approval" replace />;

  if (!isSuperadmin) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div>
          <h2 style={{ marginBottom: '0.5rem' }}>Access restricted</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            This section is for Superadmin users only.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

function AppRoutes() {
  const { isAuthenticated, authLoading, isPendingVolunteer } = useApp();

  if (authLoading)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        Loading authentication…
      </div>
    );

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LandingPage />
            )
          }
        />
        <Route
          path="/login"
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
          }
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/pending-approval"
          element={
            !isAuthenticated ? (
              <Navigate to="/login" replace />
            ) : isPendingVolunteer ? (
              <PendingApproval />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="chapters" element={<ProtectedRoute roles={['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator']}><Chapters /></ProtectedRoute>} />
          <Route path="volunteers" element={<ProtectedRoute roles={['super_admin', 'admin', 'chapter_coordinator', 'volunteer']}><Volunteers /></ProtectedRoute>} />
          <Route path="inventory" element={<ProtectedRoute roles={['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator']}><Inventory /></ProtectedRoute>} />
          <Route path="events" element={<Events />} />
          <Route path="post-event-report" element={<ProtectedRoute roles={['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator']}><PostEventReport /></ProtectedRoute>} />
          <Route
            path="admin"
            element={
              <ProtectedRoute roles={['super_admin', 'admin']}>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route path="knowledge-base" element={<ProtectedRoute roles={['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator', 'volunteer']}><KnowledgeBase /></ProtectedRoute>} />
          <Route
            path="ai-settings"
            element={
              <SuperadminRoute>
                <AISettings />
              </SuperadminRoute>
            }
          />
          {/* Kenneth's AI automation routes */}
          <Route path="social-media" element={<ProtectedRoute roles={['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator']}><SocialMediaCMS /></ProtectedRoute>} />
          <Route path="event-checklist" element={<ProtectedRoute roles={['super_admin', 'admin', 'chapter_coordinator', 'event_coordinator']}><EventChecklist /></ProtectedRoute>} />
          <Route
            path="faq-suggestions"
            element={
              <ProtectedRoute roles={['super_admin', 'admin']}>
                <FAQSuggestions />
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <SuperadminRoute>
                <Settings />
              </SuperadminRoute>
            }
          />
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
