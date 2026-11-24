const destinations = [
  ["/", "Kịch bản"],
  ["/content", "Quản lý nội dung"],
  ["/remote", "Remote Control"],
  ["/scanner", "Scan YouTube"],
];

export function Navigation({ current }) {
  return (
    <nav className="site-nav" aria-label="Điều hướng chính">
      <div className="nav-inner">
        <a className="site-brand" href="/">
          <i aria-hidden="true" />
          Workflow Studio
        </a>
        <div className="site-links">
          {destinations.map(([url, label]) => (
            <a
              key={url}
              href={url}
              aria-current={url === current ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

export function PageHeader({ title, description, children }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function Field({ label, children }) {
  return (
    <label className="dashboard-field">
      {label}
      {children}
    </label>
  );
}
