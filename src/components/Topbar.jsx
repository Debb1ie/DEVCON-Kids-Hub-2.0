import React from 'react';
import { Bell, Search, Menu, LogOut } from 'lucide-react';
import { useApp } from '../context/AppState';
import './Topbar.css';

export default function Topbar({ toggleSidebar }) {
  const { logout } = useApp();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="menu-toggle" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input type="text" placeholder="Search for chapters, volunteers, or workshops..." />
        </div>
      </div>
      
      <div className="topbar-right">
        <button className="icon-btn">
          <Bell size={20} />
          <span className="badge">3</span>
        </button>
        <button className="btn-primary">
          + New Workshop
        </button>
        <button className="icon-btn" onClick={logout} title="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}
