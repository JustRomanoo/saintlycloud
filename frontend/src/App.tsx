import { useState, useEffect, useCallback } from 'react';
import { AuthPage } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { BookmarksPage } from './pages/Bookmarks';
import { SyncSettingsPage } from './pages/SyncSettings';
import { DevicesPage } from './pages/Devices';
import { StatsPage } from './pages/Stats';
import { RecoveryPage } from './pages/Recovery';
import { OAuthCallback } from './pages/OAuthCallback';
import { Sidebar } from './components/Sidebar';
import type { CloudSession } from './lib/api';
import { getDevices } from './lib/api';

const navItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'sync', label: 'Sync Settings' },
  { id: 'devices', label: 'Devices' },
  { id: 'stats', label: 'Stats' },
  { id: 'recovery', label: 'Recovery' },
] as const;

export default function App() {
  const [session, setSession] = useState<CloudSession | null>(() => {
    const saved = sessionStorage.getItem('sc_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [page, setPage] = useState('dashboard');
  const [deviceCount, setDeviceCount] = useState(0);
  const [oauthFlow, setOauthFlow] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes('access_token=')) {
      setOauthFlow(true);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    getDevices(session).then((d) => setDeviceCount(d.devices?.length || 0)).catch(() => {});
  }, [session]);

  const handleOauthDone = useCallback(() => {
    setOauthFlow(false);
    setPage('dashboard');
  }, []);

  if (oauthFlow && session) {
    return <OAuthCallback onDone={handleOauthDone} />;
  }

  if (!session) {
    return <AuthPage onAuth={(s) => { setSession(s); sessionStorage.setItem('sc_session', JSON.stringify(s)); }} />;
  }

  const handleLogout = () => {
    setSession(null);
    sessionStorage.removeItem('sc_session');
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard session={session} deviceCount={deviceCount} />;
      case 'bookmarks': return <BookmarksPage session={session} />;
      case 'sync': return <SyncSettingsPage session={session} />;
      case 'devices': return <DevicesPage session={session} />;
      case 'stats': return <StatsPage session={session} />;
      case 'recovery': return <RecoveryPage session={session} onLogout={handleLogout} />;
      default: return <Dashboard session={session} deviceCount={deviceCount} />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar items={navItems} active={page} onNavigate={setPage} session={session} onLogout={handleLogout} />
      <main className="main-panel">
        {renderPage()}
      </main>
    </div>
  );
}
