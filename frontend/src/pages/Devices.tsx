import { useState, useEffect } from 'react';
import { Smartphone, Trash2, Edit2, Check, X } from 'lucide-react';
import type { CloudSession, Device } from '../lib/api';
import { getDevices, removeDevice, renameDevice } from '../lib/api';

export function DevicesPage({ session }: { session: CloudSession }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = () => {
    getDevices(session).then((d) => setDevices(d.devices || [])).catch(() => {});
  };

  useEffect(load, [session]);

  const handleRemove = async (deviceId: string) => {
    try {
      await removeDevice(session, deviceId);
      load();
    } catch {}
  };

  const handleRename = async (deviceId: string) => {
    if (!editName.trim()) return;
    try {
      await renameDevice(session, deviceId, editName.trim());
      setEditingId(null);
      load();
    } catch {}
  };

  return (
    <>
      <div className="panel">
        <p className="section-title"><Smartphone size={18} style={{ verticalAlign: -3, marginRight: 6 }} /> Devices</p>
        <p className="small-text">{devices.length} device(s) linked to your account</p>
      </div>
      {devices.length === 0 && (
        <div className="panel"><p className="small-text">No devices linked yet.</p></div>
      )}
      {devices.map((device) => (
        <div key={device.deviceId} className="device-card">
          <div className="device-info">
            {editingId === device.deviceId ? (
              <div className="filter-group">
                <input className="input-field" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ maxWidth: 200, padding: '6px 10px', fontSize: '0.82rem' }} />
                <button className="btn btn-sm btn-primary" onClick={() => handleRename(device.deviceId)}><Check size={14} /></button>
                <button className="btn btn-sm" onClick={() => setEditingId(null)}><X size={14} /></button>
              </div>
            ) : (
              <>
                <h4>{device.name}</h4>
                <p>ID: {device.deviceId.slice(0, 12)}... • Last active: {new Date(device.lastActive).toLocaleDateString()}</p>
              </>
            )}
          </div>
          <div className="filter-group">
            {editingId !== device.deviceId && (
              <button className="btn btn-sm" onClick={() => { setEditingId(device.deviceId); setEditName(device.name); }}>
                <Edit2 size={14} />
              </button>
            )}
            <button className="btn btn-sm btn-danger" onClick={() => handleRemove(device.deviceId)}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
