export function PageHeader({ title, description, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1 className="t-display">{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </header>
  );
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="notice notice-red" role="alert" style={{ marginBottom: 16 }}>
      <span style={{ flex: 1 }}>{error.message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>
          Försök igen
        </button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 4 }) {
  return (
    <div style={{ padding: 18, display: 'grid', gap: 12 }} aria-busy="true" aria-label="Laddar">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 18, width: `${90 - i * 12}%` }} />)}
    </div>
  );
}
