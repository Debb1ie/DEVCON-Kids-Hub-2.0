import { NavLink } from 'react-router-dom';
// Kenneth's AI-route icons + Precious's panel-collapse toggle icons combined
import {
  LayoutDashboard,
  Users,
  MapPin,
  Package,
  Settings,
  CalendarDays,
  Brain,
  Database,
  ClipboardList,
  HelpCircle,
  FileText,
  UserCog,
  CloudCog,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppState';
import { canAccessRoute } from '../auth/permissions';
import logo from '../assets/devcon-kids-logo.png';
import './Sidebar.css';

export default function Sidebar({ onNavigate, collapsed = false }) {
  const { user, roleKey } = useApp();
  const visible = (link) => canAccessRoute(roleKey, link.path);
  const operationsLinks = [
    { name: 'Overview', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Chapters', path: '/dashboard/chapters', icon: <MapPin size={20} /> },
    { name: 'Volunteers', path: '/dashboard/volunteers', icon: <Users size={20} /> },
    { name: 'Inventory', path: '/dashboard/inventory', icon: <Package size={20} /> },
    { name: 'Events & CodeCamps', path: '/dashboard/events', icon: <CalendarDays size={20} /> },
    { name: 'Post Event Report', path: '/dashboard/post-event-report', icon: <FileText size={20} /> },
    { name: 'Event Checklist', path: '/dashboard/event-checklist', icon: <ClipboardList size={20} /> },
  ].filter(visible);

  const knowledgeLinks = [
    { name: 'AI Knowledge Base', path: '/dashboard/knowledge-base', icon: <Database size={20} /> },
    { name: 'FAQ Builder', path: '/dashboard/faq-suggestions', icon: <HelpCircle size={20} /> },
    { name: 'AI Settings', path: '/dashboard/ai-settings', icon: <Brain size={20} /> },
  ].filter(visible);

  const adminLinks = [
        { name: 'User Management', path: '/dashboard/users', icon: <UserCog size={20} /> },
        { name: 'Admin', path: '/dashboard/admin', icon: <ShieldCheck size={20} /> },
        { name: 'Settings', path: '/dashboard/settings', icon: <Settings size={20} /> },
        { name: 'Integrations', path: '/dashboard/integrations', icon: <CloudCog size={20} /> },
      ].filter(visible);

  const displayName = user?.name || user?.email || 'Visitor';

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <span className="brand-logo-surface"><img src={logo} alt="DEVCON Kids Hub" /></span>
          <span className="brand-wordmark" aria-hidden="true">DEVCON Kids</span>
        </div>

      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        <NavSection label="Operations" links={operationsLinks} collapsed={collapsed} onNavigate={onNavigate} />

        {knowledgeLinks.length > 0 && <NavSection label="Knowledge and AI" links={knowledgeLinks} collapsed={collapsed} onNavigate={onNavigate} />}

        {adminLinks.length > 0 && (
          <NavSection
            label="Administration"
            links={adminLinks}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">{displayName.charAt(0).toUpperCase()}</div>

          <div className="user-info">
            <span className="user-name">{displayName}</span>
            <span className="user-role">{user?.role || 'Visitor'}</span>
            {user?.chapterId && <span className="user-chapter">Chapter-scoped access</span>}
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavSection({ label, links, collapsed, onNavigate }) {
  return (
    <div className="nav-section">
      <p className="nav-section-label">{label}</p>

      <div className="nav-section-links">
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            end={link.path === '/dashboard'}
            title={collapsed ? link.name : undefined}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'active' : ''}`
            }
            onClick={onNavigate}
          >
            <span className="nav-icon" aria-hidden="true">{link.icon}</span>
            <span className="nav-text">{link.name}</span>
            <span className="nav-active-dot" aria-hidden="true" />
          </NavLink>
        ))}
      </div>
    </div>
  );
}
