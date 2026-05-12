import { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import type { CloudSession } from '../lib/api';
import { pullData } from '../lib/api';

interface BookmarkEntry {
  animeId: string;
  animeTitle: string;
  animeCover: string;
  status: string;
  currentEpisode: number;
  progress: number;
}

export function BookmarksPage({ session }: { session: CloudSession }) {
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pullData(session).then((data) => {
      setBookmarks(data.bookmarks || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [session]);

  if (loading) return <div className="panel"><p className="small-text">Loading bookmarks...</p></div>;

  return (
    <>
      <div className="panel">
        <p className="section-title"><Bookmark size={18} style={{ verticalAlign: -3, marginRight: 6 }} /> Bookmarks</p>
        <p className="small-text">{bookmarks.length} anime tracked</p>
      </div>
      {bookmarks.length === 0 && (
        <div className="panel"><p className="small-text">No bookmarks synced yet.</p></div>
      )}
      {bookmarks.map((bm) => (
        <div key={bm.animeId} className="bookmark-card">
          {bm.animeCover ? (
            <img src={bm.animeCover} alt={bm.animeTitle} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div style={{ width: 56, height: 80, borderRadius: 6, background: 'var(--border)', flexShrink: 0 }} />
          )}
          <div className="bookmark-info">
            <h4>{bm.animeTitle || 'Unknown'}</h4>
            <p>Episode {bm.currentEpisode || 1} • {bm.progress || 0}%</p>
            <span className={`status-pill status-${bm.status || 'Planned'}`} style={{ marginTop: 6, display: 'inline-block' }}>
              {bm.status || 'Planned'}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
