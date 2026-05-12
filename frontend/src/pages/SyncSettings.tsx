import { useState, useEffect } from 'react';
import { Upload, Download, CheckCircle } from 'lucide-react';
import type { CloudSession } from '../lib/api';
import { pushData, pullData } from '../lib/api';

export function SyncSettingsPage({ session }: { session: CloudSession }) {
  const [syncBookmarks, setSyncBookmarks] = useState(true);
  const [syncHistory, setSyncHistory] = useState(true);
  const [syncProfile, setSyncProfile] = useState(true);
  const [lastResult, setLastResult] = useState('');
  const [lastError, setLastError] = useState('');

  const handlePush = async () => {
    setLastResult('');
    setLastError('');
    try {
      const data: any = {};
      if (syncBookmarks) data.bookmarks = [];
      if (syncHistory) data.history = [];
      if (syncProfile) data.profile = {};
      await pushData(session, data);
      setLastResult('Data synced successfully');
    } catch (err: any) {
      setLastError(err.message);
    }
  };

  const handlePull = async () => {
    setLastResult('');
    setLastError('');
    try {
      const data = await pullData(session);
      setLastResult(`Pulled ${data.bookmarks?.length || 0} bookmarks, ${data.history?.length || 0} history entries`);
    } catch (err: any) {
      setLastError(err.message);
    }
  };

  return (
    <>
      <div className="panel">
        <p className="section-title">Sync Settings</p>
        <p className="small-text">Control what data is synced to SaintlyCloud.</p>
      </div>

      <div className="panel">
        <p className="section-title">Sync Toggles</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="filter-group" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={syncBookmarks} onChange={(e) => setSyncBookmarks(e.target.checked)} />
            <span className="small-text">Sync bookmarks</span>
          </label>
          <label className="filter-group" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={syncHistory} onChange={(e) => setSyncHistory(e.target.checked)} />
            <span className="small-text">Sync watch history</span>
          </label>
          <label className="filter-group" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={syncProfile} onChange={(e) => setSyncProfile(e.target.checked)} />
            <span className="small-text">Sync profile</span>
          </label>
        </div>
      </div>

      <div className="panel">
        <p className="section-title">Actions</p>
        <div className="filter-group">
          <button className="btn btn-primary" onClick={handlePush}>
            <Upload size={16} /> Push to Cloud
          </button>
          <button className="btn" onClick={handlePull}>
            <Download size={16} /> Pull from Cloud
          </button>
        </div>
        {lastResult && (
          <div className="success-box" style={{ marginTop: 12 }}>
            <p><CheckCircle size={14} style={{ verticalAlign: -2 }} /> {lastResult}</p>
          </div>
        )}
        {lastError && (
          <div className="warning-box" style={{ marginTop: 12 }}>
            <p>{lastError}</p>
          </div>
        )}
      </div>
    </>
  );
}
