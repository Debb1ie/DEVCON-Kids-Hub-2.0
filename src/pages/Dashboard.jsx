import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppState';
import { Users, GraduationCap, Map, HeartHandshake, TrendingUp, CalendarDays, FolderOpen, Image as ImageIcon, Settings, CalendarPlus } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const { stats, chapters, growthData, eventsList, isSuperadmin, user, dashboardSettings } = useApp();
  const hourOfAiEvent = eventsList?.find((event) => (event.title || '').toLowerCase().includes('hour of ai')) || eventsList?.[0];
  const shouldShowChart = dashboardSettings?.showGrowthChart !== false;
  const shouldShowChapterOverview = dashboardSettings?.showChapterOverview !== false;
  const shouldShowCourseSpotlight = dashboardSettings?.showCourseSpotlight !== false;
  const shouldShowQuickActions = dashboardSettings?.showQuickActions !== false;

  return (
    <div className={`dashboard ${dashboardSettings?.compactCards ? 'dashboard-compact' : ''}`}>
      <div className="hero-section">
        <div className="hero-content">
          <h1>Welcome back, <span>{user?.name || user?.role || 'Visitor'}!</span></h1>
          <p>Here's what's happening with DEVCON Kids across the nation today, with Hour of AI as the main course solution.</p>
        </div>
        {shouldShowQuickActions && (
          <div className="hero-actions">
            <button className="btn-secondary hero-secondary-btn" onClick={() => navigate('/dashboard/events')} type="button">
              <CalendarPlus size={18} />
              Open Events
            </button>
            {isSuperadmin && (
              <button className="btn-secondary hero-secondary-btn" onClick={() => navigate('/dashboard/ai-settings')} type="button">
                <Settings size={18} />
                AI Settings
              </button>
            )}
          </div>
        )}
      </div>

      <div className="kpi-grid">
        <div className="kpi-card card">
          <div className="kpi-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary-purple)' }}>
            <GraduationCap size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats.learnersReached.toLocaleString()}</h3>
            <p>Total Learners</p>
          </div>
        </div>

        <div className="kpi-card card">
          <div className="kpi-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)' }}>
            <TrendingUp size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats.successfulWorkshops}</h3>
            <p>Successful Workshops</p>
          </div>
        </div>

        <div className="kpi-card card">
          <div className="kpi-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-yellow)' }}>
            <Map size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats.activeChapters}</h3>
            <p>Active Chapters</p>
          </div>
        </div>

        <div className="kpi-card card">
          <div className="kpi-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
            <HeartHandshake size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats.volunteers}</h3>
            <p>Volunteers Engaged</p>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        {shouldShowChart && (
          <div className="chart-section card">
          <div className="section-header">
            <h2>Impact Growth Trends</h2>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={growthData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLearners" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary-purple)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="var(--primary-purple)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }}
                />
                <Area type="monotone" dataKey="learners" stroke="var(--primary-purple)" fillOpacity={1} fill="url(#colorLearners)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </div>
        )}

        {shouldShowChapterOverview && (
          <div className="chapters-section card">
          <div className="section-header">
            <h2>Nationwide Impact Overview</h2>
            <p className="text-muted text-sm">Top performing chapters</p>
          </div>
          <div className="chapters-list">
            {chapters.map(chapter => (
              <div key={chapter.id} className="chapter-item">
                <div className="chapter-header">
                  <div className="chapter-title">
                    <div className="chapter-dot" style={{ backgroundColor: chapter.color }}></div>
                    <h4>{chapter.name} Chapter</h4>
                  </div>
                  <span className="chapter-completion">{chapter.completion}% Completion</span>
                </div>
                
                <div className="chapter-stats">
                  <div className="stat">
                    <span className="stat-val">{chapter.learners.toLocaleString()}</span>
                    <span className="stat-label">Learners</span>
                  </div>
                  <div className="stat">
                    <span className="stat-val">{chapter.workshops}</span>
                    <span className="stat-label">Workshops</span>
                  </div>
                </div>

                <div className="progress-bar-bg">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${chapter.completion}%`, backgroundColor: chapter.color }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          </div>
        )}
      </div>

      {shouldShowCourseSpotlight && (
        <div className="course-spotlight card">
          <div className="course-spotlight-copy">
            <div className="course-tag">Main Course Focus</div>
            <h2>Hour of AI</h2>
            <p>
              A cycle program designed for kids and handled by coordinators across every chapter. Use the dashboard to
              plan events, create codecamps, and generate a matching Google Drive folder structure for each run.
            </p>
            <div className="course-meta">
              <span><CalendarDays size={14} /> Coordinated event delivery</span>
              <span><FolderOpen size={14} /> Auto-generated Google folder</span>
              <span><Users size={14} /> Admin and coordinator visibility</span>
            </div>
          </div>
          <div className="course-spotlight-card">
            {hourOfAiEvent?.image_url ? (
              <img src={hourOfAiEvent.image_url} alt={hourOfAiEvent.title} />
            ) : (
              <div className="course-image-placeholder">
                <ImageIcon size={40} />
                <span>Add an Hour of AI image in Events & CodeCamps</span>
              </div>
            )}
            <div className="course-spotlight-footer">
              <strong>{hourOfAiEvent?.google_folder_name || 'Hour of AI'}</strong>
              <span>{hourOfAiEvent?.status || 'Scheduled'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
