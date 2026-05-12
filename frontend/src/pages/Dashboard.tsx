import { useState, useEffect } from 'react';
import { Copy, CheckCircle } from 'lucide-react';
import type { CloudSession } from '../lib/api';
import { getDevices, pullData, getAccountInfo } from '../lib/api';

interface DashboardProps {
  session: CloudSession;
  deviceCount: number;
}

export function Dashboard({ session, deviceCount }: DashboardProps) {
  const [copied, setCopied] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [createdAt, setCreatedAt] = useState('');

  const copyId = () => {
    navigator.clipboard.writeText(session.cloudId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    pullData(session).then((data) => {
      setBookmarkCount(data.bookmarks?.length || 0);
      setLastSync(data.updatedAt || null);
    }).catch(() => {});
    getAccountInfo(session).then((info) => {
      setCreatedAt(info.createdAt);
    }).catch(() => {});
  }, [session]);

  return (
    <>
      <div className="panel">
        <div className="panel-row">
          <div>
            <p className="section-title">Cloud Dashboard</p>
            <p className="small-text">Your SaintlyCloud sync hub</p>
          </div>
          <span className="status-pill status-Watching">Connected</span>
        </div>
      </div>

      <div className="panel">
        <p className="section-title">Cloud ID</p>
        <div className="copy-field">
          <span className="cloud-id-display">{session.cloudId}</span>
          <button className="btn btn-sm" onClick={copyId}>
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {createdAt && <p className="muted-text" style={{ marginTop: 8 }}>Created {new Date(createdAt).toLocaleDateString()}</p>}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span>Devices</span>
          <strong>{deviceCount}</strong>
        </div>
        <div className="stat-card">
          <span>Synced Bookmarks</span>
          <strong>{bookmarkCount}</strong>
        </div>
        <div className="stat-card">
          <span>Status</span>
          <strong style={{ color: 'var(--success)', fontSize: '1rem' }}>Active</strong>
        </div>
      </div>

      {lastSync && (
        <div className="panel">
          <p className="section-title">Last Sync</p>
          <p className="small-text">{new Date(lastSync).toLocaleString()}</p>
        </div>
      )}
    </>
  );
}
