import { useNavigate } from 'react-router-dom';
import { GraduationCap, Code, HeartHandshake, Cpu, LogOut, Moon, Sun } from 'lucide-react';
import { useApp } from '../context/AppState';
import './LandingPage.css';

export default function LandingPage() {
  const navigate = useNavigate();
  const { stats, isAuthenticated, logout, themeMode, toggleThemeMode } = useApp();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="logo-container">
          <div className="logo-icon">{'</>'}</div>
          <h2>DEVCON <span>Kids</span></h2>
        </div>
        <div className="landing-header-actions">
          <button type="button" className="icon-btn theme-toggle-btn" onClick={toggleThemeMode} title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {themeMode === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          {isAuthenticated ? (
            <button type="button" className="icon-btn" onClick={handleLogout} title="Logout">
              <LogOut size={20} />
            </button>
          ) : (
            <button className="btn-primary login-cta" onClick={() => navigate('/login')}>
              Login to Platform
            </button>
          )}
        </div>
      </header>

      <main className="landing-main">
        <section className="hero-section-landing">
          <div className="hero-text-content">
            <h1>Empowering the Next Generation of Filipino <span>Builders</span></h1>
            <p>
              We bring computer science education directly to students across the Philippines. 
              Join our community-driven movement to make tech accessible, fun, and equitable for children.
            </p>
            <div className="hero-buttons">
              <button className="btn-primary btn-large" onClick={() => navigate('/login')}>
                Access Dashboard
              </button>
              <button className="btn-secondary btn-large">
                Learn More
              </button>
            </div>
          </div>
          <div className="hero-visual">
            <div className="floating-card card-1">
              <GraduationCap size={32} color="var(--accent-green)" />
              <div className="card-info">
                <h4>12,450+</h4>
                <p>Learners Reached</p>
              </div>
            </div>
            <div className="floating-card card-2">
              <Code size={32} color="var(--primary-purple)" />
              <div className="card-info">
                <h4>140+</h4>
                <p>Workshops</p>
              </div>
            </div>
            <div className="floating-card card-3">
              <HeartHandshake size={32} color="var(--accent-yellow)" />
              <div className="card-info">
                <h4>850+</h4>
                <p>Volunteers</p>
              </div>
            </div>
            <div className="floating-card card-4">
              <Cpu size={32} color="var(--primary-purple)" />
              <div className="card-info">
                <h4>{stats.hourOfAIStudents ?? 0}</h4>
                <p>Hour of AI Students</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mission-section">
          <div className="mission-header">
            <h2>Our Core Pillars</h2>
            <p>Everything we do is guided by these principles.</p>
          </div>
          <div className="pillars-grid">
            <div className="pillar-card card">
              <div className="pillar-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
                <span style={{ color: 'var(--primary-purple)' }}>Content</span>
              </div>
              <h3>Learning</h3>
              <p>Providing high-quality, engaging curriculum that makes coding fun.</p>
            </div>
            <div className="pillar-card card">
              <div className="pillar-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                <span style={{ color: 'var(--accent-green)' }}>Code</span>
              </div>
              <h3>Innovation</h3>
              <p>Encouraging creativity and problem-solving through hands-on projects.</p>
            </div>
            <div className="pillar-card card">
              <div className="pillar-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
                <span style={{ color: 'var(--accent-yellow)' }}>Cause</span>
              </div>
              <h3>Development</h3>
              <p>Reaching underserved communities and promoting equitable access.</p>
            </div>
          </div>
        </section>

        <section className="programs-section">
          <div className="mission-header">
            <h2>What We Do</h2>
            <p>Programs that inspire, enable, and empower children.</p>
          </div>
          <div className="programs-grid">
            <div className="program-card card">
              <div className="program-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.08)' }}>
                Code Camps
              </div>
              <h3>Code Camps</h3>
              <p>Hands-on camps for ages 9-15, covering robotics, games, and apps.</p>
            </div>

            <div className="program-card card">
              <div className="program-icon" style={{ backgroundColor: 'rgba(99, 102, 241, 0.08)' }}>
                Discovery
              </div>
              <h3>Discovery Expos</h3>
              <p>Short CS festivals that bring tech to K-12 students.</p>
            </div>

            <div className="program-card card">
              <div className="program-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
                AI
              </div>
              <h3>Hour of AI</h3>
              <p>Introductory AI activities and lessons that introduce children to AI concepts.</p>
              <a className="program-cta btn-primary" href="https://www.devconkids.org" target="_blank" rel="noopener noreferrer">Learn More</a>
            </div>

            <div className="program-card card">
              <div className="program-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
                Train
              </div>
              <h3>Lead Learner Workshops</h3>
              <p>Educator training to help scale and sustain programs.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>&copy; 2026 DEVCON Kids Philippines. All rights reserved.</p>
      </footer>
    </div>
  );
}