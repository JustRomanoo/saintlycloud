import { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import type { CloudSession } from '../lib/api';
import { pullData, getDevices, getAccountInfo } from '../lib/api';

export function StatsPage({ session }: { session: CloudSession }) {
  const [totalAnime, setTotalAnime] = useState(0);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [totalHistory, setTotalHistory] = useState(0);
  const [deviceCount, setDeviceCount] = useState(0);
  const [createdAt, setCreatedAt] = useState('');

  useEffect(() => {
    pullData(session).then((data) => {
      const bms = data.bookmarks || [];
      setTotalAnime(bms.length);
      setTotalEpisodes(bms.reduce((sum: number, b: any) => sum + (b.currentEpisode || 0), 0));
      setTotalHistory(data.history?.length || 0);
    }).catch(() => {});
    getDevices(session).then((d) => setDeviceCount(d.devices?.length || 0)).catch(() => {});
    getAccountInfo(session).then((info) => setCreatedAt(info.createdAt)).catch(() => {});
  }, [session]);

  return (
    <>
      <div className="panel">
        <p className="section-title"><BarChart3 size={18} style={{ verticalAlign: -3, marginRight: 6 }} /> Stats</p>
        <p className="small-text">Your SaintlyCloud activity overview</p>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <span>Anime Tracked</span>
          <strong>{totalAnime}</strong>
        </div>
        <div className="stat-card">
          <span>Episodes Watched</span>
          <strong>{totalEpisodes}</strong>
        </div>
        <div className="stat-card">
          <span>History Entries</span>
          <strong>{totalHistory}</strong>
        </div>
        <div className="stat-card">
          <span>Devices</span>
          <strong>{deviceCount}</strong>
        </div>
      </div>
      {createdAt && (
        <div className="panel">
          <p className="section-title">Account Age</p>
          <p className="small-text">Created {new Date(createdAt).toLocaleDateString()}</p>
        </div>
      )}
    </>
  );
}
