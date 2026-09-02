import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppState';
import { Users, GraduationCap, Map, HeartHandshake, TrendingUp, CalendarDays, FolderOpen, Image as ImageIcon, Settings, CalendarPlus } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const { stats, chapters, growthData, eventsList, isSuperadmin, user, dashboardSettings } = useApp();
  const hourOfAiEvent = eventsList?.find((event) => (event.title || '').toLowerCase().includes('hour of ai')) || eventsList?.[0];
  const shouldShowChart = dashboardSettings?.showGrowthChart !== false;
  const shouldShowChapterOverview = dashboardSettings?.showChapterOverview !== false;
  const shouldShowCourseSpotlight = dashboardSettings?.showCourseSpotlight !== false;
  const shouldShowQuickActions = dashboardSettings?.showQuickActions !== false;

  // ---- Local mock data (frontend-only, not from backend) ----
  const monthlyEvents = [
    { month: 'Jan', events: 8, attendance: 32 },
    { month: 'Feb', events: 10, attendance: 41 },
    { month: 'Mar', events: 6, attendance: 25 },
    { month: 'Apr', events: 9, attendance: 36 },
    { month: 'May', events: 12, attendance: 47 },
    { month: 'Jun', events: 7, attendance: 29 },
    { month: 'Jul', events: 11, attendance: 44 },
    { month: 'Aug', events: 10, attendance: 39 }
  ];

  const inventoryStatus = [
    { name: 'Available', value: 64, color: '#10B981' },
    { name: 'Borrowed', value: 22, color: '#3B82F6' },
    { name: 'Maintenance', value: 9, color: '#F59E0B' },
    { name: 'Low Stock', value: 14, color: '#EF4444' }
  ];

  // Impact Growth Trends timeline: keeps the existing Jan–May points and
  // completes the year-to-date timeline through August (mock, frontend-only).
  const chartData = [
    ...growthData,
    { month: 'Jun', learners: 14000 },
    { month: 'Jul', learners: 15300 },
    { month: 'Aug', learners: 16800 }
  ];

  return (
    <div className={`dashboard ${dashboardSettings?.compactCards ? 'dashboard-compact' : ''}`}>
      <header className="hero-section">
        <div className="hero-content">
          <h1>Welcome back, <span>{user?.name || user?.role || 'Visitor'}!</span></h1>
          <p>Here's what's happening with DEVCON Kids across the nation today, with Hour of AI as the main course solution.</p>
        </div>
        {shouldShowQuickActions && (
          <div className="hero-actions">
            <button className="btn-secondary hero-secondary-btn" onClick={() => navigate('/dashboard/events')} type="button" aria-label="Open Events page">
              <CalendarPlus size={18} />
              Open Events
            </button>
            {isSuperadmin && (
              <button className="btn-secondary hero-secondary-btn" onClick={() => navigate('/dashboard/ai-settings')} type="button" aria-label="Open AI Settings page">
                <Settings size={18} />
                AI Settings
              </button>
            )}
          </div>
        )}
      </header>

      <section className="kpi-grid">
        <article className="kpi-card card">
          <div className="kpi-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary-purple)' }}>
            <GraduationCap size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats.learnersReached.toLocaleString()}</h3>
            <p>Total Learners</p>
          </div>
        </article>

        <article className="kpi-card card">
          <div className="kpi-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)' }}>
            <TrendingUp size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats.successfulWorkshops}</h3>
            <p>Successful Workshops</p>
          </div>
        </article>

        <article className="kpi-card card">
          <div className="kpi-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-yellow)' }}>
            <Map size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats.activeChapters}</h3>
            <p>Active Chapters</p>
          </div>
        </article>

        <article className="kpi-card card">
          <div className="kpi-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
            <HeartHandshake size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats.volunteers}</h3>
            <p>Volunteers Engaged</p>
          </div>
        </article>
      </section>

      <div className="dashboard-content">
        {shouldShowChart && (
          <section className="chart-section card">
            <header className="section-header">
              <h2>Impact Growth Trends</h2>
            </header>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
          </section>
        )}

        {shouldShowChapterOverview && (
          <section className="chapters-section card">
            <header className="section-header">
              <h2>Nationwide Impact Overview</h2>
              <p className="text-muted text-sm">Top performing chapters</p>
            </header>
            <div className="chapters-list">
              {chapters.map(chapter => (
                <article key={chapter.id} className="chapter-item">
                  <div className="chapter-header">
                    <div className="chapter-title">
                      <div className="chapter-dot" style={{ backgroundColor: chapter.color }}></div>
                      <h4>{chapter.name} Chapter</h4>
                    </div>
                    <span className="chapter-completion">{chapter.completion}% Complete</span>
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
                      role="progressbar"
                      aria-valuenow={chapter.completion}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    ></div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="events-section card">
          <header className="section-header">
            <h2>Monthly Events & Attendance</h2>
            <p className="text-muted text-sm">January – August 2026</p>
          </header>
          <div className="events-chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyEvents} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }} />
                <Legend wrapperStyle={{ paddingTop: '0.75rem' }} />
                <Bar dataKey="events" name="Events" fill="var(--primary-purple)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="attendance" name="Attendance" fill="var(--accent-green)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="inventory-section card">
          <header className="section-header">
            <h2>Inventory Status</h2>
            <p className="text-muted text-sm">Total items by category</p>
          </header>
          <div className="inventory-chart">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={inventoryStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="var(--bg-card)"
                >
                  {inventoryStatus.map(entry => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value} items`, 'Quantity']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="inventory-legend">
            {inventoryStatus.map(item => (
              <li key={item.name}>
                <span className="legend-dot" style={{ backgroundColor: item.color }}></span>
                <span className="legend-name">{item.name}</span>
                <span className="legend-value">{item.value} items</span>
              </li>
            ))}
          </ul>
        </section>

      {shouldShowCourseSpotlight && (
        <section className="course-spotlight card">
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
          <aside className="course-spotlight-card">
            {hourOfAiEvent?.image_url ? (
              <img src={hourOfAiEvent.image_url} alt={hourOfAiEvent.title} />
            ) : (
              <div className="course-image-placeholder">
                <ImageIcon size={40} />
                <span>Add an Hour of AI image in Events & CodeCamps</span>
              </div>
            )}
            <footer className="course-spotlight-footer">
              <strong>{hourOfAiEvent?.google_folder_name || 'Hour of AI'}</strong>
              <span>{hourOfAiEvent?.status || 'Scheduled'}</span>
            </footer>
          </aside>
        </section>
      )}
      </div>
    </div>
  );
}
