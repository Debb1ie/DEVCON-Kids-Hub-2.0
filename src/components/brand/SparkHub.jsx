import './brand.css';
/* Spark Hub symbol and lockups. Geometry is fixed on a 64 unit grid; only colors vary by tone. */
const SPARK = (cx, cy, s) => `M${cx} ${cy - s}Q${cx} ${cy} ${cx + s} ${cy}Q${cx} ${cy} ${cx} ${cy + s}Q${cx} ${cy} ${cx - s} ${cy}Q${cx} ${cy} ${cx} ${cy - s}Z`;

const TONES = {
  theme: { line: 'var(--logo-line)', hub: 'var(--logo-hub)', core: 'var(--logo-core)', node: 'var(--logo-line)' },
  reverse: { line: '#FFFFFF', hub: '#FFFFFF', core: '#5638D8', node: '#FFFFFF' },
  mono: { line: 'currentColor', hub: 'currentColor', core: null, node: 'currentColor' },
};

export function SparkHubMark({ size = 40, tone = 'theme', small = size < 28, title, className = '' }) {
  const c = TONES[tone] || TONES.theme;
  const w = small ? 8 : 7;
  const labelled = Boolean(title);
  return (
    <svg
      className={`spark-hub-mark ${className}`}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      <g stroke={c.line} strokeWidth={w} strokeLinecap="round">
        <path d="M17 11V53" />
        <path d="M27 32L47 14" />
        <path d="M27 32L47 50" />
      </g>
      <circle cx="17" cy="11" r={small ? 6 : 5.5} fill={c.node} />
      <circle cx="17" cy="53" r={small ? 6 : 5.5} fill={c.node} />
      <circle cx="47" cy="50" r={small ? 7.5 : 6.5} fill={tone === 'mono' ? 'currentColor' : '#28C6E5'} />
      <circle cx="27" cy="32" r="11" fill={c.hub} />
      {c.core && !small && <circle cx="27" cy="32" r="4" fill={c.core} />}
      <path d={SPARK(48, 13, small ? 11 : 10)} fill={tone === 'mono' ? 'currentColor' : '#FFC93C'} />
    </svg>
  );
}

/**
 * layout: 'horizontal' (DEVCON over Kids Hub), 'inline' (one line), 'stacked'
 * tone: 'theme' follows light/dark tokens, 'onDark' for cosmic or purple panels
 */
export function BrandLockup({ layout = 'horizontal', tone = 'theme', size = 40, className = '' }) {
  const markTone = tone === 'onDark' ? 'reverse' : 'theme';
  return (
    <span className={`brand-lockup is-${layout} tone-${tone} ${className}`} role="img" aria-label="DEVCON Kids Hub" style={{ '--lockup-size': `${size}px` }}>
      <SparkHubMark size={layout === 'stacked' ? size * 1.3 : size} tone={markTone} />
      {layout === 'inline' ? (
        <span className="brand-lockup-text" aria-hidden="true"><span className="brand-lockup-parent">DEVCON</span> Kids Hub</span>
      ) : (
        <span className="brand-lockup-text" aria-hidden="true">
          <span className="brand-lockup-parent">DEVCON</span>
          <span className="brand-lockup-name">Kids Hub</span>
        </span>
      )}
    </span>
  );
}
