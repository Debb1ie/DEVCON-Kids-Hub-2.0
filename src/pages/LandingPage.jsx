import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Code, HeartHandshake } from 'lucide-react';
import './LandingPage.css';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="logo-container">
          <div className="logo-icon">{'</>'}</div>
          <h2>DEVCON <span>Kids</span></h2>
        </div>
        <button className="btn-primary login-cta" onClick={() => navigate('/login')}>
          Login to Platform
        </button>
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
      </main>

      <footer className="landing-footer">
        <p>&copy; 2026 DEVCON Kids Philippines. All rights reserved.</p>
      </footer>
    </div>
  );
}
