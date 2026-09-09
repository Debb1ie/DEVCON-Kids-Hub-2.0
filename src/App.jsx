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
import VolunteerEvents from './pages/VolunteerEvents';
import Admin from './pages/Admin';
import KnowledgeBase from './pages/KnowledgeBase';
import AISettings from './pages/AISettings';
import Settings from './pages/Settings';
// Kenneth's AI automation pages
import EventChecklist from './pages/EventChecklist';
import FAQSuggestions from './pages/FAQSuggestions';
import PendingApproval from './pages/PendingApproval';
import PostEventReport from './pages/PostEventReport';
import UserManagement from './pages/UserManagement';
import { canAccessRoute, defaultRouteForRole } from './auth/permissions';
import './index.css';

function AuthLoading() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>Loading authentication…</div>;
}

function PublicOnlyRoute({ children, authenticatedDestination = '/dashboard' }) {
  const { isAuthenticated, authLoading } = useApp();
  if (authLoading) return <AuthLoading />;
  return isAuthenticated ? <Navigate to={authenticatedDestination} replace /> : children;
}

function ProtectedRoute({ children, route = null }) {
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

  if (route && !canAccessRoute(roleKey, route)) return <Navigate to={defaultRouteForRole(roleKey)} replace />;

  return children;
}

function AppRoutes() {
  const { isAuthenticated, authLoading, isPendingVolunteer, roleKey } = useApp();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnlyRoute><LandingPage /></PublicOnlyRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute><Login /></PublicOnlyRoute>
          }
        />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/pending-approval"
          element={
            authLoading ? (
              <AuthLoading />
            ) : !isAuthenticated ? (
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
          <Route index element={<ProtectedRoute route="/dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="chapters" element={<ProtectedRoute route="/dashboard/chapters"><Chapters /></ProtectedRoute>} />
          <Route path="volunteers" element={<ProtectedRoute route="/dashboard/volunteers"><Volunteers /></ProtectedRoute>} />
          <Route path="inventory" element={<ProtectedRoute route="/dashboard/inventory"><Inventory /></ProtectedRoute>} />
          <Route path="events" element={<ProtectedRoute route="/dashboard/events">{roleKey === 'volunteer' ? <VolunteerEvents /> : <Events />}</ProtectedRoute>} />
          <Route path="post-event-report" element={<ProtectedRoute route="/dashboard/post-event-report"><PostEventReport /></ProtectedRoute>} />
          <Route
            path="admin"
            element={
              <ProtectedRoute route="/dashboard/admin">
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route path="users" element={<ProtectedRoute route="/dashboard/users"><UserManagement /></ProtectedRoute>} />
          <Route path="knowledge-base" element={<ProtectedRoute route="/dashboard/knowledge-base"><KnowledgeBase /></ProtectedRoute>} />
          <Route
            path="ai-settings"
            element={
              <ProtectedRoute route="/dashboard/ai-settings">
                <AISettings />
              </ProtectedRoute>
            }
          />
          {/* Retired feature URLs return authenticated users to the dashboard. */}
          <Route path="social-media" element={<Navigate to="/dashboard" replace />} />
          {/* Kenneth's AI automation routes */}
          <Route path="event-checklist" element={<ProtectedRoute route="/dashboard/event-checklist"><EventChecklist /></ProtectedRoute>} />
          <Route
            path="faq-suggestions"
            element={
              <ProtectedRoute route="/dashboard/faq-suggestions">
                <FAQSuggestions />
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedRoute route="/dashboard/settings">
                <Settings />
              </ProtectedRoute>
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
