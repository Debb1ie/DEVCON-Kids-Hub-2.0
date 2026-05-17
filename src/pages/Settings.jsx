import React from 'react';
import { useApp } from '../context/AppState';
import { Palette, Sparkles, BellRing, RefreshCcw, MoonStar, SunMedium, PanelTop } from 'lucide-react';
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
      <div className="settings-page-hero card">
        <div>
          <div className="eyebrow">
            <Palette size={14} /> Workspace settings
          </div>
          <h1>Dashboard Settings</h1>
          <p>Adjust the dashboard layout, theme, and the controls that stay visible by default.</p>
        </div>

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
      </div>

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
                type="checkbox"
                checked={dashboardSettings.compactCards}
                onChange={(e) => updateDashboardSetting('compactCards', e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <div>
                <strong>Show growth chart</strong>
                <span>Keep the impact chart visible on the dashboard.</span>
              </div>
              <input
                type="checkbox"
                checked={dashboardSettings.showGrowthChart}
                onChange={(e) => updateDashboardSetting('showGrowthChart', e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <div>
                <strong>Show chapter overview</strong>
                <span>Display the chapter performance list.</span>
              </div>
              <input
                type="checkbox"
                checked={dashboardSettings.showChapterOverview}
                onChange={(e) => updateDashboardSetting('showChapterOverview', e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <div>
                <strong>Show course spotlight</strong>
                <span>Keep the Hour of AI spotlight visible.</span>
              </div>
              <input
                type="checkbox"
                checked={dashboardSettings.showCourseSpotlight}
                onChange={(e) => updateDashboardSetting('showCourseSpotlight', e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <div>
                <strong>Show quick actions</strong>
                <span>Keep the dashboard action buttons visible.</span>
              </div>
              <input
                type="checkbox"
                checked={dashboardSettings.showQuickActions}
                onChange={(e) => updateDashboardSetting('showQuickActions', e.target.checked)}
              />
            </label>
          </div>
        </section>

        <section className="card settings-panel">
          <div className="section-head">
            <h2>Live Summary</h2>
            <span className="section-note">Saved locally</span>
          </div>

          <div className="summary-list">
            <div><strong>Theme</strong><span>{themeMode}</span></div>
            <div><strong>Compact cards</strong><span>{dashboardSettings.compactCards ? 'On' : 'Off'}</span></div>
            <div><strong>Growth chart</strong><span>{dashboardSettings.showGrowthChart ? 'Visible' : 'Hidden'}</span></div>
            <div><strong>Chapter overview</strong><span>{dashboardSettings.showChapterOverview ? 'Visible' : 'Hidden'}</span></div>
            <div><strong>Course spotlight</strong><span>{dashboardSettings.showCourseSpotlight ? 'Visible' : 'Hidden'}</span></div>
            <div><strong>Quick actions</strong><span>{dashboardSettings.showQuickActions ? 'Visible' : 'Hidden'}</span></div>
          </div>

          <button type="button" className="btn-secondary reset-dashboard-btn" onClick={resetDashboardSettings}>
            <RefreshCcw size={16} />
            Reset dashboard defaults
          </button>
        </section>
      </div>
    </div>
  );
}