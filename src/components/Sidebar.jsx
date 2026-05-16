import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, MapPin, Package, Settings, CalendarDays, Brain, Database } from 'lucide-react';
import { useApp } from '../context/AppState';
import './Sidebar.css';

export default function Sidebar() {
  const { user, isSuperadmin } = useApp();

  const links = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Chapters', path: '/dashboard/chapters', icon: <MapPin size={20} /> },
    { name: 'Volunteers', path: '/dashboard/volunteers', icon: <Users size={20} /> },
    { name: 'Inventory', path: '/dashboard/inventory', icon: <Package size={20} /> },
    { name: 'Events & CodeCamps', path: '/dashboard/events', icon: <CalendarDays size={20} /> },
    { name: 'AI', path: '/dashboard/knowledge-base', icon: <Brain size={20} /> },
    { name: 'Knowledge Base', path: '/dashboard/knowledge-base', icon: <Database size={20} /> },
    ...(isSuperadmin ? [
      { name: 'AI Settings', path: '/dashboard/ai-settings', icon: <Settings size={20} /> },
      { name: 'Admin', path: '/dashboard/admin', icon: <Settings size={20} /> },
      { name: 'Settings', path: '/dashboard/settings', icon: <Settings size={20} /> },
    ] : []),
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-icon">{'</>'}</div>
          <h2>DEVCON <span>Kids</span></h2>
        </div>
      </div>
      
      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink 
            key={link.path} 
            to={link.path} 
            end={link.path === '/dashboard'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{link.icon}</span>
            <span className="nav-text">{link.name}</span>
          </NavLink>
        ))}
      </nav>
      
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">A</div>
          <div className="user-info">
            <span className="user-name">{user?.name || user?.email || 'Visitor'}</span>
            <span className="user-role">{user?.role || 'Visitor'}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
