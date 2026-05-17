import { Bell, Search, Menu, LogOut, Sun, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useApp } from '../context/AppState';
import './Topbar.css';

export default function Topbar({ toggleSidebar }) {
  const navigate = useNavigate();
  const { logout, isSuperadmin, user, themeMode, toggleThemeMode, chapters, volunteersList, eventsList } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleNewWorkshop = () => {
    navigate('/dashboard/events', { state: { openCreateForm: true } });
  };

  const handleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  const searchResults = (() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    const results = [];

    // Search chapters
    (chapters || []).forEach((chapter) => {
      if (chapter.name.toLowerCase().includes(query)) {
        results.push({
          type: 'chapter',
          id: chapter.id,
          title: chapter.name,
          subtitle: `${chapter.learners} learners`,
          onClick: () => navigate('/dashboard/chapters')
        });
      }
    });

    // Search volunteers
    (volunteersList || []).forEach((volunteer) => {
      if (
        volunteer.name.toLowerCase().includes(query) ||
        volunteer.role.toLowerCase().includes(query)
      ) {
        results.push({
          type: 'volunteer',
          id: volunteer.id,
          title: volunteer.name,
          subtitle: `${volunteer.role} at ${volunteer.chapter}`,
          onClick: () => navigate('/dashboard/volunteers')
        });
      }
    });

    // Search events
    (eventsList || []).forEach((event) => {
      if (
        event.title.toLowerCase().includes(query) ||
        event.chapter.toLowerCase().includes(query)
      ) {
        results.push({
          type: 'event',
          id: event.id,
          title: event.title,
          subtitle: `${event.chapter} • ${event.event_date || 'TBD'}`,
          onClick: () => navigate('/dashboard/events')
        });
      }
    });

    return results.slice(0, 8); // Limit to 8 results
  })();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="menu-toggle" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
        <div className="search-container">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search for chapters, volunteers, or workshops..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
            />
          </div>
          {showSearchResults && searchQuery.trim() && (
            <div className="search-results-panel">
              {searchResults.length > 0 ? (
                <div className="search-results-list">
                  {searchResults.map((result) => (
                    <div
                      key={`${result.type}-${result.id}`}
                      className="search-result-item"
                      onClick={() => {
                        result.onClick();
                        setSearchQuery('');
                        setShowSearchResults(false);
                      }}
                    >
                      <div className="result-type-badge">{result.type}</div>
                      <div className="result-content">
                        <p className="result-title">{result.title}</p>
                        <small className="result-subtitle">{result.subtitle}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="search-no-results">
                  <p>No results found for "{searchQuery}"</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="topbar-right">
        <button type="button" className="topbar-icon-btn" onClick={toggleThemeMode} title={themeMode === 'dark' ? 'Light Mode' : 'Dark Mode'}>
          {themeMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <div className="notifications-container">
          <button type="button" className="topbar-icon-btn" onClick={handleNotifications} title="Notifications">
            <Bell size={20} />
            <span className="badge">3</span>
          </button>
          {showNotifications && (
            <div className="notifications-panel">
              <div className="notifications-header">
                <h3>Notifications</h3>
                <button type="button" onClick={() => setShowNotifications(false)}>✕</button>
              </div>
              <div className="notifications-list">
                <div className="notification-item">
                  <p><strong>New Volunteer Added</strong></p>
                  <small>2 hours ago</small>
                </div>
                <div className="notification-item">
                  <p><strong>Event Created</strong> - Hour of AI Workshop</p>
                  <small>5 hours ago</small>
                </div>
                <div className="notification-item">
                  <p><strong>Inventory Low Stock Alert</strong></p>
                  <small>1 day ago</small>
                </div>
              </div>
            </div>
          )}
        </div>
        {isSuperadmin && (
          <button type="button" className="btn-primary topbar-primary-btn" onClick={handleNewWorkshop}>
            + New Workshop
          </button>
        )}
        <span className="topbar-user-label" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {user?.name || user?.email || 'Visitor'}
        </span>
        <button type="button" className="topbar-icon-btn" onClick={handleLogout} title="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}
