export default function PageHeader({ eyebrow, title, description, scope, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {scope && <div className="scope-indicator">{scope}</div>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
