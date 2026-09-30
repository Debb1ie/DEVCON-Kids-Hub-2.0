import './brand.css';
/* NOVA, the Kids Hub explorer. Decorative SVG built from fixed brand geometry (no user input). */
import { EYE, novaMarkup, star } from './novaMarkup';

/** Full NOVA illustration. Decorative by default; pass `title` to expose it to assistive tech. */
export function Nova({ state = 'neutral', size = 96, title, className = '' }) {
  return (
    <svg
      className={`nova ${className}`}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: novaMarkup(state) }}
    />
  );
}

/** Face cut for sizes below 40px: screen, eyes and spark only. */
export function NovaFace({ size = 32, background = '#5638D8', className = '' }) {
  return (
    <svg className={`nova-face ${className}`} viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="2" y="6" width="36" height="32" rx="14" fill={background} />
      <rect x="7" y="13" width="26" height="19" rx="9" fill="#151221" />
      <rect className="nova-eye" x="13" y="18" width="4.5" height="7" rx="2.25" fill={EYE} />
      <rect className="nova-eye" x="22.5" y="18" width="4.5" height="7" rx="2.25" fill={EYE} />
      <path d={star(20, 4, 4)} fill="#FFC93C" />
    </svg>
  );
}

/**
 * NOVA with its idle environment: glow, dotted orbit with two sparks, twinkling points.
 * Motion is CSS only and is removed under prefers-reduced-motion.
 */
export function NovaHost({ state = 'neutral', size = 118, entrance = true, className = '' }) {
  return (
    <div className={`nova-host ${entrance ? 'has-entrance' : ''} ${className}`} aria-hidden="true" style={{ '--nova-size': `${size}px` }}>
      <span className="nova-host-glow" />
      <span className="nova-host-ring"><i /><i /></span>
      <b className="nova-host-star" style={{ left: '11%', top: '19%', animationDelay: '.3s' }} />
      <b className="nova-host-star is-cyan" style={{ right: '9%', top: '15%', animationDelay: '1.7s', animationDuration: '6s' }} />
      <b className="nova-host-star is-spark" style={{ right: '13%', top: '67%', animationDelay: '2.6s', animationDuration: '7s' }} />
      <b className="nova-host-star" style={{ left: '17%', top: '76%', animationDelay: '3.4s', animationDuration: '4.2s' }} />
      <span className="nova-host-bot"><Nova state={state} size={size} /></span>
      <span className="nova-host-shadow" />
    </div>
  );
}
