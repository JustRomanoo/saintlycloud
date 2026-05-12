import { Cloud, LogOut } from 'lucide-react';
import type { CloudSession } from '../lib/api';

interface SidebarProps {
  items: readonly { id: string; label: string }[];
  active: string;
  onNavigate: (id: string) => void;
  session: CloudSession;
  onLogout: () => void;
}

export function Sidebar({ items, active, onNavigate, session, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo"><Cloud size={18} style={{ marginRight: 6, verticalAlign: -2 }} /> SaintlyCloud</div>
      {items.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${active === item.id ? 'active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          {item.label}
        </button>
      ))}
      <div className="sidebar-footer">
        <div className="small-text" style={{ padding: '0 12px', fontSize: '0.7rem', wordBreak: 'break-all' }}>
          {session.cloudId}
        </div>
        <button className="nav-item" onClick={onLogout} style={{ color: 'var(--danger)' }}>
          <LogOut size={16} /> Disconnect
        </button>
      </div>
    </aside>
  );
}
