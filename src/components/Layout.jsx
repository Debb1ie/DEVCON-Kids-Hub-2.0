import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AIChat from './AIChat';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiChatOpen, setAIChatOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="app-container">
      <div className={`sidebar-wrapper ${sidebarOpen ? 'open' : ''}`}>
        <Sidebar />
      </div>
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar}></div>
      )}
      
      <main className="main-content">
        <Topbar toggleSidebar={toggleSidebar} />
        <div className="scrollable-content animate-fade-in">
          <Outlet />
        </div>
      </main>

      {/* AI Chat Widget */}
      {!aiChatOpen && <AIChat />}
      {aiChatOpen && <AIChat isFullscreen={true} onClose={() => setAIChatOpen(false)} />}
    </div>
  );
}
