import './EmptyState.css';

/**
 * Reusable per-section empty state.
 * Use inside any page section when data is absent.
 *
 * Props:
 *   icon        {ElementType} Lucide icon component (e.g. Package).
 *   title       {string}     Required. Short heading text.
 *   description {string}     Optional. Supporting copy.
 *   actions     {ReactNode}  Optional. Button(s) or Link(s) for next steps.
 *   size        {'md'|'sm'}  'md' (default) or 'sm' for compact inline use.
 */
export default function EmptyState({ icon, title, description, actions, size = 'md' }) {
  const Icon = icon;

  return (
    <div
      className={`empty-state empty-state--${size}`}
      role="status"
      aria-label={title}
    >
      {Icon && (
        <span className="empty-state-icon" aria-hidden="true">
          <Icon aria-hidden="true" />
        </span>
      )}

      <div className="empty-state-copy">
        <p className="empty-state-title">{title}</p>
        {description && (
          <p className="empty-state-description">{description}</p>
        )}
      </div>

      {actions && (
        <div className="empty-state-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
