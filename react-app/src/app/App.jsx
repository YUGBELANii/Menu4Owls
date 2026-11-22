import { Link, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';

function readTheme() {
  try {
    return localStorage.getItem('owlz-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('owlz-theme', theme);
    } catch {
      // Theme still works for this tab if browser storage is unavailable.
    }
  }, [theme]);

  return children({ theme, toggleTheme: () => setTheme(value => value === 'dark' ? 'light' : 'dark') });
}

function Layout({ children, theme, toggleTheme }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">O</span>
          <span>Owlz <em>Corner</em></span>
          <small>React migration preview</small>
        </Link>
        <nav aria-label="Preview navigation">
          <Link to="/">Overview</Link>
          <Link to="/admin">Admin preview</Link>
        </nav>
        <button className="theme-button" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
      </header>
      {children}
      <footer>Migration preview · Existing live website remains unchanged</footer>
    </div>
  );
}

function Overview() {
  return (
    <main className="content">
      <p className="eyebrow">FOUNDATION STAGE</p>
      <h1>A cleaner foundation for <span>Owlz Corner.</span></h1>
      <p className="intro">This isolated React application is the starting point for the gradual migration. The current storefront and admin workflows have not been replaced.</p>
      <section className="status-grid" aria-label="Migration status">
        <article><small>Frontend</small><strong>React + Vite</strong><p>Application scaffold created</p></article>
        <article><small>Database</small><strong>Supabase</strong><p>Existing project and schema preserved</p></article>
        <article><small>Production</small><strong>Unchanged</strong><p>Current website remains live</p></article>
      </section>
      <section className="next-panel">
        <h2>Next migration target</h2>
        <p>Build the shared storefront shell, then move menu rendering and cart behavior in small, testable pieces.</p>
      </section>
    </main>
  );
}

function AdminPreview() {
  return (
    <main className="content">
      <p className="eyebrow">ADMIN MIGRATION</p>
      <h1>Admin workspace</h1>
      <p className="intro">This route is a placeholder for the existing admin sections. Authentication and permissions must be integrated before any admin data is displayed.</p>
      <div className="notice">No admin data is queried or exposed by this preview.</div>
    </main>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      {({ theme, toggleTheme }) => (
        <Layout theme={theme} toggleTheme={toggleTheme}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/admin" element={<AdminPreview />} />
            <Route path="*" element={<Overview />} />
          </Routes>
        </Layout>
      )}
    </ThemeProvider>
  );
}
