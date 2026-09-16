import {
  BookOpen,
  CalendarDays,
  LogOut,
  Menu,
  Moon,
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

const RESULT_TYPE_DETAILS = {
  chapter: { label: 'Chapter', icon: BookOpen },
  volunteer: { label: 'Volunteer', icon: UserRound },
  event: { label: 'Event', icon: CalendarDays },
};

export default function Topbar({ toggleSidebar, menuButtonRef, navigationExpanded }) {
  const navigate = useNavigate();
  const {
    logout,
    user,
    themeMode,
    toggleThemeMode,
    chapters,
    volunteersList,
    eventsList,
  } = useApp();

  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);

  const displayName = user?.name || user?.email || 'Visitor';
  const userRole = user?.role || 'Team Member';
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
          subtitle: chapter.status === 'inactive' ? 'Inactive chapter' : 'Chapter directory',
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

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          ref={menuButtonRef}
          className="menu-toggle"
          onClick={toggleSidebar}
          aria-label={navigationExpanded ? 'Close navigation' : 'Open navigation'}
          title={navigationExpanded ? 'Close navigation' : 'Open navigation'}
          aria-expanded={navigationExpanded}
          aria-controls="primary-navigation"
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
        <details className="account-menu">
          <summary aria-label={`Open account menu for ${displayName}`}>
            <span className="topbar-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</span>
            <span className="topbar-user-details"><span className="topbar-user-label">{displayName}</span><span className="topbar-user-role">{userRole}</span></span>
          </summary>
          <div className="account-menu-panel">
            <div><strong>{displayName}</strong><span>{userRole}</span></div>
            <button type="button" onClick={toggleThemeMode}>{themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />} {themeLabel}</button>
            <button type="button" onClick={handleLogout}><LogOut size={18} /> Log out</button>
          </div>
        </details>
      </div>
    </header>
  );
}
