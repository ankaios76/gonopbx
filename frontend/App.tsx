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

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <Link to="/">
            <img
              src={Logo}
              alt="GonoPBX"
              className="sidebar-logo"
            />
          </Link>
        </div>
      </div>

      <ul className="nav-links">
        <li>
          <Link to="/" className={isActive('/')}>
            <span>Dashboard</span>
          </Link>
        </li>

        <li>
          <Link to="/extensions" className={isActive('/extensions')}>
            <span>Extensions</span>
          </Link>
        </li>

        <li>
          <Link to="/cdr" className={isActive('/cdr')}>
            <span>Call Records</span>
          </Link>
        </li>

        <li>
          <Link to="/voicemail" className={isActive('/voicemail')}>
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

        <p className="sidebar-version">v0.1.0</p>
      </div>
    </nav>
  );
}

export default App;
