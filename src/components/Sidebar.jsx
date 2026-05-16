import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, MapPin, Package, Settings, CalendarDays } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
  const links = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Chapters', path: '/dashboard/chapters', icon: <MapPin size={20} /> },
    { name: 'Volunteers', path: '/dashboard/volunteers', icon: <Users size={20} /> },
    { name: 'Inventory', path: '/dashboard/inventory', icon: <Package size={20} /> },
    { name: 'Events & CodeCamps', path: '/dashboard/events', icon: <CalendarDays size={20} /> },
    { name: 'Settings', path: '/dashboard/settings', icon: <Settings size={20} /> },
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
            <span className="user-name">Admin User</span>
            <span className="user-role">Superadmin</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
