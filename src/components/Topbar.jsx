import {
  Bell,
  BellRing,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  LogOut,
  Menu,
  Moon,
  Package,
  Search,
  SearchX,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppState';
import './Topbar.css';

const INITIAL_NOTIFICATIONS = [
  { id: 'volunteer-added', type: 'volunteer', title: 'New Volunteer Added', time: '2 hours ago' },
  { id: 'event-created', type: 'event', title: 'Event Created', detail: 'Hour of AI Workshop', time: '5 hours ago' },
  { id: 'inventory-alert', type: 'inventory', title: 'Inventory Low Stock Alert', time: '1 day ago' },
];

const RESULT_TYPE_DETAILS = {
  chapter: { label: 'Chapter', icon: BookOpen },
  volunteer: { label: 'Volunteer', icon: UserRound },
  event: { label: 'Event', icon: CalendarDays },
};

const NOTIFICATION_ICONS = {
  volunteer: UserRound,
  event: CalendarPlus,
  inventory: Package,
};

export default function Topbar({ toggleSidebar }) {
  const navigate = useNavigate();
  const {
    logout,
    isSuperadmin,
    user,
    themeMode,
    toggleThemeMode,
    chapters,
    volunteersList,
    eventsList,
  } = useApp();

  const searchContainerRef = useRef(null);
  const notificationsRef = useRef(null);
  const searchInputRef = useRef(null);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);

  const displayName = user?.name || user?.email || 'Visitor';
  const userRole = user?.role || (isSuperadmin ? 'Super Admin' : 'Team Member');
  const themeLabel = themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  // Only recalculate search data when the query or searchable lists change.
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return [];

    const results = [];
    const matches = (value) => String(value || '').toLowerCase().includes(query);

    (chapters || []).forEach((chapter) => {
      if (matches(chapter.name)) {
        results.push({
          type: 'chapter',
          id: chapter.id,
          title: chapter.name,
          subtitle: `${chapter.learners || 0} learners`,
          path: '/dashboard/chapters',
        });
      }
    });

    (volunteersList || []).forEach((volunteer) => {
      if (matches(volunteer.name) || matches(volunteer.role)) {
        results.push({
          type: 'volunteer',
          id: volunteer.id,
          title: volunteer.name,
          subtitle: `${volunteer.role || 'Volunteer'} at ${volunteer.chapter || 'DEVCON Kids'}`,
          path: '/dashboard/volunteers',
        });
      }
    });

    (eventsList || []).forEach((event) => {
      if (matches(event.title) || matches(event.chapter)) {
        results.push({
          type: 'event',
          id: event.id,
          title: event.title,
          subtitle: `${event.chapter || 'DEVCON Kids'} \u2022 ${event.event_date || 'TBD'}`,
          path: '/dashboard/events',
        });
      }
    });

    return results.slice(0, 8);
  }, [chapters, eventsList, searchQuery, volunteersList]);

  // Close open panels when the user clicks outside the topbar controls.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!searchContainerRef.current?.contains(event.target)) {
        setShowSearchResults(false);
      }

      if (!notificationsRef.current?.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeSearch = () => {
    setShowSearchResults(false);
    setSelectedResultIndex(-1);
  };

  const clearSearch = () => {
    setSearchQuery('');
    closeSearch();
    searchInputRef.current?.focus();
  };

  const selectSearchResult = (result) => {
    navigate(result.path);
    setSearchQuery('');
    closeSearch();
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      closeSearch();
      return;
    }

    if (!searchResults.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setShowSearchResults(true);
      setSelectedResultIndex((current) => (current + 1) % searchResults.length);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedResultIndex((current) =>
        current <= 0 ? searchResults.length - 1 : current - 1,
      );
    }

    if (event.key === 'Enter' && selectedResultIndex >= 0) {
      event.preventDefault();
      selectSearchResult(searchResults[selectedResultIndex]);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleNewWorkshop = () => {
    navigate('/dashboard/events', { state: { openCreateForm: true } });
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="menu-toggle"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
        >
          <Menu size={24} aria-hidden="true" />
        </button>

        <div className="search-container" ref={searchContainerRef}>
          <div className="search-bar">
            <Search size={18} className="search-icon" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search chapters, volunteers, or events..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setShowSearchResults(true);
                setSelectedResultIndex(-1);
              }}
              onFocus={() => setShowSearchResults(true)}
              onKeyDown={handleSearchKeyDown}
              aria-label="Search chapters, volunteers, or events"
              aria-autocomplete="list"
              aria-controls="topbar-search-results"
              aria-expanded={showSearchResults && Boolean(searchQuery.trim())}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={clearSearch}
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {showSearchResults && searchQuery.trim() && (
            <div id="topbar-search-results" className="search-results-panel" role="listbox">
              {searchResults.length > 0 ? (
                <div className="search-results-list">
                  {searchResults.map((result, index) => {
                    const resultDetails = RESULT_TYPE_DETAILS[result.type];
                    const ResultIcon = resultDetails.icon;

                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        type="button"
                        className={`search-result-item ${selectedResultIndex === index ? 'is-selected' : ''}`}
                        onClick={() => selectSearchResult(result)}
                        onMouseEnter={() => setSelectedResultIndex(index)}
                        role="option"
                        aria-selected={selectedResultIndex === index}
                      >
                        <span className="result-icon" aria-hidden="true"><ResultIcon size={17} /></span>
                        <span className="result-content">
                          <span className="result-title">{result.title}</span>
                          <small className="result-subtitle">{result.subtitle}</small>
                        </span>
                        <span className="result-type-badge">{resultDetails.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="search-no-results" role="status">
                  <SearchX size={24} aria-hidden="true" />
                  <p>No results found</p>
                  <small>Try searching another keyword.</small>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="topbar-right">
        <button
          type="button"
          className="topbar-icon-btn theme-toggle-btn"
          onClick={toggleThemeMode}
          aria-label={themeLabel}
          title={themeLabel}
        >
          {themeMode === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>

        <div className="notifications-container" ref={notificationsRef}>
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => setShowNotifications((isOpen) => !isOpen)}
            aria-label={`Notifications${notifications.length ? `, ${notifications.length} unread` : ''}`}
            aria-expanded={showNotifications}
            aria-controls="notifications-panel"
            title="Notifications"
          >
            <Bell size={20} aria-hidden="true" />
            {notifications.length > 0 && <span className="badge">{notifications.length}</span>}
          </button>

          {showNotifications && (
            <div id="notifications-panel" className="notifications-panel" role="dialog" aria-label="Notifications">
              <div className="notifications-header">
                <h3>Notifications</h3>
                <div className="notifications-actions">
                  {notifications.length > 0 && (
                    <button type="button" className="mark-read-btn" onClick={() => setNotifications([])}>
                      Mark all as read
                    </button>
                  )}
                  <button type="button" className="notifications-close-btn" onClick={() => setShowNotifications(false)} aria-label="Close notifications" title="Close notifications">
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="notifications-list">
                {notifications.length > 0 ? (
                  notifications.map((notification) => {
                    const NotificationIcon = NOTIFICATION_ICONS[notification.type] || BellRing;

                    return (
                      <div className="notification-item" key={notification.id}>
                        <span className="notification-icon" aria-hidden="true"><NotificationIcon size={17} /></span>
                        <div className="notification-content">
                          <p><strong>{notification.title}</strong>{notification.detail && ` — ${notification.detail}`}</p>
                          <small>{notification.time}</small>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="notifications-empty" role="status">
                    <span aria-hidden="true">🎉</span>
                    <p>You&apos;re all caught up!</p>
                    <small>No new notifications.</small>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {isSuperadmin && (
          <button type="button" className="btn-primary topbar-primary-btn" onClick={handleNewWorkshop}>
            + New Workshop
          </button>
        )}

        <div className="topbar-user" title={`${displayName} — ${userRole}`}>
          <span className="topbar-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</span>
          <span className="topbar-user-details">
            <span className="topbar-user-label">{displayName}</span>
            <span className="topbar-user-role">{userRole}</span>
          </span>
        </div>

        <button type="button" className="topbar-icon-btn" onClick={handleLogout} aria-label="Log out" title="Log out">
          <LogOut size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
