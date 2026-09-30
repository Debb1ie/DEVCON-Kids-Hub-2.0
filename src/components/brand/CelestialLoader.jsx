import './celestial.css';

/**
 * Sun (Daylight) and moon (Moonlight) loader. Both render; CSS shows the one that matches
 * body.dark-mode, so it follows the existing theme state and crossfades on theme change.
 */
export default function CelestialLoader({ size = 112, className = '' }) {
  return (
    <div className={`celestial ${className}`} style={{ '--celestial-size': `${size}px` }} aria-hidden="true">
      <div className="celestial-sun">
        <span className="celestial-halo" />
        <span className="celestial-rays">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--ray': `${i * 30}deg` }} />)}</span>
        <span className="celestial-orbit" /><span className="celestial-orbit is-slow" />
        <span className="celestial-core" />
      </div>
      <div className="celestial-moon">
        <span className="celestial-halo" />
        <span className="celestial-ring"><i /><i /></span>
        <span className="celestial-body" />
        <b style={{ left: '8%', top: '20%', animationDelay: '.6s' }} /><b style={{ right: '9%', top: '12%', animationDelay: '2s' }} /><b style={{ right: '4%', bottom: '26%', animationDelay: '3.1s' }} />
      </div>
    </div>
  );
}
