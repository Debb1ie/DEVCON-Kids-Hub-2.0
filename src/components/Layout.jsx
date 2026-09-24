import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AIChat from './AIChat';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const menuButtonRef = useRef(null);
  const navigationRef = useRef(null);
  const mainContentRef = useRef(null);

  const navigationExpanded = compactNavigation ? sidebarOpen : !sidebarCollapsed;
  const toggleSidebar = () => {
    if (compactNavigation) setSidebarOpen((open) => !open);
    else setSidebarCollapsed((collapsed) => !collapsed);
  };
  const closeSidebar = ({ restoreFocus = false } = {}) => {
    setSidebarOpen(false);
    if (restoreFocus) window.setTimeout(() => menuButtonRef.current?.focus(), 0);
  };

  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)');
    const updateMode = (event) => {
      setCompactNavigation(event.matches);
      setSidebarOpen(false);
    };
    query.addEventListener('change', updateMode);
    return () => query.removeEventListener('change', updateMode);
  }, []);

  const focusMainContent = (event) => {
    event.preventDefault();
    const mainContent = mainContentRef.current;
    if (!mainContent) return;
    window.history.replaceState(window.history.state, '', '#main-content');
    mainContent.scrollIntoView({ block: 'start' });
    mainContent.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const navigation = navigationRef.current;
    const focusable = navigation?.querySelectorAll('a[href], button:not([disabled])') || [];
    focusable[0]?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeSidebar({ restoreFocus: true }); return; }
      if (event.key !== 'Tab' || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content" onClick={focusMainContent}>Skip to main content</a>
      <div id="primary-navigation" ref={navigationRef} className={`sidebar-wrapper ${sidebarOpen ? 'open' : ''}`} aria-hidden={compactNavigation && !sidebarOpen ? true : undefined}>
        <Sidebar collapsed={!compactNavigation && sidebarCollapsed} onNavigate={() => compactNavigation && closeSidebar()} />
      </div>
      {sidebarOpen && (
        <button type="button" className="sidebar-overlay" onClick={() => closeSidebar({ restoreFocus: true })} aria-label="Close navigation" />
      )}
      
      <main ref={mainContentRef} className="main-content" id="main-content" tabIndex="-1">
        <Topbar toggleSidebar={toggleSidebar} menuButtonRef={menuButtonRef} navigationExpanded={navigationExpanded} />
        <div className="scrollable-content">
          <Outlet />
        </div>
      </main>

      <AIChat />
    </div>
  );
}
