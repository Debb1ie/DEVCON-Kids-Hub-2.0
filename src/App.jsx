import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppState';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MockPage from './pages/MockPage';
import Login from './pages/Login';
import LandingPage from './pages/LandingPage';
import Volunteers from './pages/Volunteers';
import Chapters from './pages/Chapters';
import Inventory from './pages/Inventory';
import Events from './pages/Events';
import './index.css';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useApp();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppRoutes() {
  const { isAuthenticated } = useApp();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
        
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
          <Route path="settings" element={<MockPage />} />
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
