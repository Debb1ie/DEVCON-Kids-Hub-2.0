import './atmosphere.css';

// Deterministic positions so the composition is identical on every render.
const SPECKS = [[48, 30, 16, -3], [62, 52, 21, -9], [71, 22, 14, -1], [80, 44, 19, -13], [88, 28, 24, -6], [56, 64, 17, -16], [93, 58, 15, -4], [67, 38, 22, -18], [76, 66, 18, -8], [84, 16, 20, -11], [97, 36, 16, -2]];
const STARS = [[42, 12, 6, -1], [50, 40, 8, -4], [58, 18, 5, -2], [63, 58, 7, -6], [69, 8, 9, -3], [73, 34, 6, -8], [78, 50, 8, -5], [82, 14, 7, -9], [86, 62, 5, -1], [89, 30, 8, -7], [92, 8, 6, -4], [95, 46, 7, -2], [66, 70, 9, -6], [54, 26, 6, -3], [98, 20, 8, -5], [46, 60, 7, -9], [75, 4, 6, -7], [91, 70, 9, -1]];

/**
 * Decorative header atmosphere: Daylight sunrise glow, arcs and rising specks; Moonlight haze,
 * orbit arcs and drifting stars. Theme is picked up from body.dark-mode by CSS, so it follows
 * the existing theme state. It sits behind content (z-index -1), never takes layout space and
 * is hidden from assistive technology. `quiet` lowers intensity on data-dense pages.
 */
export default function HeaderAtmosphere({ quiet = false, className = '' }) {
  return (
    <div className={`header-atmosphere ${quiet ? 'is-quiet' : ''} ${className}`} aria-hidden="true">
      <div className="atmo-day">
        <span className="atmo-glow" />
        <span className="atmo-arc" />
        <span className="atmo-arc is-outer" />
        {SPECKS.map(([x, y, d, dl], i) => (
          <span key={i} className={`atmo-speck ${i % 4 === 3 ? 'is-lavender' : ''}`} style={{ left: `${x}%`, top: `${y}%`, '--atmo-d': `${d}s`, '--atmo-dl': `${dl}s` }} />
        ))}
      </div>
      <div className="atmo-night">
        <span className="atmo-glow" />
        <span className="atmo-orbit"><i /></span>
        <span className="atmo-orbit is-outer" />
        {STARS.map(([x, y, d, dl], i) => (
          <span key={i} className={`atmo-star ${i % 5 === 2 ? 'is-bright' : ''}`} style={{ left: `${x}%`, top: `${y}%`, '--atmo-d': `${d}s`, '--atmo-dl': `${dl}s` }} />
        ))}
      </div>
    </div>
  );
}
