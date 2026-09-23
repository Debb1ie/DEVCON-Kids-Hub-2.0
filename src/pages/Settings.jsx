import { useApp } from '../context/AppState';
import { Sparkles, BellRing, RefreshCcw, MoonStar, SunMedium, PanelTop } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import './Settings.css';

export default function Settings() {
  const {
    user,
    themeMode,
    setThemeMode,
    dashboardSettings,
    updateDashboardSetting,
    resetDashboardSettings
  } = useApp();

  const activeSettingsCount = [
    dashboardSettings.showCourseSpotlight,
    dashboardSettings.showGrowthChart,
    dashboardSettings.showChapterOverview,
    dashboardSettings.showQuickActions,
    dashboardSettings.compactCards
  ].filter(Boolean).length;

  return (
    <div className="settings-page">
      <PageHeader
        eyebrow="Workspace settings"
        title="Dashboard Settings"
        description="Adjust the dashboard layout, theme, and the controls that stay visible by default."
        actions={
          <div className="settings-page-hero-meta">
            <div className="meta-pill">
              <Sparkles size={16} />
              <span>{activeSettingsCount} dashboard options active</span>
            </div>
            <div className="meta-pill">
              <BellRing size={16} />
              <span>{user?.role || 'Visitor'} access</span>
            </div>
          </div>
        }
      />

      <div className="settings-page-grid">
        <section className="card settings-panel">
          <div className="section-head">
            <h2>Appearance</h2>
            <span className="section-note">Shared across the app</span>
          </div>

          <div className="theme-switcher">
            <button
              type="button"
              className={`theme-chip ${themeMode === 'light' ? 'active' : ''}`}
              onClick={() => setThemeMode('light')}
            >
              <SunMedium size={18} />
              Light
            </button>
            <button
              type="button"
              className={`theme-chip ${themeMode === 'dark' ? 'active' : ''}`}
              onClick={() => setThemeMode('dark')}
            >
              <MoonStar size={18} />
              Dark
            </button>
          </div>

          <div className="preview-box">
            <PanelTop size={20} />
            <div>
              <strong>Current theme</strong>
              <p>{themeMode === 'dark' ? 'Dark mode is active.' : 'Light mode is active.'}</p>
            </div>
          </div>
        </section>

        <section className="card settings-panel">
          <div className="section-head">
            <h2>Dashboard Layout</h2>
            <span className="section-note">Updates the dashboard immediately</span>
          </div>

          <div className="settings-toggles">
            <label className="toggle-row">
              <div>
                <strong>Compact cards</strong>
                <span>Reduce card padding for denser views.</span>
              </div>
              <input
                id="setting-compact-cards"
                type="checkbox"
                checked={dashboardSettings.compactCards}
                onChange={(e) => updateDashboardSetting('compactCards', e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <div>
                <strong>Chapter overview</strong>
                <span>Keep chapter location metrics visible.</span>
              </div>
              <input
                id="setting-show-chapters"
                type="checkbox"
                checked={dashboardSettings.showChapterOverview}
                onChange={(e) => updateDashboardSetting('showChapterOverview', e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <div>
                <strong>Growth chart</strong>
                <span>Show cumulative program reach over time.</span>
              </div>
              <input
                id="setting-show-growth"
                type="checkbox"
                checked={dashboardSettings.showGrowthChart}
                onChange={(e) => updateDashboardSetting('showGrowthChart', e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <div>
                <strong>Featured workshops</strong>
                <span>Keep spotlight programs on the dashboard.</span>
              </div>
              <input
                id="setting-show-spotlight"
                type="checkbox"
                checked={dashboardSettings.showCourseSpotlight}
                onChange={(e) => updateDashboardSetting('showCourseSpotlight', e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <div>
                <strong>Quick actions</strong>
                <span>Direct navigation to high-frequency admin actions.</span>
              </div>
              <input
                id="setting-show-actions"
                type="checkbox"
                checked={dashboardSettings.showQuickActions}
                onChange={(e) => updateDashboardSetting('showQuickActions', e.target.checked)}
              />
            </label>
          </div>
        </section>

        <section className="card settings-panel">
          <div className="section-head">
            <h2>Summary &amp; Reset</h2>
            <span className="section-note">Safe to restore</span>
          </div>

          <div className="summary-list">
            <div className="summary-row">
              <span>Selected theme</span>
              <strong>{themeMode === 'dark' ? 'Dark' : 'Light'}</strong>
            </div>
            <div className="summary-row">
              <span>Compact cards</span>
              <strong>{dashboardSettings.compactCards ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div className="summary-row">
              <span>Chapter cards</span>
              <strong>{dashboardSettings.showChapterOverview ? 'Visible' : 'Hidden'}</strong>
            </div>
            <div className="summary-row">
              <span>Growth chart</span>
              <strong>{dashboardSettings.showGrowthChart ? 'Visible' : 'Hidden'}</strong>
            </div>
            <div className="summary-row">
              <span>Featured workshops</span>
              <strong>{dashboardSettings.showCourseSpotlight ? 'Visible' : 'Hidden'}</strong>
            </div>
            <div className="summary-row">
              <span>Quick actions</span>
              <strong>{dashboardSettings.showQuickActions ? 'Visible' : 'Hidden'}</strong>
            </div>
          </div>

          <button
            type="button"
            className="btn-secondary reset-button"
            onClick={resetDashboardSettings}
          >
            <RefreshCcw size={16} /> Reset dashboard to default
          </button>
        </section>
      </div>
    </div>
  );
}
