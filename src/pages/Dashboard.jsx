import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppState';
import {
  Users,
  GraduationCap,
  Map,
  HeartHandshake,
  TrendingUp,
  CalendarDays,
  FolderOpen,
  Image as ImageIcon,
  Settings,
  CalendarPlus,
  Package,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import './Dashboard.css';

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    stats,
    chapters,
    growthData,
    eventsList,
    inventoryList,
    isSuperadmin,
    user,
    dashboardSettings,
  } = useApp();

  const spotlightEvent = eventsList?.[0];

  const shouldShowChart = dashboardSettings?.showGrowthChart !== false;
  const shouldShowChapterOverview = dashboardSettings?.showChapterOverview !== false;
  const shouldShowCourseSpotlight = dashboardSettings?.showCourseSpotlight !== false;
  const shouldShowQuickActions = dashboardSettings?.showQuickActions !== false;

  // Real events distribution grouped by month from eventsList
  const monthlyEventsData = useMemo(() => {
    if (!eventsList || eventsList.length === 0) return [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const counts = {};
    eventsList.forEach((ev) => {
      if (!ev.event_date) return;
      const d = new Date(ev.event_date);
      if (!isNaN(d.getTime())) {
        const monthKey = monthNames[d.getUTCMonth()];
        counts[monthKey] = (counts[monthKey] || 0) + 1;
      }
    });
    return monthNames
      .filter((m) => counts[m] !== undefined)
      .map((m) => ({ month: m, events: counts[m] }));
  }, [eventsList]);

  // Real inventory status distribution grouped by stock level / status
  const inventoryStatusData = useMemo(() => {
    if (!inventoryList || inventoryList.length === 0) return [];
    const counts = {};
    inventoryList.forEach((item) => {
      const status =
        item.status ||
        (item.stock > 10 ? 'In Stock' : item.stock > 0 ? 'Low Stock' : 'Out of Stock');
      counts[status] = (counts[status] || 0) + 1;
    });
    const palette = {
      'In Stock': 'var(--brand-green)',
      Available: 'var(--brand-green)',
      'Low Stock': 'var(--brand-yellow)',
      'Out of Stock': 'var(--brand-orange)',
      Maintenance: 'var(--brand-purple)',
    };
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      color: palette[name] || 'var(--brand-purple)',
    }));
  }, [inventoryList]);

  // Use growthData directly from AppState (no fabricated future points)
  const chartData = growthData || [];

  const topChapters = useMemo(() => {
    if (!chapters?.length) return [];
    return [...chapters]
      .sort((a, b) => (Number(b.learners) || 0) - (Number(a.learners) || 0))
      .slice(0, 5);
  }, [chapters]);

  const hasAdditionalChapters = (chapters?.length || 0) > topChapters.length;

  const scopeLabel = useMemo(() => {
    if (['super_admin', 'admin'].includes(user?.roleKey)) return 'National scope';
    if (user?.chapterId) {
      const chapter = chapters?.find((c) => c.id === user.chapterId);
      return chapter?.name ? `${chapter.name} chapter` : 'Assigned chapter';
    }
    return 'Operations scope';
  }, [chapters, user]);

  return (
    <div className={`dashboard ${dashboardSettings?.compactCards ? 'dashboard-compact' : ''}`}>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${user?.name || user?.role || 'Volunteer'}!`}
        description="Here's what's happening with DEVCON Kids across the nation."
        scope={scopeLabel}
        actions={
          shouldShowQuickActions && (
            <div className="dashboard-quick-actions">
              <button
                className="btn-secondary"
                onClick={() => navigate('/dashboard/events')}
                type="button"
                aria-label="Open Events page"
              >
                <CalendarPlus size={18} />
                Open Events
              </button>
              {isSuperadmin && (
                <button
                  className="btn-secondary"
                  onClick={() => navigate('/dashboard/ai-settings')}
                  type="button"
                  aria-label="Open AI Settings page"
                >
                  <Settings size={18} />
                  AI Settings
                </button>
              )}
            </div>
          )
        }
      />

      <section className="kpi-grid" aria-label="Key Performance Indicators">
        <article className="kpi-card card">
          <div className="kpi-icon kpi-icon--purple">
            <GraduationCap size={24} />
          </div>
          <div className="kpi-info">
            <h3>{(stats?.learnersReached || 0).toLocaleString()}</h3>
            <p>Total Learners</p>
          </div>
        </article>

        <article className="kpi-card card">
          <div className="kpi-icon kpi-icon--green">
            <TrendingUp size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats?.successfulWorkshops ?? 0}</h3>
            <p>Successful Workshops</p>
          </div>
        </article>

        <article className="kpi-card card">
          <div className="kpi-icon kpi-icon--yellow">
            <Map size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats?.activeChapters ?? chapters?.length ?? 0}</h3>
            <p>Active Chapters</p>
          </div>
        </article>

        <article className="kpi-card card">
          <div className="kpi-icon kpi-icon--orange">
            <HeartHandshake size={24} />
          </div>
          <div className="kpi-info">
            <h3>{stats?.volunteers ?? 0}</h3>
            <p>Volunteers Engaged</p>
          </div>
        </article>
      </section>

      <div className="dashboard-content">
        {shouldShowChart && (
          <section className="chart-section card" aria-labelledby="growth-chart-title">
            <header className="section-header">
              <h2 id="growth-chart-title">Impact Growth Trends</h2>
              <p className="text-muted text-sm">Learners reached across all chapter programs</p>
            </header>
            {chartData.length > 0 ? (
              <div
                className="chart-container"
                role="img"
                aria-label="Impact growth trend showing learners reached by month"
              >
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 280 }}>
                  <AreaChart
                    accessibilityLayer
                    data={chartData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorLearners" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand-purple)" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="var(--brand-purple)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border-default)"
                      strokeOpacity={0.6}
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--surface-default)',
                        borderColor: 'var(--border-default)',
                        borderRadius: 'var(--radius-control)',
                        boxShadow: 'var(--shadow-md)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="learners"
                      stroke="var(--brand-purple)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorLearners)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="No growth trends recorded"
                description="Learner impact trends will appear here as chapter records are updated."
                size="sm"
              />
            )}
          </section>
        )}

        {shouldShowChapterOverview && (
          <section className="chapters-section card" aria-labelledby="chapters-section-title">
            <header className="section-header">
              <h2 id="chapters-section-title">Nationwide Impact Overview</h2>
              <p className="text-muted text-sm">Active regional chapters</p>
            </header>
            {chapters && chapters.length > 0 ? (
              <>
                <div
                  className="chapters-list"
                  tabIndex={0}
                  aria-label="Top chapters by learners reached"
                >
                  {topChapters.map((chapter, idx) => {
                    const completion = chapter.completion == null
                      ? null
                      : Math.min(100, Math.max(0, Number(chapter.completion) || 0));
                    return (
                    <article key={chapter.id || idx} className="chapter-item">
                      <div className="chapter-header">
                        <div className="chapter-title">
                          <h4>{chapter.name} Chapter</h4>
                        </div>
                        <span className="chapter-completion">
                          {completion == null ? 'Progress not reported' : `${completion}% complete`}
                        </span>
                      </div>

                      <div className="chapter-stats">
                        <div className="stat">
                          <span className="stat-val">{(chapter.learners || 0).toLocaleString()}</span>
                          <span className="stat-label">Learners</span>
                        </div>
                        <div className="stat">
                          <span className="stat-val">{chapter.workshops || 0}</span>
                          <span className="stat-label">Workshops</span>
                        </div>
                      </div>

                      {completion != null && (
                        <div className="progress-bar-bg">
                          <div
                            className={`progress-bar-fill ${completion === 0 ? 'is-zero' : ''}`}
                            style={{ width: `${completion}%` }}
                            role="progressbar"
                            aria-label={`${chapter.name} chapter progress`}
                            aria-valuenow={completion}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          ></div>
                        </div>
                      )}
                    </article>
                    );
                  })}
                </div>
                {hasAdditionalChapters && (
                  <button
                    className="chapters-view-all"
                    onClick={() => navigate('/dashboard/chapters')}
                    type="button"
                  >
                    View all chapters
                  </button>
                )}
              </>
            ) : (
              <EmptyState
                icon={Map}
                title="No active chapters"
                description="Chapters will appear here once registered in the directory."
                size="sm"
                actions={
                  <button
                    className="btn-secondary"
                    onClick={() => navigate('/dashboard/chapters')}
                    type="button"
                  >
                    View Chapters
                  </button>
                }
              />
            )}
          </section>
        )}

        <section className="events-section card" aria-labelledby="events-section-title">
          <header className="section-header">
            <h2 id="events-section-title">Monthly Events Distribution</h2>
            <p className="text-muted text-sm">Scheduled workshops and CodeCamps</p>
          </header>
          {monthlyEventsData.length > 0 ? (
            <div className="events-chart">
              <ResponsiveContainer width="100%" height={260} initialDimension={{ width: 1, height: 260 }}>
                <BarChart
                  data={monthlyEventsData}
                  margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border-default)"
                    strokeOpacity={0.6}
                  />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-default)',
                      borderColor: 'var(--border-default)',
                      borderRadius: 'var(--radius-control)',
                      boxShadow: 'var(--shadow-md)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <Bar
                    dataKey="events"
                    name="Events"
                    fill="var(--brand-purple)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No events recorded"
              description="Monthly event distributions will appear here once events are scheduled."
              size="sm"
              actions={
                <button
                  className="btn-secondary"
                  onClick={() => navigate('/dashboard/events')}
                  type="button"
                >
                  Open Events
                </button>
              }
            />
          )}
        </section>

        <section className="inventory-section card" aria-labelledby="inventory-section-title">
          <header className="section-header">
            <h2 id="inventory-section-title">Inventory Status</h2>
            <p className="text-muted text-sm">Stock levels across workshop equipment</p>
          </header>
          {inventoryStatusData.length > 0 ? (
            <>
              <div className="inventory-chart">
                <ResponsiveContainer width="100%" height={220} initialDimension={{ width: 1, height: 220 }}>
                  <PieChart>
                    <Pie
                      data={inventoryStatusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      stroke="var(--surface-default)"
                    >
                      {inventoryStatusData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`${value} items`, 'Quantity']}
                      contentStyle={{
                        backgroundColor: 'var(--surface-default)',
                        borderColor: 'var(--border-default)',
                        borderRadius: 'var(--radius-control)',
                        boxShadow: 'var(--shadow-md)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="inventory-legend">
                {inventoryStatusData.map((item) => (
                  <li key={item.name}>
                    <span className="legend-dot" style={{ backgroundColor: item.color }}></span>
                    <span className="legend-name">{item.name}</span>
                    <span className="legend-value">
                      {item.value} {item.value === 1 ? 'item' : 'items'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              icon={Package}
              title="No inventory records"
              description="Hardware and workshop kits will appear here once recorded."
              size="sm"
              actions={
                <button
                  className="btn-secondary"
                  onClick={() => navigate('/dashboard/inventory')}
                  type="button"
                >
                  View Inventory
                </button>
              }
            />
          )}
        </section>

        {shouldShowCourseSpotlight && (
          <section className="course-spotlight card" aria-labelledby="course-spotlight-title">
            <div className="course-spotlight-copy">
              <div className="course-tag">Program Focus</div>
              <h2 id="course-spotlight-title">Featured Program</h2>
              <p>
                A cycle program designed for kids and handled by coordinators across every chapter.
                Use the dashboard to plan events, create CodeCamps, and generate a matching Google
                Drive folder structure for each run.
              </p>
              <div className="course-meta">
                <span>
                  <CalendarDays size={16} /> Coordinated event delivery
                </span>
                <span>
                  <FolderOpen size={16} /> Auto-generated Google folder
                </span>
                <span>
                  <Users size={16} /> Admin and coordinator visibility
                </span>
              </div>
            </div>
            <aside className="course-spotlight-card">
              {spotlightEvent?.image_url ? (
                <img
                  src={spotlightEvent.image_url}
                  alt={spotlightEvent.title || 'Featured DEVCON Kids program'}
                />
              ) : (
                <div className="course-image-placeholder">
                  <ImageIcon size={40} />
                  <span>Add a program image in Events &amp; CodeCamps</span>
                </div>
              )}
              <footer className="course-spotlight-footer">
                <strong>
                  {spotlightEvent?.google_folder_name || spotlightEvent?.title || 'DEVCON Kids program'}
                </strong>
                <span
                  className={`status-badge ${
                    spotlightEvent?.status === 'Completed' ? 'status-completed' : 'status-ongoing'
                  }`}
                >
                  {spotlightEvent?.status || 'Scheduled'}
                </span>
              </footer>
            </aside>
          </section>
        )}
      </div>
    </div>
  );
}
