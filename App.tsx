import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ExtensionsPage from './pages/ExtensionsPage';
import CDRPage from './pages/CDRPage';
import VoicemailPage from './pages/VoicemailPage';
import Logo from './assets/logo.png';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Sidebar />
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/extensions" element={<ExtensionsPage />} />
            <Route path="/cdr" element={<CDRPage />} />
            <Route path="/voicemail" element={<VoicemailPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

function Sidebar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path ? 'active' : '';

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <Link to="/" className="logo">
          <img src={Logo} alt="GonoPBX" className="sidebar-logo" />
        </Link>
        <p className="version">v0.1.0</p>
      </div>

      <ul className="nav-links">
        <li>
          <Link to="/" className={isActive('/')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Dashboard</span>
          </Link>
        </li>

        <li>
          <Link to="/extensions" className={isActive('/extensions')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <span>Extensions</span>
          </Link>
        </li>

        <li>
          <Link to="/cdr" className={isActive('/cdr')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>Call Records</span>
          </Link>
        </li>

        <li>
          <Link to="/voicemail" className={isActive('/voicemail')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16v12H4z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>Voicemail</span>
          </Link>
        </li>
      </ul>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">A</div>
          <div className="user-details">
            <p className="user-name">Admin</p>
            <p className="user-role">System Administrator</p>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default App;
